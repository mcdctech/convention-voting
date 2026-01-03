/**
 * Migration script entry point
 */
import pino from "pino";
import { runMigrations } from "../database/migrate.js";

const logger = pino({ name: "migrate-script" });

const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_ERROR = 1;

async function main(): Promise<void> {
	try {
		logger.info("Starting migration script");
		await runMigrations();
		logger.info("Migration script completed successfully");
		process.exit(EXIT_CODE_SUCCESS);
	} catch (error) {
		logger.error({ error }, "Migration script failed");
		process.exit(EXIT_CODE_ERROR);
	}
}

void main();
