import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Admin endpoint: create a user account without the frontend.
 *
 * Usage:
 *   curl -X POST https://capable-nightingale-509.eu-west-1.convex.site/admin/create-user \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
 *     -d '{"username":"alice","email":"alice@example.com","password":"SecurePass1"}'
 *
 * Set ADMIN_SECRET in your Convex dashboard:
 *   https://dashboard.convex.dev → capable-nightingale-509 → Settings → Environment Variables
 *
 * Password rules: ≥8 chars, at least one uppercase letter, at least one number.
 */
http.route({
  path: "/admin/create-user",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // ── 1. Auth check ───────────────────────────────────────────────────────
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return new Response(
        JSON.stringify({ error: "ADMIN_SECRET environment variable is not set. Configure it in the Convex dashboard." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${adminSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — wrong or missing Authorization header." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    let body: { username?: string; email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { username, email, password } = body;
    if (!username || !email || !password) {
      return new Response(
        JSON.stringify({ error: "username, email, and password are all required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 3. Create user via internal mutation ─────────────────────────────────
    try {
      const result = await ctx.runMutation(internal.auth.adminCreateUser, {
        username,
        email,
        password,
      });

      return new Response(
        JSON.stringify({
          success: true,
          userId: result.userId,
          username: result.username,
          email: result.email,
          message: `User "${result.username}" created. They can now log in at your app URL.`,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

/**
 * List existing usernames (admin only, no passwords / hashes exposed).
 *
 * Usage:
 *   curl https://capable-nightingale-509.eu-west-1.convex.site/admin/list-users \
 *     -H "Authorization: Bearer YOUR_ADMIN_SECRET"
 */
http.route({
  path: "/admin/list-users",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return new Response(
        JSON.stringify({ error: "ADMIN_SECRET environment variable is not set." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${adminSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await ctx.runQuery(internal.auth.adminListUsers, {});
    return new Response(
      JSON.stringify({ users: result }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }),
});

export default http;
