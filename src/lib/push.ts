import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

let initialized = false;

/**
 * Initialize push notifications on native platforms only.
 * Safe to call multiple times — no-ops after the first successful init.
 * Must be called AFTER the user is signed in.
 */
export async function initPushNotifications(): Promise<void> {
  try {
    if (initialized) return;
    if (!Capacitor.isNativePlatform()) return;

    // 1. Permissions
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") {
      console.warn("[push] permission not granted:", perm.receive);
      return;
    }

    // 2. Wire listeners BEFORE register so the first token isn't lost
    await FirebaseMessaging.removeAllListeners();

    const saveToken = async (token: string) => {
      try {
        const platform = Capacitor.getPlatform() as "android" | "ios" | "web";
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .maybeSingle();
        if (!profile?.id) {
          console.warn("[push] no profile for current user; skipping token upsert");
          return;
        }
        const { error } = await supabase
          .from("user_push_tokens")
          .upsert(
            { user_id: profile.id, token, platform, last_seen_at: new Date().toISOString() },
            { onConflict: "token" },
          );
        if (error) console.warn("[push] token upsert failed:", error.message);
      } catch (e) {
        console.warn("[push] registration handler threw", e);
      }
    };

    await FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
      console.log("[push] FCM token received");
      void saveToken(token);
    });

    await FirebaseMessaging.addListener("notificationReceived", ({ notification }) => {
      console.log("[push] received", notification.id);
      window.dispatchEvent(new CustomEvent("trax:notification-received"));
    });

    await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
      const data = (event.notification?.data ?? {}) as Record<string, string>;
      let path: string | null = null;
      if (data.type === "rediscover") path = "/rediscover";
      else if (data.type === "watchlist" && data.album_key) path = `/album/${data.album_key}`;
      if (path) window.dispatchEvent(new CustomEvent("trax:navigate", { detail: path }));
    });

    // 3. getToken registers with APNs/FCM and returns the FCM token directly.
    const { token } = await FirebaseMessaging.getToken();
    console.log("[push] FCM token acquired");
    await saveToken(token);
    initialized = true;
  } catch (e) {
    console.warn("[push] init failed", e);
  }
}

export async function teardownPushNotifications(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    await FirebaseMessaging.removeAllListeners();
    initialized = false;
  } catch (e) {
    console.warn("[push] teardown failed", e);
  }
}
