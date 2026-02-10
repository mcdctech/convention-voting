/**
 * Database connection and initialization
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TinyPg } from "tinypg";
import pino from "pino";

const logger = pino({ name: "database" });

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = dirname(FILENAME);

// Database defaults for local development
const DEFAULT_DB_HOST = "localhost";
const DEFAULT_DB_PORT = "5432";
const DEFAULT_DB_USER = "postgres";
const DEFAULT_DB_PASSWORD = "postgres";
const DEFAULT_DB_NAME = "convention_voting";
const DECIMAL_RADIX = 10;

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue: string): string {
	// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- dynamic key access cannot use destructuring
	const value = process.env[key];
	return value !== undefined && value !== "" ? value : defaultValue;
}

/**
 * Build connection string from individual PG* env vars (for local development)
 */
function buildConnectionString(): string {
	const host = getEnv("PGHOST", DEFAULT_DB_HOST);
	const port = Number.parseInt(
		getEnv("PGPORT", DEFAULT_DB_PORT),
		DECIMAL_RADIX,
	);
	const user = getEnv("PGUSER", DEFAULT_DB_USER);
	const password = getEnv("PGPASSWORD", DEFAULT_DB_PASSWORD);
	const database = getEnv("PGDATABASE", DEFAULT_DB_NAME);

	logger.info({ user, host, database }, "Database configuration");
	return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

/**
 * Get connection string - prefer DATABASE_URL if set (used by DO managed databases),
 * otherwise build from individual PG* environment variables (for local development)
 */
function getConnectionString(): string {
	// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- false positive, already using destructuring
	const { DATABASE_URL: databaseUrl } = process.env;
	if (databaseUrl !== undefined && databaseUrl !== "") {
		logger.info("Using DATABASE_URL for database connection");
		return databaseUrl;
	}
	return buildConnectionString();
}

const connectionString = getConnectionString();

// Pool configuration for production performance
const DEFAULT_POOL_MIN = 2;
const DEFAULT_POOL_MAX = 20;
const IDLE_TIMEOUT_MS = 30000;
const CONNECTION_TIMEOUT_MS = 5000;

/**
 * TinyPg database instance with connection pool configuration
 *
 * Pool settings:
 * - min: Keep minimum connections warm for faster response
 * - max: Allow more concurrent queries under load (default was ~10)
 * - idleTimeoutMillis: Clean up unused connections after 30s
 * - connectionTimeoutMillis: Fast-fail rather than hang on connection issues
 */
export const db = new TinyPg({
	connection_string: connectionString,
	root_dir: join(DIRNAME, "queries"),
	pool_options: {
		min: DEFAULT_POOL_MIN,
		max: DEFAULT_POOL_MAX,
		idle_timeout_ms: IDLE_TIMEOUT_MS,
		connection_timeout_ms: CONNECTION_TIMEOUT_MS,
	},
});

/**
 * Set timezone to UTC on each connection
 */
// @ts-expect-error - TinyPg "connected" event exists but not in type definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TinyPg connection type not available
db.events.on("connected", (connection: any) => {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TinyPg connection.query is untyped
	void connection.query("SET timezone = UTC");
});

/**
 * Type guard for NodeJS.ErrnoException
 */
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Type guard requires assertion to check property type
		typeof (error as NodeJS.ErrnoException).code === "string"
	);
}

/**
 * Initialize database with startup scripts
 */
export async function initializeDatabase(): Promise<void> {
	const initializationDir = join(DIRNAME, "initialization");

	try {
		const files = await readdir(initializationDir);
		const sqlFiles = files.filter((file) => file.endsWith(".sql")).sort();

		logger.info(
			{ count: sqlFiles.length },
			"Running database initialization scripts",
		);

		// Sequential execution is intentional to maintain order
		for (const file of sqlFiles) {
			const filePath = join(initializationDir, file);
			// eslint-disable-next-line no-await-in-loop -- Sequential file reads required for initialization scripts
			const sql = await readFile(filePath, "utf-8");

			logger.info({ file }, "Executing initialization script");
			// eslint-disable-next-line no-await-in-loop -- Sequential execution maintains script order
			await db.query(sql);
		}

		logger.info("Database initialization complete");
	} catch (error) {
		if (isErrnoException(error) && error.code === "ENOENT") {
			logger.info(
				"No initialization directory found, skipping initialization scripts",
			);
		} else {
			throw error;
		}
	}
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
	try {
		await db.query("SELECT 1");
		logger.info("Database connection successful");
		return true;
	} catch (error) {
		logger.error({ error }, "Database connection failed");
		return false;
	}
}

/**
 * Execute a function within a database transaction
 *
 * All queries executed using the provided db instance will be part of the same transaction.
 * The transaction is automatically committed on success or rolled back on error.
 *
 * @param fn - Function to execute within the transaction
 * @returns The result of the function
 *
 * @example
 * const result = await withTransaction(async (tx) => {
 *   await tx.query("INSERT INTO users ...", { ... });
 *   await tx.query("INSERT INTO user_pools ...", { ... });
 *   return userId;
 * });
 */
export async function withTransaction<T>(
	fn: (transactionDb: TinyPg) => Promise<T>,
): Promise<T> {
	return await db.transaction(fn);
}
