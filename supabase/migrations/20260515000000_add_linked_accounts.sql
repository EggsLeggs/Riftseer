CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider          text        NOT NULL,
  provider_user_id  text        NOT NULL,
  provider_username text,
  access_token      text,
  refresh_token     text,
  is_supporter      boolean     NOT NULL DEFAULT false,
  status_checked_at timestamptz,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linked_accounts_user_provider_unique UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS linked_accounts_user_id_idx ON public.linked_accounts (user_id);

CREATE TRIGGER linked_accounts_updated_at
  BEFORE UPDATE ON public.linked_accounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;
-- No RLS policies — all access goes through the API worker using the service role client.
-- The absence of policies under enabled RLS blocks all non-service-role access.
