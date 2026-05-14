-- profiles: one row per auth user, created on register
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text NOT NULL,
  handle      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_length CHECK (char_length(username) BETWEEN 1 AND 50),
  CONSTRAINT profiles_handle_format  CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT profiles_handle_unique  UNIQUE (handle)
);

-- follows: directed (follower → following) edges
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_follower_idx  ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows (following_id);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows  ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read; owner can insert/update their own row
CREATE POLICY profiles_public_read  ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_owner_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_owner_update ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Follows: anyone can read; authenticated users manage their own follows
CREATE POLICY follows_public_read ON public.follows FOR SELECT USING (true);
CREATE POLICY follows_auth_insert ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY follows_auth_delete ON public.follows FOR DELETE  USING (auth.uid() = follower_id);
