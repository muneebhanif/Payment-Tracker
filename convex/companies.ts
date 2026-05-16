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

export const getCompanies = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    return await ctx.db
      .query("companies")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("asc")
      .collect();
  },
});

export const createCompany = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    industry: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    const name = args.name.trim();
    if (!name) throw new Error("Company name is required");
    const now = Date.now();
    return await ctx.db.insert("companies", {
      userId: user._id,
      name,
      industry: args.industry?.trim(),
      phone: args.phone?.trim(),
      email: args.email?.trim().toLowerCase(),
      address: args.address?.trim(),
      notes: args.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCompany = mutation({
  args: {
    token: v.string(),
    companyId: v.id("companies"),
    name: v.optional(v.string()),
    industry: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    const co = await ctx.db.get(args.companyId);
    if (!co || co.userId !== user._id) throw new Error("Not found");
    const updates: any = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.industry !== undefined) updates.industry = args.industry.trim();
    if (args.phone !== undefined) updates.phone = args.phone.trim();
    if (args.email !== undefined) updates.email = args.email.trim().toLowerCase();
    if (args.address !== undefined) updates.address = args.address.trim();
    if (args.notes !== undefined) updates.notes = args.notes.trim();
    await ctx.db.patch(args.companyId, updates);
  },
});

export const deleteCompany = mutation({
  args: { token: v.string(), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx, args.token);
    const co = await ctx.db.get(args.companyId);
    if (!co || co.userId !== user._id) throw new Error("Not found");
    // Unlink debtors pointing to this company name
    const debtors = await ctx.db
      .query("debtors")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const d of debtors) {
      if (d.companyId === args.companyId) {
        await ctx.db.patch(d._id, { companyId: undefined });
      }
    }
    await ctx.db.delete(args.companyId);
  },
});
