-- ==============================================================================
-- PIUCCIA GAMES - FIX AMICIZIE (friend requests / friendships)
-- ==============================================================================
-- Esegui TUTTO questo script nel SQL Editor di Supabase (Dashboard > SQL Editor
-- > New query > incolla > Run). È idempotente: puoi rieseguirlo senza problemi.
--
-- Cosa risolve:
--  1. L'accettazione di una richiesta creava le due righe di amicizia con un
--     upsert senza target di conflitto: se una riga esisteva già (es. inserita a
--     mano dal dashboard) l'INSERT falliva con 23505 e NESSUNA delle due righe
--     veniva creata. L'errore veniva ignorato dal client -> "accettato ma non
--     compare tra gli amici".
--  2. Le righe in friend_requests non venivano mai eliminate: il vincolo
--     UNIQUE (sender_id, receiver_id) impediva per sempre di rinviare una
--     richiesta ("Richiesta già inviata o esistente") anche dopo rifiuto o
--     rimozione dell'amicizia.
--  3. removeFriend cancellava solo la propria riga (RLS DELETE su user_id):
--     l'altro utente restava con l'amicizia a metà.
--  4. La policy di INSERT su friendships permetteva a chiunque di inserirsi
--     nella lista amici di un altro utente.
-- ==============================================================================

-- ------------------------------------------------------------------
-- 1. RIPARAZIONE DEI DATI ESISTENTI
-- ------------------------------------------------------------------

-- 1a. Le richieste già "accepted" diventano amicizie vere (entrambe le direzioni)
INSERT INTO public.friendships (user_id, friend_id)
SELECT r.sender_id, r.receiver_id FROM public.friend_requests r WHERE r.status = 'accepted'
ON CONFLICT DO NOTHING;

INSERT INTO public.friendships (user_id, friend_id)
SELECT r.receiver_id, r.sender_id FROM public.friend_requests r WHERE r.status = 'accepted'
ON CONFLICT DO NOTHING;

-- 1b. Amicizie a senso unico -> rendile bidirezionali
INSERT INTO public.friendships (user_id, friend_id)
SELECT f.friend_id, f.user_id
FROM public.friendships f
WHERE NOT EXISTS (
    SELECT 1 FROM public.friendships g
    WHERE g.user_id = f.friend_id AND g.friend_id = f.user_id
)
ON CONFLICT DO NOTHING;

-- 1c. Rimuovi le richieste ormai concluse, così si può rinviare una richiesta
DELETE FROM public.friend_requests WHERE status IN ('accepted', 'rejected');

-- 1d. Rimuovi eventuali richieste pendenti fra utenti già amici
DELETE FROM public.friend_requests r
WHERE EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.user_id = r.sender_id AND f.friend_id = r.receiver_id
);

-- ------------------------------------------------------------------
-- 2. POLICY RLS CORRETTE
-- ------------------------------------------------------------------

-- Vedi le amicizie in cui compari (la riga speculare esiste sempre, ma così
-- anche eventuali disallineamenti restano visibili e riparabili)
DROP POLICY IF EXISTS "Lettura amicizie personali" ON public.friendships;
CREATE POLICY "Lettura amicizie personali"
ON public.friendships FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Puoi inserire SOLO righe tue (prima chiunque poteva infilarsi negli amici
-- altrui). Le righe speculari le crea la funzione accept_friend_request.
DROP POLICY IF EXISTS "Creazione amicizia" ON public.friendships;
CREATE POLICY "Creazione amicizia"
ON public.friendships FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eliminazione amicizia" ON public.friendships;
CREATE POLICY "Eliminazione amicizia"
ON public.friendships FOR DELETE
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ------------------------------------------------------------------
-- 3. FUNZIONI RPC ATOMICHE (SECURITY DEFINER)
-- ------------------------------------------------------------------

-- 3a. Invio richiesta di amicizia.
-- Ritorna: 'sent' | 'accepted' (c'era già una richiesta inversa) | 'already_friends'
CREATE OR REPLACE FUNCTION public.send_friend_request(target_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    me UUID := auth.uid();
    reverse_req UUID;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF me = target_user_id THEN
        RAISE EXCEPTION 'self_request';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    -- Già amici: assicura solo che entrambe le righe esistano
    IF EXISTS (
        SELECT 1 FROM friendships
        WHERE (user_id = me AND friend_id = target_user_id)
           OR (user_id = target_user_id AND friend_id = me)
    ) THEN
        INSERT INTO friendships (user_id, friend_id)
        VALUES (me, target_user_id), (target_user_id, me)
        ON CONFLICT DO NOTHING;

        DELETE FROM friend_requests
        WHERE (sender_id = me AND receiver_id = target_user_id)
           OR (sender_id = target_user_id AND receiver_id = me);

        RETURN 'already_friends';
    END IF;

    -- L'altro ci aveva già inviato una richiesta: diventiamo amici subito
    SELECT id INTO reverse_req
    FROM friend_requests
    WHERE sender_id = target_user_id AND receiver_id = me AND status = 'pending'
    LIMIT 1;

    IF reverse_req IS NOT NULL THEN
        INSERT INTO friendships (user_id, friend_id)
        VALUES (me, target_user_id), (target_user_id, me)
        ON CONFLICT DO NOTHING;

        DELETE FROM friend_requests
        WHERE (sender_id = me AND receiver_id = target_user_id)
           OR (sender_id = target_user_id AND receiver_id = me);

        RETURN 'accepted';
    END IF;

    -- Richiesta normale: riusa la riga se esiste già (evita il 23505)
    INSERT INTO friend_requests (sender_id, receiver_id, status, created_at, updated_at)
    VALUES (me, target_user_id, 'pending', now(), now())
    ON CONFLICT (sender_id, receiver_id)
    DO UPDATE SET status = 'pending', updated_at = now();

    RETURN 'sent';
END;
$$;

-- 3b. Accettazione: crea ENTRAMBE le righe di amicizia e cancella la richiesta.
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    me UUID := auth.uid();
    req RECORD;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO req FROM friend_requests WHERE id = request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;
    IF req.receiver_id <> me THEN
        RAISE EXCEPTION 'not_your_request';
    END IF;

    INSERT INTO friendships (user_id, friend_id)
    VALUES (req.receiver_id, req.sender_id), (req.sender_id, req.receiver_id)
    ON CONFLICT DO NOTHING;

    DELETE FROM friend_requests
    WHERE (sender_id = req.sender_id AND receiver_id = req.receiver_id)
       OR (sender_id = req.receiver_id AND receiver_id = req.sender_id);

    RETURN 'ok';
END;
$$;

-- 3c. Rifiuto / annullamento: elimina la riga, così si può riprovare in futuro.
CREATE OR REPLACE FUNCTION public.decline_friend_request(request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    me UUID := auth.uid();
    deleted INT;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    DELETE FROM friend_requests
    WHERE id = request_id AND (receiver_id = me OR sender_id = me);

    GET DIAGNOSTICS deleted = ROW_COUNT;
    IF deleted = 0 THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;

    RETURN 'ok';
END;
$$;

-- 3d. Rimozione amico: elimina entrambe le direzioni + eventuali richieste.
CREATE OR REPLACE FUNCTION public.remove_friend(other_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    me UUID := auth.uid();
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    DELETE FROM friendships
    WHERE (user_id = me AND friend_id = other_user_id)
       OR (user_id = other_user_id AND friend_id = me);

    DELETE FROM friend_requests
    WHERE (sender_id = me AND receiver_id = other_user_id)
       OR (sender_id = other_user_id AND receiver_id = me);

    RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(UUID)          TO authenticated;

-- ------------------------------------------------------------------
-- 4. CONTROLLO FINALE (deve mostrare 2 righe per ogni coppia di amici)
-- ------------------------------------------------------------------
SELECT p1.username AS utente, p2.username AS amico, f.created_at
FROM public.friendships f
JOIN public.profiles p1 ON p1.id = f.user_id
JOIN public.profiles p2 ON p2.id = f.friend_id
ORDER BY f.created_at DESC;
