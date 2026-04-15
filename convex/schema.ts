import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    createdAt: v.number(),
    lastLogin: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  accounts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: v.union(
      v.literal("checking"),
      v.literal("savings"),
      v.literal("cash"),
      v.literal("other")
    ),
    balance: v.number(),
    currency: v.string(),
    color: v.string(),
    icon: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    description: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "type"]),

  transactions: defineTable({
    userId: v.id("users"),
    accountId: v.id("accounts"),
    type: v.union(v.literal("income"), v.literal("expense"), v.literal("transfer")),
    amount: v.number(),
    category: v.string(),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    date: v.number(),
    createdAt: v.number(),
    tags: v.optional(v.array(v.string())),
    toAccountId: v.optional(v.id("accounts")),
  })
    .index("by_userId", ["userId"])
    .index("by_accountId", ["accountId"])
    .index("by_userId_date", ["userId", "date"])
    .index("by_userId_type", ["userId", "type"]),

  debtors: defineTable({
    userId: v.id("users"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    totalOwed: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("cleared"),
      v.literal("partial")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"]),

  debtTransactions: defineTable({
    userId: v.id("users"),
    debtorId: v.id("debtors"),
    type: v.union(v.literal("given"), v.literal("returned")),
    amount: v.number(),
    description: v.optional(v.string()),
    date: v.number(),
    createdAt: v.number(),
    runningBalance: v.number(),
  })
    .index("by_debtorId", ["debtorId"])
    .index("by_userId", ["userId"])
    .index("by_debtorId_date", ["debtorId", "date"]),

  loginAttempts: defineTable({
    email: v.string(),
    ipAddress: v.optional(v.string()),
    success: v.boolean(),
    timestamp: v.number(),
  }).index("by_email_time", ["email", "timestamp"]),
});
