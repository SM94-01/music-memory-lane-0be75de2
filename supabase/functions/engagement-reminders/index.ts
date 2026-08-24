// Supabase Edge Function: engagement-reminders
// Runs on a schedule (pg_cron) and sends two kinds of reminder pushes:
//  1. "watchlist"  -> album sitting in the user's To listen for more than 24h
//  2. "inactive"   -> user with no activity for 3+ days (invites to rediscover)
//
// Auth: requires header `x-cron-key` matching the CRON_SECRET env var.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendPush(
  user_id: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id, title, body, data }),
  });
  if (!r.ok) console.warn("[reminders] push failed", r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-key") !== cronSecret) {
    return json(401, { success: false, error: "Unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600_000).toISOString();
  const threeDaysAgo = new Date(now - 3 * 24 * 3600_000).toISOString();

  const result = { watchlist: 0, inactive: 0 };

  try {
    // ---------- preferences + tokens ----------
    const { data: tokenRows } = await supabase.from("user_push_tokens").select("user_id");
    const reachable = new Set((tokenRows ?? []).map((t: any) => t.user_id));
    if (reachable.size === 0) return json(200, { success: true, ...result, note: "no devices" });

    const { data: prefRows } = await supabase
      .from("notification_prefs")
      .select("user_id, watchlist_reminders, inactivity_reminders");
    const prefs = new Map((prefRows ?? []).map((p: any) => [p.user_id, p]));
    const allows = (uid: string, key: string) => {
      const p = prefs.get(uid);
      return !p || p[key] !== false;
    };

    const { data: sentRows } = await supabase
      .from("reminder_sends")
      .select("user_id, kind, ref, sent_at");
    const sentKeys = new Set((sentRows ?? []).map((s: any) => `${s.user_id}|${s.kind}|${s.ref}`));
    const lastInactive = new Map<string, string>();
    (sentRows ?? []).forEach((s: any) => {
      if (s.kind !== "inactive") return;
      const prev = lastInactive.get(s.user_id);
      if (!prev || prev < s.sent_at) lastInactive.set(s.user_id, s.sent_at);
    });

    // ---------- 1. watchlist older than 24h ----------
    const { data: pending } = await supabase
      .from("watchlist")
      .select("id, user_id, title, artist, album_key, created_at")
      .eq("done", false)
      .lt("created_at", dayAgo)
      .order("created_at", { ascending: true })
      .limit(500);

    const seenUser = new Set<string>();
    for (const w of pending ?? []) {
      if (!reachable.has(w.user_id)) continue;
      if (seenUser.has(w.user_id)) continue; // one nudge per user per run
      if (!allows(w.user_id, "watchlist_reminders")) continue;
      if (sentKeys.has(`${w.user_id}|watchlist|${w.id}`)) continue;
      seenUser.add(w.user_id);
      const ok = await sendPush(
        w.user_id,
        "Still on your list",
        `“${w.title}” by ${w.artist} has been waiting in your To listen. Give it a spin?`,
        { type: "watchlist", album_key: w.album_key },
      );
      if (ok) {
        await supabase.from("reminder_sends").insert({ user_id: w.user_id, kind: "watchlist", ref: w.id });
        result.watchlist++;
      }
    }

    // ---------- 2. inactive for 3+ days ----------
    const [logs, comments, likes, msgs] = await Promise.all([
      supabase.from("album_logs").select("user_id, created_at").gte("created_at", threeDaysAgo),
      supabase.from("comments").select("user_id, created_at").gte("created_at", threeDaysAgo),
      supabase.from("likes").select("user_id, created_at").gte("created_at", threeDaysAgo),
      supabase.from("messages").select("sender_id, created_at").gte("created_at", threeDaysAgo),
    ]);
    const activeRecently = new Set<string>();
    (logs.data ?? []).forEach((r: any) => activeRecently.add(r.user_id));
    (comments.data ?? []).forEach((r: any) => activeRecently.add(r.user_id));
    (likes.data ?? []).forEach((r: any) => activeRecently.add(r.user_id));
    (msgs.data ?? []).forEach((r: any) => activeRecently.add(r.sender_id));

    for (const uid of reachable) {
      if (activeRecently.has(uid)) continue;
      if (!allows(uid, "inactivity_reminders")) continue;
      const last = lastInactive.get(uid);
      if (last && last > threeDaysAgo) continue; // max one every 3 days
      const ok = await sendPush(
        uid,
        "Hey, you've been away",
        "Want to rate a few albums? We picked some fresh ones for you.",
        { type: "rediscover" },
      );
      if (ok) {
        await supabase
          .from("reminder_sends")
          .upsert(
            { user_id: uid, kind: "inactive", ref: new Date().toISOString().slice(0, 10), sent_at: new Date().toISOString() },
            { onConflict: "user_id,kind,ref" },
          );
        result.inactive++;
      }
    }

    return json(200, { success: true, ...result });
  } catch (e) {
    console.error("[engagement-reminders]", e);
    return json(500, { success: false, error: (e as Error).message });
  }
});
