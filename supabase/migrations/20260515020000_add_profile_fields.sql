-- Add extended profile fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio          text,
  ADD COLUMN IF NOT EXISTS pronouns     text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social_links jsonb   NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length      CHECK (bio IS NULL OR char_length(bio) <= 300),
  ADD CONSTRAINT profiles_pronouns_count  CHECK (array_length(pronouns, 1) IS NULL OR array_length(pronouns, 1) <= 3);
