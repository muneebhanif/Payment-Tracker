import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

export const addTransaction = mutation({
  args: {
    token: v.string(),
    accountId: v.id("accounts"),
    type: v.union(v.literal("income"), v.literal("expense"), v.literal("transfer")),
    amount: v.number(),
    category: v.string(),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    date: v.number(),
    tags: v.optional(v.array(v.string())),
    toAccountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);

    // Validate amount
    if (args.amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }
    if (args.amount > 1000000000) {
      throw new Error("Amount exceeds maximum allowed value");
    }

    // Validate account ownership
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== user._id || !account.isActive) {
      throw new Error("Account not found or access denied");
    }

    // For savings accounts, warn on withdrawal
    if (account.type === "savings" && args.type === "expense") {
      const newBalance = account.balance - args.amount;
      if (newBalance < 0) {
        throw new Error("Insufficient savings balance");
      }
    }

    // Validate category
    const category = args.category.trim();
    if (!category || category.length > 50) {
      throw new Error("Category is required and must be under 50 characters");
    }

    // Create transaction
    const transactionId = await ctx.db.insert("transactions", {
      userId: user._id,
      accountId: args.accountId,
      type: args.type,
      amount: args.amount,
      category,
      description: args.description?.trim(),
      notes: args.notes?.trim(),
      date: args.date,
      createdAt: Date.now(),
      tags: args.tags,
      toAccountId: args.toAccountId,
    });

    // Update account balance
    if (args.type === "income") {
      await ctx.db.patch(args.accountId, {
        balance: account.balance + args.amount,
      });
    } else if (args.type === "expense") {
      await ctx.db.patch(args.accountId, {
        balance: account.balance - args.amount,
      });
    } else if (args.type === "transfer" && args.toAccountId) {
      const toAccount = await ctx.db.get(args.toAccountId);
      if (!toAccount || toAccount.userId !== user._id || !toAccount.isActive) {
        throw new Error("Destination account not found or access denied");
      }
      await ctx.db.patch(args.accountId, {
        balance: account.balance - args.amount,
      });
      await ctx.db.patch(args.toAccountId, {
        balance: toAccount.balance + args.amount,
      });
    }

    return transactionId;
  },
});

export const getTransactions = query({
  args: {
    token: v.string(),
    accountId: v.optional(v.id("accounts")),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"), v.literal("transfer"))),
    limit: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);

    let query = ctx.db
      .query("transactions")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id));

    let transactions = await query.order("desc").collect();

    // Filter by account
    if (args.accountId) {
      const account = await ctx.db.get(args.accountId);
      if (!account || account.userId !== user._id) {
        throw new Error("Account not found or access denied");
      }
      transactions = transactions.filter(
        (t: any) => t.accountId === args.accountId
      );
    }

    // Filter by type
    if (args.type) {
      transactions = transactions.filter((t: any) => t.type === args.type);
    }

    // Filter by date
    if (args.startDate) {
      transactions = transactions.filter((t: any) => t.date >= args.startDate!);
    }
    if (args.endDate) {
      transactions = transactions.filter((t: any) => t.date <= args.endDate!);
    }

    // Apply limit
    if (args.limit) {
      transactions = transactions.slice(0, args.limit);
    }

    // Enrich with account names
    const accountIds = [...new Set(transactions.map((t: any) => t.accountId))];
    const accountsMap: Record<string, any> = {};
    for (const id of accountIds) {
      const acc = await ctx.db.get(id as any);
      if (acc) accountsMap[id as string] = acc;
    }

    return transactions.map((t: any) => ({
      ...t,
      accountName: accountsMap[t.accountId]?.name || "Unknown",
      accountColor: accountsMap[t.accountId]?.color || "#6B7280",
    }));
  },
});

export const deleteTransaction = mutation({
  args: {
    token: v.string(),
    transactionId: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.userId !== user._id) {
      throw new Error("Transaction not found or access denied");
    }

    const account = await ctx.db.get(transaction.accountId);
    if (!account) throw new Error("Account not found");

    // Reverse balance change
    if (transaction.type === "income") {
      await ctx.db.patch(transaction.accountId, {
        balance: account.balance - transaction.amount,
      });
    } else if (transaction.type === "expense") {
      await ctx.db.patch(transaction.accountId, {
        balance: account.balance + transaction.amount,
      });
    } else if (transaction.type === "transfer" && transaction.toAccountId) {
      const toAccount = await ctx.db.get(transaction.toAccountId);
      if (toAccount) {
        await ctx.db.patch(transaction.accountId, {
          balance: account.balance + transaction.amount,
        });
        await ctx.db.patch(transaction.toAccountId, {
          balance: toAccount.balance - transaction.amount,
        });
      }
    }

    await ctx.db.delete(args.transactionId);
    return { success: true };
  },
});

export const getTransactionSummary = query({
  args: {
    token: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    let transactions = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .collect();

    if (args.startDate) {
      transactions = transactions.filter((t: any) => t.date >= args.startDate!);
    }
    if (args.endDate) {
      transactions = transactions.filter((t: any) => t.date <= args.endDate!);
    }

    const totalIncome = transactions
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter((t: any) => t.type === "expense")
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    transactions
      .filter((t: any) => t.type === "expense")
      .forEach((t: any) => {
        categoryBreakdown[t.category] =
          (categoryBreakdown[t.category] || 0) + t.amount;
      });

    return {
      totalIncome,
      totalExpenses,
      netFlow: totalIncome - totalExpenses,
      categoryBreakdown,
      transactionCount: transactions.length,
    };
  },
});
