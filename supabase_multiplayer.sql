-- ==============================================================================
-- PIUCCIA GAMES - MULTIPLAYER ONLINE SCOPA
-- Esegui nel SQL Editor di Supabase. Idempotente.
-- ==============================================================================

-- Stato pubblico: leggibile dai due partecipanti, nessun segreto dentro
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL DEFAULT 'scopa',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
    turn_seat SMALLINT NOT NULL CHECK (turn_seat IN (1, 2)),
    turn_deadline TIMESTAMPTZ,
    public_state JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    winner_seat SMALLINT CHECK (winner_seat IN (1, 2)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT different_players CHECK (player_a <> player_b)
);

CREATE INDEX IF NOT EXISTS game_sessions_players_idx
ON public.game_sessions (player_a, player_b, status);

-- Mano di un giocatore: ognuno legge solo la propria riga
CREATE TABLE IF NOT EXISTS public.game_session_hands (
    session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seat SMALLINT NOT NULL CHECK (seat IN (1, 2)),
    hand JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (session_id, user_id),
    CONSTRAINT unique_session_seat UNIQUE (session_id, seat)
);

-- Stato completo del motore: nessuno può leggerlo tranne il service role
CREATE TABLE IF NOT EXISTS public.game_session_secrets (
    session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    state JSONB NOT NULL
);

-- Collegamento invito -> partita creata
ALTER TABLE public.game_invites
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.game_sessions(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_secrets ENABLE ROW LEVEL SECURITY;

-- I partecipanti leggono lo stato pubblico. Nessuna policy di scrittura:
-- scrive solo il service role, che salta comunque le policy.
DROP POLICY IF EXISTS "Lettura sessione dei partecipanti" ON public.game_sessions;
CREATE POLICY "Lettura sessione dei partecipanti"
ON public.game_sessions FOR SELECT
USING (auth.uid() = player_a OR auth.uid() = player_b);

-- Ognuno vede solo la propria mano
DROP POLICY IF EXISTS "Lettura della propria mano" ON public.game_session_hands;
CREATE POLICY "Lettura della propria mano"
ON public.game_session_hands FOR SELECT
USING (auth.uid() = user_id);

-- game_session_secrets resta senza alcuna policy: con RLS attivo e zero
-- policy, nessun ruolo applicativo può leggerla.

-- Realtime sullo stato pubblico
-- Guarda l'aggiunta alla publication per evitare errori di idempotenza:
-- ALTER PUBLICATION non ha IF NOT EXISTS, quindi il secondo invio fallirebbe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'game_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'game_invites'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;
    END IF;
END $$;

-- ------------------------------------------------------------------
-- Scrittura atomica di una mossa
-- ------------------------------------------------------------------
-- Aggiorna sessione, segreto e le due mani in un'unica transazione.
-- Ritorna la nuova version, oppure -1 se la version attesa non coincide.
CREATE OR REPLACE FUNCTION public.apply_scopa_move(
    p_session_id UUID,
    p_expected_version INT,
    p_public_state JSONB,
    p_secret_state JSONB,
    p_turn_seat SMALLINT,
    p_turn_deadline TIMESTAMPTZ,
    p_status TEXT,
    p_winner_seat SMALLINT,
    p_hand_a JSONB,
    p_hand_b JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_version INT;
BEGIN
    UPDATE game_sessions
    SET public_state  = p_public_state,
        turn_seat     = p_turn_seat,
        turn_deadline = p_turn_deadline,
        status        = p_status,
        winner_seat   = p_winner_seat,
        version       = version + 1,
        updated_at    = now()
    WHERE id = p_session_id
      AND version = p_expected_version
    RETURNING version INTO v_new_version;

    IF v_new_version IS NULL THEN
        RETURN -1;
    END IF;

    UPDATE game_session_secrets SET state = p_secret_state WHERE session_id = p_session_id;

    UPDATE game_session_hands SET hand = p_hand_a WHERE session_id = p_session_id AND seat = 1;
    UPDATE game_session_hands SET hand = p_hand_b WHERE session_id = p_session_id AND seat = 2;

    RETURN v_new_version;
END;
$$;

-- Revoca il grant automatico su PUBLIC e consenti solo al service role
-- (che esegue da Edge Function). L'RPC non ha autorizzazione interna:
-- le verifiche di autorità stanno nell'Edge Function.
REVOKE EXECUTE ON FUNCTION public.apply_scopa_move(
    UUID, INT, JSONB, JSONB, SMALLINT, TIMESTAMPTZ, TEXT, SMALLINT, JSONB, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_scopa_move(
    UUID, INT, JSONB, JSONB, SMALLINT, TIMESTAMPTZ, TEXT, SMALLINT, JSONB, JSONB
) TO service_role;
