/**
 * Express application setup
 */
import express, { type Express, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import pino from "pino";
import { HTTP_STATUS } from "@pdc/http-status-codes";
import { router } from "./routes/index.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { requireAuth, requireAdmin } from "./middleware/auth-middleware.js";

const logger = pino({ name: "app" });

// Default CORS origin
const DEFAULT_CORS_ORIGIN = "*";

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
		const corsOrigin =
			process.env.CORS_ORIGIN !== undefined && process.env.CORS_ORIGIN !== ""
				? process.env.CORS_ORIGIN
				: DEFAULT_CORS_ORIGIN;
		res.header("Access-Control-Allow-Origin", corsOrigin);
		res.header(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS",
		);
		res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") {
			res.sendStatus(HTTP_STATUS.SUCCESSFUL.NO_CONTENT);
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
	app.use("/api/auth", authRouter);
	app.use("/api/admin", requireAuth, requireAdmin, adminRouter);

	// 404 handler
	app.use((req: Request, res: Response) => {
		res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({ error: "Not found" });
	});

	return app;
}
