/**
 * Admin API routes for user management
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  disableUser,
  enableUser,
  generatePasswordsForUsers,
  resetUserPassword,
  getSystemSettings,
  setNonAdminLoginEnabled,
} from "../services/user-service.js";
import { importUsersFromCSV } from "../services/csv-service.js";
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  BulkPasswordResponse,
  PasswordResetResponse,
} from "@mcdc-convention-voting/shared";

export const adminRouter = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

/**
 * POST /api/admin/users/upload
 * Upload CSV file to bulk create users
 */
adminRouter.post(
  "/users/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const result = await importUsersFromCSV(req.file.buffer);

      res.json({
        success: true,
        message: `Imported ${result.success} users successfully`,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to import users: ${message}` });
    }
  },
);

/**
 * GET /api/admin/users
 * List all users with pagination
 */
adminRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page?.toString() || "1", 10);
    const limit = parseInt(req.query.limit?.toString() || "50", 10);

    const { users, total } = await listUsers(page, limit);

    const response: UserListResponse = {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Failed to list users: ${message}` });
  }
});

/**
 * POST /api/admin/users
 * Create a single user
 */
adminRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const request: CreateUserRequest = req.body;

    // Validate required fields
    if (!request.voterId || !request.firstName || !request.lastName) {
      res.status(400).json({
        error: "Missing required fields: voterId, firstName, lastName",
      });
      return;
    }

    const user = await createUser(request);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: `Failed to create user: ${message}` });
  }
});

/**
 * GET /api/admin/users/:id
 * Get a single user by ID
 */
adminRouter.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.params.id);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Failed to get user: ${message}` });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user details
 */
adminRouter.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const updates: UpdateUserRequest = req.body;
    const user = await updateUser(req.params.id, updates);
    res.json({ success: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: `Failed to update user: ${message}` });
  }
});

/**
 * POST /api/admin/users/:id/disable
 * Disable a user
 */
adminRouter.post("/users/:id/disable", async (req: Request, res: Response) => {
  try {
    const user = await disableUser(req.params.id);
    res.json({ success: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: `Failed to disable user: ${message}` });
  }
});

/**
 * POST /api/admin/users/:id/enable
 * Enable a user
 */
adminRouter.post("/users/:id/enable", async (req: Request, res: Response) => {
  try {
    const user = await enableUser(req.params.id);
    res.json({ success: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: `Failed to enable user: ${message}` });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset a user's password
 */
adminRouter.post(
  "/users/:id/reset-password",
  async (req: Request, res: Response) => {
    try {
      const user = await getUserById(req.params.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const password = await resetUserPassword(req.params.id);

      const response: PasswordResetResponse = {
        username: user.username,
        password,
      };

      res.json({ success: true, data: response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to reset password: ${message}` });
    }
  },
);

/**
 * POST /api/admin/users/generate-passwords
 * Generate passwords for all users without passwords
 */
adminRouter.post(
  "/users/generate-passwords",
  async (req: Request, res: Response) => {
    try {
      const results = await generatePasswordsForUsers();

      const response: BulkPasswordResponse = {
        results,
        count: results.length,
      };

      res.json({ success: true, data: response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res
        .status(500)
        .json({ error: `Failed to generate passwords: ${message}` });
    }
  },
);

/**
 * GET /api/admin/settings
 * Get system settings
 */
adminRouter.get("/settings", async (req: Request, res: Response) => {
  try {
    const settings = await getSystemSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `Failed to get settings: ${message}` });
  }
});

/**
 * PUT /api/admin/settings/login-enabled
 * Toggle site-wide non-admin login
 */
adminRouter.put(
  "/settings/login-enabled",
  async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({ error: "enabled must be a boolean value" });
        return;
      }

      await setNonAdminLoginEnabled(enabled);
      res.json({
        success: true,
        message: `Non-admin login ${enabled ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to update settings: ${message}` });
    }
  },
);
