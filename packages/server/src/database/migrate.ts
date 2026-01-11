/**
 * Database migration logic
 */
/* eslint-disable import/order -- Import groups appear correct but linter disagrees */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { db } from "./db.js";
/* eslint-enable import/order */

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- postgres-schema-migrations is untyped CommonJS module
const { migrate: pgMigrate } = require("postgres-schema-migrations");

const logger = pino({ name: "migrate" });

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = dirname(FILENAME);

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

	const migrationsDir = join(DIRNAME, "migrations");

	logger.info({ migrationsDir, schema }, "Starting database migrations");

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TinyPg pool.connect is untyped
	const client = await db.pool.connect();

	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- postgres-schema-migrations is untyped
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TinyPg client.release is untyped
		client.release();
	}
}
