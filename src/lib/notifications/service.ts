import { supabase } from "@/integrations/supabase/client";
import { eventRegistry } from "./registry";
import type { NotificationEvent, NotificationPrefKey } from "./types";

/**
 * NotificationService — single entry point for firing push notifications
 * from anywhere in the app.
 *
 * Responsibilities:
 *  - Resolve the recipient for each event (owner of a log, followee, ...).
 *  - Skip self-notifications (actor === recipient).
 *  - Drop duplicates using an in-memory TTL cache.
 *  - Read the recipient's `notification_prefs` and honor per-event toggles.
 *  - Invoke the `send-push-notification` edge function.
 *
 * The service is intentionally decoupled from database write paths. Callers
 * do their normal insert/delete on `follows`, `likes`, `comments` and then
 * fire-and-forget `notificationService.notify(event)`. Failures are logged
 * and swallowed — a broken push must never block a user action.
 */
class NotificationService {
  /** Dedup cache: key -> expiry timestamp (ms). */
  private readonly seen = new Map<string, number>();
  private readonly dedupTtlMs = 60_000;

  /**
   * Public entry point. Fire-and-forget from event handlers:
   *   void notificationService.notify({ type: "follow", ... })
   */
  async notify(event: NotificationEvent): Promise<void> {
    try {
      const handler = eventRegistry[event.type] as {
        prefKey: NotificationPrefKey;
        buildPayload: (e: NotificationEvent, r: string) => { title: string; body: string; data?: Record<string, string> };
        dedupKey: (e: NotificationEvent, r: string) => string;
      };

      const recipientId = await this.resolveRecipient(event);
      if (!recipientId) return;
      if (recipientId === event.actorId) return; // never notify self

      const key = handler.dedupKey(event, recipientId);
      if (this.isDuplicate(key)) return;
      this.remember(key);

      const allowed = handler.prefKey ? await this.isPrefEnabled(recipientId, handler.prefKey) : true;
      if (!allowed) return;

      const payload = handler.buildPayload(event, recipientId);
      const { error } = await supabase.functions.invoke("send-push-notification", {
        body: { user_id: recipientId, ...payload },
      });
      if (error) console.warn("[notifications] invoke failed", event.type, error.message);
    } catch (err) {
      console.warn("[notifications] notify threw", err);
    }
  }

  // ---------- internal helpers ----------

  private async resolveRecipient(event: NotificationEvent): Promise<string | null> {
    if (event.type === "follow" || event.type === "album_share" || event.type === "message") return event.recipientId;
    // like / comment: recipient is the owner of the album log.
    const { data, error } = await supabase
      .from("album_logs")
      .select("user_id")
      .eq("id", event.logId)
      .maybeSingle();
    if (error || !data) return null;
    return data.user_id;
  }

  private async isPrefEnabled(userId: string, key: NotificationPrefKey): Promise<boolean> {
    const { data } = await supabase
      .from("notification_prefs")
      .select("new_follower, likes, comments, album_shares")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return true;
    return (data as Record<string, boolean>)[key] !== false;
  }

  private isDuplicate(key: string): boolean {
    const exp = this.seen.get(key);
    if (!exp) return false;
    if (exp < Date.now()) {
      this.seen.delete(key);
      return false;
    }
    return true;
  }

  private remember(key: string): void {
    this.seen.set(key, Date.now() + this.dedupTtlMs);
    // Opportunistic sweep to keep the map bounded.
    if (this.seen.size > 500) {
      const now = Date.now();
      for (const [k, exp] of this.seen) if (exp < now) this.seen.delete(k);
    }
  }
}

export const notificationService = new NotificationService();
