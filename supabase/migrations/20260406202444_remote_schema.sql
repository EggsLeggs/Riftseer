drop extension if exists "pg_net";

drop index if exists "public"."cards_name_search_idx";

alter table "public"."cards" drop column "name_search";

alter table "public"."cards" add column "rulings_id" uuid;

-- sets.external_ids: added in 20260225000000_add_set_external_ids.sql (omit here to avoid duplicate DDL on fresh installs).

alter table "public"."cards" add constraint "cards_rulings_id_fkey" FOREIGN KEY (rulings_id) REFERENCES public.rulings(id) ON DELETE SET NULL not valid;

alter table "public"."cards" validate constraint "cards_rulings_id_fkey";


