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
import { voterRouter } from "./routes/voter.js";
import { watcherRouter } from "./routes/watcher.js";
import {
	requireAuth,
	requireAdmin,
	requireWatcher,
} from "./middleware/auth-middleware.js";
import { activityLogger } from "./middleware/activity-logger-middleware.js";

const logger = pino({ name: "app" });

// Default CORS origin
const DEFAULT_CORS_ORIGIN = "*";

// API prefix (configurable for different deployment environments)
const API_PREFIX = process.env.API_PREFIX ?? "";

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
	app.get(`${API_PREFIX}/health`, (req: Request, res: Response) => {
		res.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// API routes
	app.use(API_PREFIX, router);
	app.use(`${API_PREFIX}/auth`, authRouter);
	app.use(`${API_PREFIX}/voter`, requireAuth, activityLogger, voterRouter);
	app.use(
		`${API_PREFIX}/admin`,
		requireAuth,
		requireAdmin,
		activityLogger,
		adminRouter,
	);
	app.use(
		`${API_PREFIX}/watcher`,
		requireAuth,
		requireWatcher,
		activityLogger,
		watcherRouter,
	);

	// 404 handler
	app.use((req: Request, res: Response) => {
		res.status(HTTP_STATUS.CLIENT_ERROR.NOT_FOUND).json({ error: "Not found" });
	});

	return app;
}
