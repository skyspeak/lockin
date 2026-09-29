import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { DERIVED_USER_ID } from "./middlewares/auth";
import { Cron } from "croner";
import { runDailyDigest } from "./lib/digest";
import { runReminders } from "./lib/reminders";

// Railway deploys from this package; keep a source change here so lockfile-only
// commits at the repo root still trigger a rebuild.
// Redeploy bump: Gemini 2.5-flash default + live provider probe (2026-09-28).

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
    await pool.query(
      "ALTER TABLE actions ADD COLUMN IF NOT EXISTS next_steps JSONB NOT NULL DEFAULT '[]'::jsonb",
    );
    const actions = await pool.query(
      "UPDATE actions SET user_id = $1 WHERE user_id = '' RETURNING id",
      [DERIVED_USER_ID],
    );
    if (actions.rowCount && actions.rowCount > 0) {
      logger.info({ count: actions.rowCount }, "Backfilled legacy actions with derived userId");
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_oauth (
      id TEXT PRIMARY KEY,
      email TEXT,
      refresh_token TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  if (await tableExists("actions")) {
    await pool.query(
      "ALTER TABLE actions ADD COLUMN IF NOT EXISTS snooze_reminded_until TIMESTAMP",
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'ios',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens (user_id)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_reminders (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sent_on TEXT NOT NULL,
      PRIMARY KEY (user_id, kind, sent_on)
    )
  `);
}

migrateSchema()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      new Cron("0 21 * * *", { timezone: "America/Los_Angeles", protect: true }, () => {
        void runDailyDigest().catch((digestErr) => {
          logger.error({ err: digestErr instanceof Error ? digestErr.message : "unknown" }, "scheduled digest failed");
        });
      });
      new Cron("*/5 * * * *", { timezone: "America/Los_Angeles", protect: true }, () => {
        void runReminders().catch((reminderErr) => {
          logger.error({ err: reminderErr instanceof Error ? reminderErr.message : "unknown" }, "scheduled reminders failed");
        });
      });
      logger.info("Daily digest scheduled for 21:00 America/Los_Angeles");
      logger.info("Push reminders check every 5 minutes");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration failed");
    process.exit(1);
  });
