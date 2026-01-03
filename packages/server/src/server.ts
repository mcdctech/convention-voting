/**
 * Server entry point
 */
import pino from "pino";
import { createApp } from "./app.js";
import { testConnection, initializeDatabase } from "./database/index.js";

const logger = pino({ name: "server" });

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
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
    process.exit(1);
  }
}

start();
