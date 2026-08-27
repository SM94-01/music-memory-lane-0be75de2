import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";

/** Number of notification-worthy events that happened after the user last opened Activity. */
export function useUnreadNotifications() {
  const { data: me } = useMyProfile();
  const seenAt = (me as { notifications_seen_at?: string } | undefined)?.notifications_seen_at;

  return useQuery({
    queryKey: ["unreadNotifs", me?.id, seenAt],
    enabled: !!me,
    refetchInterval: 60_000,
    queryFn: async () => {
      const meId = me!.id;
      const since = seenAt ?? new Date(0).toISOString();

      const { data: myLogs } = await supabase.from("album_logs").select("id").eq("user_id", meId);
      const logIds = (myLogs ?? []).map((l) => l.id);

      const head = { count: "exact" as const, head: true };
      const [follows, shares, unlocks, likes, comments] = await Promise.all([
        supabase.from("follows").select("*", head).eq("following_id", meId).gt("created_at", since),
        supabase.from("album_shares").select("*", head).eq("to_user_id", meId).gt("created_at", since),
        supabase.from("identity_unlocks").select("*", head).eq("user_id", meId).gt("unlocked_at", since),
        logIds.length
          ? supabase.from("likes").select("*", head).in("log_id", logIds).neq("user_id", meId).gt("created_at", since)
          : Promise.resolve({ count: 0 }),
        logIds.length
          ? supabase.from("comments").select("*", head).in("log_id", logIds).neq("user_id", meId).gt("created_at", since)
          : Promise.resolve({ count: 0 }),
      ]);

      return [follows, shares, unlocks, likes, comments].reduce(
        (sum, r) => sum + ((r as { count: number | null }).count ?? 0),
        0,
      );
    },
  });
}

/** Marks every current notification as read. */
export function useMarkNotificationsRead() {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  return async () => {
    if (!me) return;
    await supabase
      .from("profiles")
      .update({ notifications_seen_at: new Date().toISOString() })
      .eq("id", me.id);
    await qc.invalidateQueries({ queryKey: ["myProfile"] });
    await qc.invalidateQueries({ queryKey: ["unreadNotifs"] });
  };
}
