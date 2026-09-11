-- ==============================================================================
-- PIUCCIA GAMES - SUPABASE DATABASE SCHEMA & POLICIES
-- ==============================================================================
-- Esegui questo script nel tuo Supabase Dashboard:
-- 1. Vai su https://supabase.com/dashboard
-- 2. Apri il tuo progetto
-- 3. Clicca su "SQL Editor" nel menu a sinistra
-- 4. Clicca su "New query", incolla tutto questo codice e premi "Run" (▶️)
-- ==============================================================================

-- 1. TABELLA PROFILI GIOCATORE (PROFILES)
-- Memorizza lo username univoco per ciascun utente
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indice univoco case-insensitive sullo username (es. "Piuccia" = "piuccia")
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx 
ON public.profiles (LOWER(TRIM(username)));

-- 2. TABELLA RICHIESTE DI AMICIZIA (FRIEND_REQUESTS)
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT no_self_friend_request CHECK (sender_id <> receiver_id),
    CONSTRAINT unique_friend_request UNIQUE (sender_id, receiver_id)
);

-- 3. TABELLA AMICIZIE CONFERMATE (FRIENDSHIPS)
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT no_self_friendship CHECK (user_id <> friend_id),
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
);

-- 4. TABELLA SFIDE / INVITI DI GIOCO (GAME_INVITES)
CREATE TABLE IF NOT EXISTS public.game_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL DEFAULT 'scopa',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Abilita RLS su tutte le tabelle
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

-- Politiche per PROFILES
-- Chiunque (anche anon per verificare disponibilità prima del signup) può leggere i profili
CREATE POLICY "Profili leggibili da tutti" 
ON public.profiles FOR SELECT 
USING (true);

-- Gli utenti possono creare il proprio profilo
CREATE POLICY "Utente può creare il proprio profilo" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Gli utenti possono aggiornare solo il proprio profilo
CREATE POLICY "Utente può aggiornare il proprio profilo" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Politiche per FRIEND_REQUESTS
CREATE POLICY "Lettura richieste amico personali" 
ON public.friend_requests FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Invio richiesta amico" 
ON public.friend_requests FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Aggiornamento richiesta amico" 
ON public.friend_requests FOR UPDATE 
USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "Cancellazione richiesta amico" 
ON public.friend_requests FOR DELETE 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Politiche per FRIENDSHIPS
CREATE POLICY "Lettura amicizie personali" 
ON public.friendships FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Creazione amicizia" 
ON public.friendships FOR INSERT 
WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Eliminazione amicizia" 
ON public.friendships FOR DELETE 
USING (auth.uid() = user_id);

-- Politiche per GAME_INVITES
CREATE POLICY "Lettura inviti personali" 
ON public.game_invites FOR SELECT 
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Invio sfida gioco" 
ON public.game_invites FOR INSERT 
WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Risposta a sfida gioco" 
ON public.game_invites FOR UPDATE 
USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

CREATE POLICY "Eliminazione sfida gioco" 
ON public.game_invites FOR DELETE 
USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- ==============================================================================
-- TRIGGER AUTOMATICO CREAZIONE PROFILO ALLA REGISTRAZIONE
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    chosen_nickname TEXT;
BEGIN
    chosen_nickname := COALESCE(
        new.raw_user_meta_data->>'nickname',
        new.raw_user_meta_data->>'display_name',
        split_part(new.email, '@', 1)
    );

    INSERT INTO public.profiles (id, username, created_at, updated_at)
    VALUES (new.id, chosen_nickname, now(), now())
    ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username, updated_at = now();
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sincronizza anche gli utenti già eventualmente registrati
INSERT INTO public.profiles (id, username, created_at, updated_at)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'nickname', raw_user_meta_data->>'display_name', split_part(email, '@', 1)), 
    now(), 
    now()
FROM auth.users
ON CONFLICT (id) DO NOTHING;
