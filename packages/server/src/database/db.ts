/**
 * Database connection and initialization
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TinyPg } from "tinypg";
import pino from "pino";

const logger = pino({ name: "database" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Database configuration from environment variables
 */
const dbConfig = {
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "convention_voting",
};

/**
 * TinyPg database instance
 */
export const db = new TinyPg({
  connection_string: `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
  root_dir: join(__dirname, "queries"),
});

/**
 * Set timezone to UTC on each connection
 */
db.events.on("connected", async (connection) => {
  await connection.query("SET timezone = UTC");
});

/**
 * Initialize database with startup scripts
 */
export async function initializeDatabase(): Promise<void> {
  const initializationDir = join(__dirname, "initialization");

  try {
    const files = await readdir(initializationDir);
    const sqlFiles = files.filter((file) => file.endsWith(".sql")).sort();

    logger.info(
      { count: sqlFiles.length },
      "Running database initialization scripts",
    );

    for (const file of sqlFiles) {
      const filePath = join(initializationDir, file);
      const sql = await readFile(filePath, "utf-8");

      logger.info({ file }, "Executing initialization script");
      await db.query(sql);
    }

    logger.info("Database initialization complete");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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
