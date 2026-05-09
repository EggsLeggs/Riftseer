import { z } from "zod";

const postgresDsn = z.string().regex(/^postgres(?:ql)?:\/\/.+/i);

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Consent store (Postgres). Optional when c15t routes are not used. */
  C15T_DATABASE_URL: postgresDsn.optional(),
  NEXT_PUBLIC_CONSENT_OVERRIDE_COUNTRY: z.string().min(1).optional(),
});

export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  C15T_DATABASE_URL: process.env.C15T_DATABASE_URL,
  NEXT_PUBLIC_CONSENT_OVERRIDE_COUNTRY: process.env.NEXT_PUBLIC_CONSENT_OVERRIDE_COUNTRY,
});
