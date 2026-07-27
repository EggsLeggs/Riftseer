ALTER TABLE public.linked_accounts ADD COLUMN IF NOT EXISTS is_member boolean NOT NULL DEFAULT false;
