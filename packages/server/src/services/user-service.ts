/**
 * User management service
 */
import { db } from "../database/db.js";
import { generatePassword, hashPassword } from "../utils/password-generator.js";
import { generateUniqueUsername } from "../utils/username-generator.js";
import type {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  PasswordGenerationResult,
  SystemSettings,
} from "@mcdc-convention-voting/shared";

/**
 * Check if a username already exists
 */
export async function usernameExists(username: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM users WHERE username = $1) as exists",
    [username],
  );
  return result.rows[0].exists;
}

/**
 * Check if a voter ID already exists
 */
export async function voterIdExists(voterId: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM users WHERE voter_id = $1) as exists",
    [voterId],
  );
  return result.rows[0].exists;
}

/**
 * Create a single user
 */
export async function createUser(request: CreateUserRequest): Promise<User> {
  const { voterId, firstName, lastName, username } = request;

  // Check if voter ID already exists
  if (await voterIdExists(voterId)) {
    throw new Error(`User with voter ID ${voterId} already exists`);
  }

  // Generate username if not provided
  const finalUsername =
    username ||
    (await generateUniqueUsername(firstName, lastName, usernameExists));

  // Check if username already exists (in case one was provided)
  if (await usernameExists(finalUsername)) {
    throw new Error(`Username ${finalUsername} already exists`);
  }

  const result = await db.query<{
    id: string;
    username: string;
    voter_id: string;
    first_name: string;
    last_name: string;
    is_admin: boolean;
    is_disabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO users (username, voter_id, first_name, last_name, password_hash)
     VALUES ($1, $2, $3, $4, NULL)
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
    [finalUsername, voterId, firstName, lastName],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    voterId: row.voter_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const result = await db.query<{
    id: string;
    username: string;
    voter_id: string | null;
    first_name: string;
    last_name: string;
    is_admin: boolean;
    is_disabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    "SELECT id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at FROM users WHERE id = $1",
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    voterId: row.voter_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List users with pagination
 */
export async function listUsers(
  page = 1,
  limit = 50,
): Promise<{ users: User[]; total: number }> {
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await db.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM users",
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated users
  const result = await db.query<{
    id: string;
    username: string;
    voter_id: string | null;
    first_name: string;
    last_name: string;
    is_admin: boolean;
    is_disabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at
     FROM users
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const users = result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    voterId: row.voter_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { users, total };
}

/**
 * Update user details
 */
export async function updateUser(
  userId: string,
  updates: UpdateUserRequest,
): Promise<User> {
  const { firstName, lastName, username } = updates;

  // Build dynamic update query
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramCounter = 1;

  if (firstName !== undefined) {
    setClauses.push(`first_name = $${paramCounter++}`);
    values.push(firstName);
  }

  if (lastName !== undefined) {
    setClauses.push(`last_name = $${paramCounter++}`);
    values.push(lastName);
  }

  if (username !== undefined) {
    // Check if new username already exists
    if (await usernameExists(username)) {
      const existingUser = await db.query<{ id: string }>(
        "SELECT id FROM users WHERE username = $1",
        [username],
      );
      // Only throw error if it's a different user
      if (existingUser.rows[0].id !== userId) {
        throw new Error(`Username ${username} already exists`);
      }
    }
    setClauses.push(`username = $${paramCounter++}`);
    values.push(username);
  }

  if (setClauses.length === 0) {
    throw new Error("No fields to update");
  }

  // Add updated_at
  setClauses.push(`updated_at = NOW()`);

  // Add userId as last parameter
  values.push(userId);

  const result = await db.query<{
    id: string;
    username: string;
    voter_id: string | null;
    first_name: string;
    last_name: string;
    is_admin: boolean;
    is_disabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE users
     SET ${setClauses.join(", ")}
     WHERE id = $${paramCounter}
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
    values,
  );

  if (result.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    voterId: row.voter_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Disable a user
 */
export async function disableUser(userId: string): Promise<User> {
  const result = await db.query<{
    id: string;
    username: string;
    voter_id: string | null;
    first_name: string;
    last_name: string;
    is_admin: boolean;
    is_disabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE users
     SET is_disabled = TRUE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    voterId: row.voter_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Enable a user
 */
export async function enableUser(userId: string): Promise<User> {
  const result = await db.query<{
    id: string;
    username: string;
    voter_id: string | null;
    first_name: string;
    last_name: string;
    is_admin: boolean;
    is_disabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE users
     SET is_disabled = FALSE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, username, voter_id, first_name, last_name, is_admin, is_disabled, created_at, updated_at`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    voterId: row.voter_id,
    firstName: row.first_name,
    lastName: row.last_name,
    isAdmin: row.is_admin,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Generate passwords for all users without passwords
 */
export async function generatePasswordsForUsers(): Promise<
  PasswordGenerationResult[]
> {
  // Get all users without passwords
  const usersResult = await db.query<{
    id: string;
    username: string;
  }>("SELECT id, username FROM users WHERE password_hash IS NULL");

  const results: PasswordGenerationResult[] = [];

  // Generate and set passwords for each user
  for (const user of usersResult.rows) {
    const password = generatePassword();
    const hashedPassword = await hashPassword(password);

    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [hashedPassword, user.id],
    );

    results.push({
      userId: user.id,
      username: user.username,
      password,
    });
  }

  return results;
}

/**
 * Reset a user's password
 */
export async function resetUserPassword(userId: string): Promise<string> {
  const password = generatePassword();
  const hashedPassword = await hashPassword(password);

  const result = await db.query<{ id: string }>(
    "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
    [hashedPassword, userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  return password;
}

/**
 * Get system settings
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  const result = await db.query<{ setting_value: string }>(
    "SELECT setting_value FROM system_settings WHERE setting_key = $1",
    ["non_admin_login_enabled"],
  );

  return {
    nonAdminLoginEnabled: result.rows[0]?.setting_value === "true",
  };
}

/**
 * Update system setting for non-admin login
 */
export async function setNonAdminLoginEnabled(enabled: boolean): Promise<void> {
  await db.query(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = $2, updated_at = NOW()`,
    ["non_admin_login_enabled", enabled.toString()],
  );
}
