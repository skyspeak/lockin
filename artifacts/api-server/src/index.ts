import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { DERIVED_USER_ID } from "./middlewares/auth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${name}`],
  );
  return Boolean(result.rows[0]?.exists);
}

async function migrateSchema(): Promise<void> {
  const type = await pool.query("SELECT 1 FROM pg_type WHERE typname = 'category'");
  if (type.rowCount) {
    await pool.query("ALTER TYPE category ADD VALUE IF NOT EXISTS 'hobbies'");
    await pool.query("ALTER TYPE category ADD VALUE IF NOT EXISTS 'extracurriculars'");

    if (await tableExists("actions")) {
      await pool.query(`
        UPDATE actions
        SET category = 'hobbies'
        WHERE category::text IN ('side-projects', 'personal')
      `);
      await pool.query(`
        UPDATE actions
        SET category = 'other'
        WHERE category::text IN ('finance', 'health')
      `);
    }

    if (await tableExists("thoughts")) {
      await pool.query(`
        UPDATE thoughts
        SET category = 'hobbies'
        WHERE category::text IN ('side-projects', 'personal')
      `);
      await pool.query(`
        UPDATE thoughts
        SET category = 'other'
        WHERE category::text IN ('finance', 'health')
      `);
    }
  }

  if (await tableExists("thoughts")) {
    await pool.query(
      "ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT ''",
    );
    const thoughts = await pool.query(
      "UPDATE thoughts SET user_id = $1 WHERE user_id = '' RETURNING id",
      [DERIVED_USER_ID],
    );
    if (thoughts.rowCount && thoughts.rowCount > 0) {
      logger.info({ count: thoughts.rowCount }, "Backfilled legacy thoughts with derived userId");
    }
  }

  if (await tableExists("actions")) {
    const actions = await pool.query(
      "UPDATE actions SET user_id = $1 WHERE user_id = '' RETURNING id",
      [DERIVED_USER_ID],
    );
    if (actions.rowCount && actions.rowCount > 0) {
      logger.info({ count: actions.rowCount }, "Backfilled legacy actions with derived userId");
    }
  }
}

migrateSchema()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration failed");
    process.exit(1);
  });
