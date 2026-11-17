import * as dotenv from 'dotenv';
import postgres from 'postgres';
import { Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { envPath, normalizePostgresUrl } from '../common/helpers';
import {
  readTeamSpaceMigrationPlan,
} from '../database/team-space-name-convention';

dotenv.config({ path: envPath });

async function main() {
  const db = new Kysely<any>({
    dialect: new PostgresJSDialect({
      postgres: postgres(normalizePostgresUrl(process.env.DATABASE_URL)),
    }),
  });

  try {
    const plan = await readTeamSpaceMigrationPlan(db);
    console.log(JSON.stringify(plan, null, 2));
    if (plan.errors.length > 0) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
