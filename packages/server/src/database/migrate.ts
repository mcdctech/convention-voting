/**
 * Database migration logic
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { db } from "./db.js";

const require = createRequire(import.meta.url);
const { migrate: pgMigrate } = require("postgres-schema-migrations");

const logger = pino({ name: "migrate" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MigrationOptions {
  schema?: string;
}

/**
 * Run database migrations
 */
export async function runMigrations(
  options: MigrationOptions = {},
): Promise<void> {
  const { schema = "public" } = options;

  const migrationsDir = join(__dirname, "migrations");

  logger.info({ migrationsDir, schema }, "Starting database migrations");

  const client = await db.pool.connect();

  try {
    await pgMigrate({ client }, migrationsDir, { schema });

    logger.info("Database migrations complete");
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Migration failed",
    );
    throw error;
  } finally {
    client.release();
  }
}
