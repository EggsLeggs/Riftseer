import { defineConfig } from '@c15t/backend';
import { kyselyAdapter } from '@c15t/backend/db/adapters/kysely';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const databaseUrl = process.env.C15T_DATABASE_URL;
if (!databaseUrl) {
	throw new Error('C15T_DATABASE_URL is not set');
}

const db = new Kysely({
	dialect: new PostgresDialect({
		pool: new Pool({
			connectionString: databaseUrl,
			ssl: { rejectUnauthorized: true },
		}),
	}),
});

const trustedOrigins = (process.env.C15T_TRUSTED_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

export default defineConfig({
	adapter: kyselyAdapter({ provider: 'postgresql', db }),
	trustedOrigins,
});
