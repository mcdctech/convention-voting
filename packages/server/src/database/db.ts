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

// Database defaults
const DEFAULT_DB_HOST = "localhost";
const DEFAULT_DB_PORT = "5432";
const DEFAULT_DB_USER = "postgres";
const DEFAULT_DB_PASSWORD = "postgres";
const DEFAULT_DB_NAME = "convention_voting";
const DEFAULT_DB_SSLMODE = "";
const DECIMAL_RADIX = 10;

/**
 * Database configuration from environment variables
 */
const dbConfig = {
	host:
		process.env.PGHOST !== undefined && process.env.PGHOST !== ""
			? process.env.PGHOST
			: DEFAULT_DB_HOST,
	port: Number.parseInt(
		process.env.PGPORT !== undefined && process.env.PGPORT !== ""
			? process.env.PGPORT
			: DEFAULT_DB_PORT,
		DECIMAL_RADIX,
	),
	user:
		process.env.PGUSER !== undefined && process.env.PGUSER !== ""
			? process.env.PGUSER
			: DEFAULT_DB_USER,
	password:
		process.env.PGPASSWORD !== undefined && process.env.PGPASSWORD !== ""
			? process.env.PGPASSWORD
			: DEFAULT_DB_PASSWORD,
	database:
		process.env.PGDATABASE !== undefined && process.env.PGDATABASE !== ""
			? process.env.PGDATABASE
			: DEFAULT_DB_NAME,
	sslmode:
		process.env.PGSSLMODE !== undefined && process.env.PGSSLMODE !== ""
			? process.env.PGSSLMODE
			: DEFAULT_DB_SSLMODE,
};

logger.info(
	{ user: dbConfig.user, host: dbConfig.host, database: dbConfig.database },
	"Database configuration",
);

/**
 * Build connection string with optional SSL
 */
const sslParam = dbConfig.sslmode === "" ? "" : `?sslmode=${dbConfig.sslmode}`;
const connectionString = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}${sslParam}`;

/**
 * TinyPg database instance
 */
export const db = new TinyPg({
	connection_string: connectionString,
	root_dir: join(DIRNAME, "queries"),
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
