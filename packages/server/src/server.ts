/**
 * Server entry point
 */
import pino from "pino";
import { createApp } from "./app.js";
import { testConnection, initializeDatabase } from "./database/index.js";

const logger = pino({ name: "server" });

const DEFAULT_PORT = "3000";
const DEFAULT_HOST = "0.0.0.0";
const DECIMAL_RADIX = 10;
const EXIT_CODE_ERROR = 1;

const PORT = Number.parseInt(
	process.env.PORT !== undefined && process.env.PORT !== ""
		? process.env.PORT
		: DEFAULT_PORT,
	DECIMAL_RADIX,
);
const HOST =
	process.env.HOST !== undefined && process.env.HOST !== ""
		? process.env.HOST
		: DEFAULT_HOST;

async function start(): Promise<void> {
	try {
		// Test database connection
		logger.info("Testing database connection...");
		const connected = await testConnection();

		if (!connected) {
			throw new Error("Failed to connect to database");
		}

		// Initialize database
		logger.info("Initializing database...");
		await initializeDatabase();

		// Create Express app
		const app = createApp();

		// Start server
		app.listen(PORT, HOST, () => {
			logger.info({ port: PORT, host: HOST }, "Server is running");
		});
	} catch (error) {
		logger.error({ error }, "Failed to start server");
		process.exit(EXIT_CODE_ERROR);
	}
}

void start();
