/**
 * Authentication service for user login and JWT management
 */
import jwt, { type SignOptions } from "jsonwebtoken";
import { LoginErrorCode } from "@mcdc-convention-voting/shared";
import { db } from "../database/db.js";
import { comparePassword } from "../utils/password-generator.js";
import { getSystemSettings } from "./user-service.js";
import type { AuthUser, JwtPayload } from "@mcdc-convention-voting/shared";

// Array index constants
const EMPTY_ARRAY_LENGTH = 0;

// JWT configuration defaults
const DEFAULT_JWT_EXPIRES_IN = "24h";

/**
 * Check if user is a meeting admin for any meeting
 * Returns true if user is in the admin_pool of any meeting (no date filter)
 */
async function isUserMeetingAdminForAnyMeeting(
	userId: string,
): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		`SELECT EXISTS(
			SELECT 1 FROM user_pools up
			INNER JOIN meetings m ON m.meeting_admin_pool_id = up.pool_id
			WHERE up.user_id = :userId
		) as exists`,
		{ userId },
	);

	// SELECT EXISTS always returns exactly one row
	const {
		rows: [row],
	} = result;
	return row.exists;
}

/**
 * Internal user type with password hash (never exposed via API)
 */
interface UserWithPassword {
	id: string;
	username: string;
	firstName: string;
	lastName: string;
	isAdmin: boolean;
	isWatcher: boolean;
	isDisabled: boolean;
	passwordHash: string | null;
}

/**
 * Result of login validation
 */
interface LoginValidationResult {
	success: boolean;
	user?: AuthUser;
	errorCode?: LoginErrorCode;
}

/**
 * Get user by username including password hash (internal use only)
 */
async function getUserByUsernameWithPassword(
	username: string,
): Promise<UserWithPassword | null> {
	const result = await db.query<{
		id: string;
		username: string;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_watcher: boolean;
		is_disabled: boolean;
		password_hash: string | null;
	}>(
		`SELECT id, username, first_name, last_name, is_admin, is_watcher, is_disabled, password_hash
		 FROM users WHERE username = :username`,
		{ username },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;
	return {
		id: row.id,
		username: row.username,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isWatcher: row.is_watcher,
		isDisabled: row.is_disabled,
		passwordHash: row.password_hash,
	};
}

/**
 * Validate user login credentials
 *
 * Checks:
 * 1. System setting for non-admin login (admins bypass this check)
 * 2. User exists
 * 3. Password is set
 * 4. Password matches
 * 5. Account is not disabled
 */
export async function validateLogin(
	username: string,
	password: string,
): Promise<LoginValidationResult> {
	// Get user with password hash
	const user = await getUserByUsernameWithPassword(username);

	// User not found - return generic error to prevent user enumeration
	if (user === null) {
		return { success: false, errorCode: LoginErrorCode.InvalidCredentials };
	}

	// Check if non-admin login is enabled (only for non-admin users)
	if (!user.isAdmin) {
		const settings = await getSystemSettings();
		if (!settings.nonAdminLoginEnabled) {
			return { success: false, errorCode: LoginErrorCode.LoginDisabled };
		}
	}

	// Check if password is set
	if (user.passwordHash === null) {
		return { success: false, errorCode: LoginErrorCode.NoPasswordSet };
	}

	// Verify password
	const passwordValid = await comparePassword(password, user.passwordHash);
	if (!passwordValid) {
		return { success: false, errorCode: LoginErrorCode.InvalidCredentials };
	}

	// Check if account is disabled
	if (user.isDisabled) {
		return { success: false, errorCode: LoginErrorCode.AccountDisabled };
	}

	// Check if user is a meeting admin for any active meeting
	const isMeetingAdmin = await isUserMeetingAdminForAnyMeeting(user.id);

	// Success - return auth user (without sensitive data)
	return {
		success: true,
		user: {
			id: user.id,
			username: user.username,
			firstName: user.firstName,
			lastName: user.lastName,
			isAdmin: user.isAdmin,
			isWatcher: user.isWatcher,
			isMeetingAdmin,
		},
	};
}

/**
 * Generate a JWT token for an authenticated user
 */
export function generateToken(user: AuthUser): string {
	const {
		env: { JWT_SECRET, JWT_EXPIRES_IN },
	} = process;
	if (JWT_SECRET === undefined || JWT_SECRET === "") {
		throw new Error("JWT_SECRET environment variable is not set");
	}

	const expiresIn = JWT_EXPIRES_IN ?? DEFAULT_JWT_EXPIRES_IN;

	const payload: Omit<JwtPayload, "iat" | "exp"> = {
		sub: user.id,
		username: user.username,
		isAdmin: user.isAdmin,
		isWatcher: user.isWatcher,
	};

	const signOptions: SignOptions = {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- jsonwebtoken accepts duration strings like "24h"
		expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
	};

	return jwt.sign(payload, JWT_SECRET, signOptions);
}

/**
 * Type guard to check if decoded JWT has required JwtPayload fields
 */
// eslint-disable-next-line complexity -- Type guard requires checking all JWT payload fields
function isJwtPayload(decoded: unknown): decoded is JwtPayload {
	if (typeof decoded !== "object" || decoded === null) {
		return false;
	}
	return (
		"sub" in decoded &&
		typeof decoded.sub === "string" &&
		"username" in decoded &&
		typeof decoded.username === "string" &&
		"isAdmin" in decoded &&
		typeof decoded.isAdmin === "boolean" &&
		"isWatcher" in decoded &&
		typeof decoded.isWatcher === "boolean" &&
		"iat" in decoded &&
		typeof decoded.iat === "number" &&
		"exp" in decoded &&
		typeof decoded.exp === "number"
	);
}

/**
 * Verify a JWT token and return the payload
 * Returns null if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload | null {
	const {
		env: { JWT_SECRET },
	} = process;
	if (JWT_SECRET === undefined || JWT_SECRET === "") {
		throw new Error("JWT_SECRET environment variable is not set");
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);
		if (isJwtPayload(decoded)) {
			return decoded;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Get user by ID for auth purposes (check if still valid)
 */
export async function getAuthUserById(
	userId: string,
): Promise<AuthUser | null> {
	const result = await db.query<{
		id: string;
		username: string;
		first_name: string;
		last_name: string;
		is_admin: boolean;
		is_watcher: boolean;
		is_disabled: boolean;
	}>(
		`SELECT id, username, first_name, last_name, is_admin, is_watcher, is_disabled
		 FROM users WHERE id = :userId AND is_disabled = FALSE`,
		{ userId },
	);

	if (result.rows.length === EMPTY_ARRAY_LENGTH) {
		return null;
	}

	const {
		rows: [row],
	} = result;

	// Check if user is a meeting admin for any active meeting
	const isMeetingAdmin = await isUserMeetingAdminForAnyMeeting(row.id);

	return {
		id: row.id,
		username: row.username,
		firstName: row.first_name,
		lastName: row.last_name,
		isAdmin: row.is_admin,
		isWatcher: row.is_watcher,
		isMeetingAdmin,
	};
}

/**
 * Check if a meeting admin can access a specific user
 * Meeting admins can access users who are:
 * - Not global admins
 * - Either in pools associated with their meetings OR have no pool assignments yet
 */
export async function canMeetingAdminAccessUser(
	meetingAdminId: string,
	targetUserId: string,
): Promise<boolean> {
	// First check if the target user is a global admin (never accessible by meeting admins)
	const userResult = await db.query<{ is_admin: boolean }>(
		`SELECT is_admin FROM users WHERE id = :targetUserId`,
		{ targetUserId },
	);

	if (
		userResult.rows.length === EMPTY_ARRAY_LENGTH ||
		userResult.rows[EMPTY_ARRAY_LENGTH].is_admin
	) {
		return false;
	}

	// Check if user has any pool assignments
	const poolCountResult = await db.query<{ count: number }>(
		`SELECT COUNT(*) as count FROM user_pools WHERE user_id = :targetUserId`,
		{ targetUserId },
	);

	const {
		rows: [{ count: poolCount }],
	} = poolCountResult;

	// If user has no pools, meeting admin can access them
	if (poolCount === EMPTY_ARRAY_LENGTH) {
		return true;
	}

	// Otherwise, check if the target user is in any pool associated with meetings
	// where the meeting admin is authorized
	const result = await db.query<{ exists: boolean }>(
		`SELECT EXISTS(
			SELECT 1 FROM user_pools up
			INNER JOIN pools p ON p.id = up.pool_id
			INNER JOIN meetings m ON (
				m.quorum_voting_pool_id = p.id OR
				m.watcher_pool_id = p.id OR
				m.meeting_admin_pool_id = p.id
			)
			INNER JOIN user_pools admin_up ON admin_up.pool_id = m.meeting_admin_pool_id
			WHERE up.user_id = :targetUserId
			AND admin_up.user_id = :meetingAdminId
		) as exists`,
		{ targetUserId, meetingAdminId },
	);

	const {
		rows: [row],
	} = result;
	return row.exists;
}

/**
 * Check if a meeting admin can access a specific pool
 * Meeting admins can only access pools associated with their authorized meetings
 */
export async function canMeetingAdminAccessPool(
	meetingAdminId: string,
	poolId: number,
): Promise<boolean> {
	const result = await db.query<{ exists: boolean }>(
		`SELECT EXISTS(
			SELECT 1 FROM meetings m
			INNER JOIN user_pools admin_up ON admin_up.pool_id = m.meeting_admin_pool_id
			WHERE (
				m.quorum_voting_pool_id = :poolId OR
				m.watcher_pool_id = :poolId OR
				m.meeting_admin_pool_id = :poolId
			)
			AND admin_up.user_id = :meetingAdminId
		) as exists`,
		{ poolId, meetingAdminId },
	);

	const {
		rows: [row],
	} = result;
	return row.exists;
}
