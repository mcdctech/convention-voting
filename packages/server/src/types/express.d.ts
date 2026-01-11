/**
 * Express type extensions for authentication
 */
import type { AuthUser } from "@mcdc-convention-voting/shared";

declare global {
	namespace Express {
		interface Request {
			user?: AuthUser;
		}
	}
}

export {};
