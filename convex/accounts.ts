import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

async function getAuthenticatedUser(ctx: any, token: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .first();
  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Unauthorized: Invalid or expired session");
  }
  const user = await ctx.db.get(session.userId);
  if (!user || !user.isActive) {
    throw new Error("Unauthorized: User not found");
  }
  return user;
}

export const getAccounts = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();
    return accounts;
  },
});

export const createAccount = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("checking"),
      v.literal("savings"),
      v.literal("cash"),
      v.literal("other")
    ),
    currency: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
    initialBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);

    const name = args.name.trim();
    if (name.length < 1 || name.length > 50) {
      throw new Error("Account name must be between 1 and 50 characters");
    }

    const initialBalance = args.initialBalance || 0;
    if (initialBalance < 0 && args.type === "savings") {
      throw new Error("Savings account cannot start with negative balance");
    }

    const colors: Record<string, string> = {
      checking: "#4F46E5",
      savings: "#10B981",
      cash: "#F59E0B",
      other: "#6B7280",
    };

    const icons: Record<string, string> = {
      checking: "wallet",
      savings: "piggy-bank",
      cash: "banknotes",
      other: "credit-card",
    };

    const accountId = await ctx.db.insert("accounts", {
      userId: user._id,
      name,
      type: args.type,
      balance: initialBalance,
      currency: args.currency || "GBP",
      color: args.color || colors[args.type],
      icon: args.icon || icons[args.type],
      isActive: true,
      createdAt: Date.now(),
      description: args.description,
    });

    if (initialBalance > 0) {
      await ctx.db.insert("transactions", {
        userId: user._id,
        accountId,
        type: "income",
        amount: initialBalance,
        category: "Initial Balance",
        description: "Opening balance",
        date: Date.now(),
        createdAt: Date.now(),
      });
    }

    return accountId;
  },
});

export const updateAccount = mutation({
  args: {
    token: v.string(),
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== user._id) {
      throw new Error("Account not found or access denied");
    }

    const updates: any = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 1 || name.length > 50) {
        throw new Error("Account name must be between 1 and 50 characters");
      }
      updates.name = name;
    }
    if (args.color !== undefined) updates.color = args.color;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.accountId, updates);
    return { success: true };
  },
});

export const deleteAccount = mutation({
  args: {
    token: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== user._id) {
      throw new Error("Account not found or access denied");
    }

    // Soft delete
    await ctx.db.patch(args.accountId, { isActive: false });
    return { success: true };
  },
});

export const getAccountSummary = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    const totalBalance = accounts
      .filter((a: any) => a.type !== "savings")
      .reduce((sum: number, a: any) => sum + a.balance, 0);

    const totalSavings = accounts
      .filter((a: any) => a.type === "savings")
      .reduce((sum: number, a: any) => sum + a.balance, 0);

    return { totalBalance, totalSavings, accounts };
  },
});
