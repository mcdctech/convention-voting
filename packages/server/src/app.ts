/**
 * Express application setup
 */
import express, { type Express, type Request, type Response } from "express";
import pinoHttp from "pino-http";
import pino from "pino";
import { router } from "./routes/index.js";
import { adminRouter } from "./routes/admin.js";

const logger = pino({ name: "app" });

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Request logging
  app.use(pinoHttp({ logger }));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS headers
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
    } else {
      next();
    }
  });

  // Health check endpoint
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API routes
  app.use("/api", router);
  app.use("/api/admin", adminRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
