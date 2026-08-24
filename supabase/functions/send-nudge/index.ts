import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Triggered by pg_cron (see supabase/schema.sql for the two schedules).
// Auth is a shared secret (not a Supabase JWT) since pg_cron has no way to
// hold a Supabase session token -- see get_app_secret() in schema.sql and
// PROJECT_NOTES.md for why the private keys live in Vault, not env vars.

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const expectedSecret = await supabase.rpc("get_app_secret", { secret_name: "cron_shared_secret" });
  const providedSecret = req.headers.get("x-cron-secret");
  if (!expectedSecret.data || providedSecret !== expectedSecret.data) {
    return new Response("unauthorized", { status: 401 });
  }

  const { kind } = await req.json().catch(() => ({ kind: "alarm" }));

  if (kind === "nudge") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("id")
      .gte("started_at", `${today}T00:00:00Z`)
      .limit(1);
    if (sessions && sessions.length > 0) {
      return new Response(JSON.stringify({ skipped: "already started" }), { status: 200 });
    }
  }

  const [publicKeyRes, privateKeyRes] = await Promise.all([
    supabase.rpc("get_app_secret", { secret_name: "vapid_public_key" }),
    supabase.rpc("get_app_secret", { secret_name: "vapid_private_key" }),
  ]);
  webpush.setVapidDetails("mailto:green.paul.p@gmail.com", publicKeyRes.data, privateKeyRes.data);

  const { data: subs } = await supabase.from("push_subscriptions").select("id, subscription");

  const payload = JSON.stringify(
    kind === "nudge"
      ? { title: "Step Up", body: "Still haven't started today's workout — ready when you are." }
      : { title: "Step Up", body: "Time for today's workout!" },
  );

  const results = await Promise.allSettled(
    (subs ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", row.id);
        }
        throw err;
      }
    }),
  );

  return new Response(JSON.stringify({ sent: results.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
