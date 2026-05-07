// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function getUser(ctx, token) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!session || session.expiresAt < Date.now()) throw new Error("Unauthorized");
  const user = await ctx.db.get(session.userId);
  if (!user || !user.isActive) throw new Error("Unauthorized");
  return user;
}

export const addTransfer = mutation({
  args: {
    token: v.string(),
    fromAccountId: v.optional(v.id("accounts")),
    toNote: v.string(),
    amount: v.number(),
    date: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    await ctx.db.insert("transfers", {
      userId: user._id,
      fromAccountId: args.fromAccountId,
      toNote: args.toNote,
      amount: args.amount,
      date: args.date,
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});

export const getTransfers = query({
  args: {
    token: v.string(),
    fromAccountId: v.optional(v.id("accounts")),
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    let transfers = await ctx.db
      .query("transfers")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    if (args.fromAccountId) {
      transfers = transfers.filter((t) => t.fromAccountId === args.fromAccountId);
    }

    if (args.month) {
      const [y, m] = args.month.split("-").map(Number);
      const start = new Date(y, m - 1, 1).getTime();
      const end = new Date(y, m, 0, 23, 59, 59).getTime();
      transfers = transfers.filter((t) => t.date >= start && t.date <= end);
    }

    // Attach account name
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const accMap = Object.fromEntries(accounts.map((a) => [a._id, a]));

    return transfers.map((t) => ({
      ...t,
      fromAccountName: t.fromAccountId ? (accMap[t.fromAccountId]?.name ?? "Unknown") : null,
    }));
  },
});

export const deleteTransfer = mutation({
  args: { token: v.string(), transferId: v.id("transfers") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer || transfer.userId !== user._id) throw new Error("Not found");
    await ctx.db.delete(args.transferId);
  },
});

export const updateTransfer = mutation({
  args: {
    token: v.string(),
    transferId: v.id("transfers"),
    fromAccountId: v.optional(v.id("accounts")),
    toNote: v.string(),
    amount: v.number(),
    date: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer || transfer.userId !== user._id) throw new Error("Not found");
    await ctx.db.patch(args.transferId, {
      fromAccountId: args.fromAccountId,
      toNote: args.toNote,
      amount: args.amount,
      date: args.date,
      notes: args.notes,
    });
  },
});
