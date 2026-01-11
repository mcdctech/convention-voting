/**
 * API routes
 */
import { Router, type Request, type Response } from "express";

export const router = Router();

/**
 * Example API endpoint
 */
router.get("/example", (req: Request, res: Response) => {
	res.json({
		message: "Hello from MCDC Convention Voting API",
		timestamp: new Date().toISOString(),
	});
});
