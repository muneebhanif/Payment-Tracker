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

export const getDebtors = query({
  args: {
    token: v.string(),
    status: v.optional(
      v.union(v.literal("active"), v.literal("cleared"), v.literal("partial"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    let debtors = await ctx.db
      .query("debtors")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .collect();

    if (args.status) {
      debtors = debtors.filter((d: any) => d.status === args.status);
    }

    return debtors.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const createDebtor = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    initialAmount: v.optional(v.number()),
    initialDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);

    const name = args.name.trim();
    if (name.length < 1 || name.length > 100) {
      throw new Error("Debtor name must be between 1 and 100 characters");
    }

    if (args.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
      throw new Error("Invalid email address");
    }

    const initialAmount = args.initialAmount || 0;
    if (initialAmount < 0) {
      throw new Error("Initial amount cannot be negative");
    }

    const now = Date.now();
    const debtorId = await ctx.db.insert("debtors", {
      userId: user._id,
      name,
      phone: args.phone?.trim(),
      email: args.email?.trim().toLowerCase(),
      notes: args.notes?.trim(),
      totalOwed: initialAmount,
      status: initialAmount > 0 ? "active" : "cleared",
      createdAt: now,
      updatedAt: now,
    });

    // Create initial transaction if amount provided
    if (initialAmount > 0) {
      await ctx.db.insert("debtTransactions", {
        userId: user._id,
        debtorId,
        type: "given",
        amount: initialAmount,
        description: args.initialDescription || "Initial amount",
        date: now,
        createdAt: now,
        runningBalance: initialAmount,
      });
    }

    return debtorId;
  },
});

export const updateDebtor = mutation({
  args: {
    token: v.string(),
    debtorId: v.id("debtors"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const debtor = await ctx.db.get(args.debtorId);
    if (!debtor || debtor.userId !== user._id) {
      throw new Error("Debtor not found or access denied");
    }

    const updates: any = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 1 || name.length > 100) {
        throw new Error("Debtor name must be between 1 and 100 characters");
      }
      updates.name = name;
    }
    if (args.phone !== undefined) updates.phone = args.phone.trim();
    if (args.email !== undefined) {
      if (args.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
        throw new Error("Invalid email address");
      }
      updates.email = args.email.trim().toLowerCase();
    }
    if (args.notes !== undefined) updates.notes = args.notes.trim();

    await ctx.db.patch(args.debtorId, updates);
    return { success: true };
  },
});

export const deleteDebtor = mutation({
  args: {
    token: v.string(),
    debtorId: v.id("debtors"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const debtor = await ctx.db.get(args.debtorId);
    if (!debtor || debtor.userId !== user._id) {
      throw new Error("Debtor not found or access denied");
    }

    // Delete all transactions
    const transactions = await ctx.db
      .query("debtTransactions")
      .withIndex("by_debtorId", (q: any) => q.eq("debtorId", args.debtorId))
      .collect();

    for (const tx of transactions) {
      await ctx.db.delete(tx._id);
    }

    await ctx.db.delete(args.debtorId);
    return { success: true };
  },
});

export const addDebtTransaction = mutation({
  args: {
    token: v.string(),
    debtorId: v.id("debtors"),
    type: v.union(v.literal("given"), v.literal("returned")),
    amount: v.number(),
    description: v.optional(v.string()),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const debtor = await ctx.db.get(args.debtorId);
    if (!debtor || debtor.userId !== user._id) {
      throw new Error("Debtor not found or access denied");
    }

    if (args.amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    if (args.type === "returned" && args.amount > debtor.totalOwed) {
      throw new Error("Returned amount exceeds total owed");
    }

    const newBalance =
      args.type === "given"
        ? debtor.totalOwed + args.amount
        : debtor.totalOwed - args.amount;

    const now = Date.now();

    // Create debt transaction
    const txId = await ctx.db.insert("debtTransactions", {
      userId: user._id,
      debtorId: args.debtorId,
      type: args.type,
      amount: args.amount,
      description: args.description?.trim(),
      date: args.date,
      createdAt: now,
      runningBalance: newBalance,
    });

    // Update debtor
    let status: "active" | "cleared" | "partial" = "active";
    if (newBalance === 0) {
      status = "cleared";
    } else if (newBalance < debtor.totalOwed && args.type === "returned") {
      status = "partial";
    }

    await ctx.db.patch(args.debtorId, {
      totalOwed: newBalance,
      status,
      updatedAt: now,
    });

    return txId;
  },
});

export const getDebtTransactions = query({
  args: {
    token: v.string(),
    debtorId: v.id("debtors"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const debtor = await ctx.db.get(args.debtorId);
    if (!debtor || debtor.userId !== user._id) {
      throw new Error("Debtor not found or access denied");
    }

    const transactions = await ctx.db
      .query("debtTransactions")
      .withIndex("by_debtorId", (q: any) => q.eq("debtorId", args.debtorId))
      .order("desc")
      .collect();

    return transactions;
  },
});

export const getDebtorsSummary = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.token);
    const debtors = await ctx.db
      .query("debtors")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .collect();

    const totalReceivables = debtors
      .filter((d: any) => d.status !== "cleared")
      .reduce((sum: number, d: any) => sum + d.totalOwed, 0);

    const activeCount = debtors.filter((d: any) => d.status === "active").length;
    const partialCount = debtors.filter((d: any) => d.status === "partial").length;
    const clearedCount = debtors.filter((d: any) => d.status === "cleared").length;

    return {
      totalReceivables,
      activeCount,
      partialCount,
      clearedCount,
      totalDebtors: debtors.length,
    };
  },
});
