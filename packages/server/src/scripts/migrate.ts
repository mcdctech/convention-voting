/**
 * Migration script entry point
 */
import pino from "pino";
import { runMigrations } from "../database/migrate.js";

const logger = pino({ name: "migrate-script" });

async function main() {
  try {
    logger.info("Starting migration script");
    await runMigrations();
    logger.info("Migration script completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Migration script failed");
    process.exit(1);
  }
}

main();
