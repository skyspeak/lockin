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

async function backfillLegacyActions(): Promise<void> {
  const result = await pool.query(
    "UPDATE actions SET user_id = $1 WHERE user_id = '' RETURNING id",
    [DERIVED_USER_ID],
  );
  if (result.rowCount && result.rowCount > 0) {
    logger.info({ count: result.rowCount }, "Backfilled legacy actions with derived userId");
  }
}

backfillLegacyActions()
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
