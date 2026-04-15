import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Simple hash function using available Web APIs
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): {
  valid: boolean;
  message: string;
} {
  if (password.length < 8)
    return { valid: false, message: "Password must be at least 8 characters" };
  if (!/[A-Z]/.test(password))
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter",
    };
  if (!/[0-9]/.test(password))
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  return { valid: true, message: "" };
}

export const register = mutation({
  args: {
    username: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    // Sanitize inputs
    const username = args.username.trim();
    const email = args.email.trim().toLowerCase();
    const password = args.password;

    // Validate username
    if (username.length < 3 || username.length > 30) {
      throw new Error("Username must be between 3 and 30 characters");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error(
        "Username can only contain letters, numbers, and underscores"
      );
    }

    // Validate email
    if (!validateEmail(email)) {
      throw new Error("Invalid email address");
    }

    // Validate password
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      throw new Error(pwCheck.message);
    }

    // Check existing email
    const existingEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existingEmail) {
      throw new Error("Email already registered");
    }

    // Check existing username
    const existingUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (existingUsername) {
      throw new Error("Username already taken");
    }

    // Hash password
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    // Create user
    const userId = await ctx.db.insert("users", {
      username,
      email,
      passwordHash,
      salt,
      createdAt: Date.now(),
      isActive: true,
    });

    // Create session
    const token = generateToken();
    const sessionId = await ctx.db.insert("sessions", {
      userId,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { token, userId, username, sessionId };
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // Rate limiting: check failed attempts
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentAttempts = await ctx.db
      .query("loginAttempts")
      .withIndex("by_email_time", (q) =>
        q.eq("email", email).gte("timestamp", fiveMinutesAgo)
      )
      .collect();

    const failedAttempts = recentAttempts.filter((a) => !a.success);
    if (failedAttempts.length >= 5) {
      throw new Error(
        "Too many failed login attempts. Please try again in 5 minutes."
      );
    }

    // Find user
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user || !user.isActive) {
      await ctx.db.insert("loginAttempts", {
        email,
        ipAddress: args.ipAddress,
        success: false,
        timestamp: Date.now(),
      });
      throw new Error("Invalid email or password");
    }

    // Verify password
    const passwordHash = await hashPassword(args.password, user.salt);
    if (passwordHash !== user.passwordHash) {
      await ctx.db.insert("loginAttempts", {
        email,
        ipAddress: args.ipAddress,
        success: false,
        timestamp: Date.now(),
      });
      throw new Error("Invalid email or password");
    }

    // Log success
    await ctx.db.insert("loginAttempts", {
      email,
      ipAddress: args.ipAddress,
      success: true,
      timestamp: Date.now(),
    });

    // Update last login
    await ctx.db.patch(user._id, { lastLogin: Date.now() });

    // Create session
    const token = generateToken();
    const sessionId = await ctx.db.insert("sessions", {
      userId: user._id,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      ipAddress: args.ipAddress,
    });

    return {
      token,
      userId: user._id,
      username: user.username,
      sessionId,
    };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { success: true };
  },
});

export const validateSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) return null;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) return null;
    if (session.expiresAt < Date.now()) return null;

    const user = await ctx.db.get(session.userId);
    if (!user || !user.isActive) return null;

    return {
      userId: user._id,
      username: user.username,
      email: user.email,
    };
  },
});

// Admin-only: create a user without opening a browser session.
// Called exclusively from the HTTP action in http.ts.
export const adminCreateUser = internalMutation({
  args: {
    username: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim();
    const email = args.email.trim().toLowerCase();
    const password = args.password;

    if (username.length < 3 || username.length > 30)
      throw new Error("Username must be between 3 and 30 characters");
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      throw new Error("Username can only contain letters, numbers, and underscores");
    if (!validateEmail(email))
      throw new Error("Invalid email address");

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) throw new Error(pwCheck.message);

    const existingEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existingEmail) throw new Error("Email already registered");

    const existingUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (existingUsername) throw new Error("Username already taken");

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const userId = await ctx.db.insert("users", {
      username,
      email,
      passwordHash,
      salt,
      createdAt: Date.now(),
      isActive: true,
    });

    return { userId, username, email };
  },
});

// Admin-only: list all users (no sensitive data exposed).
export const adminListUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      userId: u._id,
      username: u.username,
      email: u.email,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
  },
});
