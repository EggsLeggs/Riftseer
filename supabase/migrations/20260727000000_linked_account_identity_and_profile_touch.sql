-- One Riftseer account per external identity. The Metafy webhook resolves a
-- linked account by (provider, provider_user_id) with maybeSingle(), so
-- duplicates on that pair would silently stop status updates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'linked_accounts_provider_identity_unique'
      AND conrelid = 'public.linked_accounts'::regclass
  ) THEN
    ALTER TABLE public.linked_accounts
      ADD CONSTRAINT linked_accounts_provider_identity_unique
      UNIQUE (provider, provider_user_id);
  END IF;
END
$$;

-- profiles.updated_at is set explicitly by PATCH /users/me but not by any other
-- writer; keep it accurate for every update.
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
