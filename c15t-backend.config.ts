import { defineConfig } from '@c15t/backend';
import { kyselyAdapter } from '@c15t/backend/db/adapters/kysely';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const db = new Kysely({
	dialect: new PostgresDialect({
		pool: new Pool({ connectionString: process.env.C15T_DATABASE_URL! }),
	}),
});

export default defineConfig({
	adapter: kyselyAdapter({ provider: 'postgresql', db }),
});
