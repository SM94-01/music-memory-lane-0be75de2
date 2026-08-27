import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";

/** Number of notification-worthy events that happened after the user last opened Activity. */
export function useUnreadNotifications() {
  const { data: me } = useMyProfile();
  const queryClient = useQueryClient();
  const seenAt = (me as { notifications_seen_at?: string } | undefined)?.notifications_seen_at;

  const query = useQuery({
    queryKey: ["unreadNotifs", me?.id, seenAt],
    enabled: !!me,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!me) return 0;
      const meId = me.id;
      const since = seenAt ?? new Date(0).toISOString();

      const { data: myLogs } = await supabase.from("album_logs").select("id").eq("user_id", meId);
      const logIds = (myLogs ?? []).map((l) => l.id);

      const head = { count: "exact" as const, head: true };
      const [follows, shares, unlocks, messages, likes, comments] = await Promise.all([
        supabase.from("follows").select("*", head).eq("following_id", meId).gt("created_at", since),
        supabase.from("album_shares").select("*", head).eq("to_user_id", meId).gt("created_at", since),
        supabase.from("identity_unlocks").select("*", head).eq("user_id", meId).gt("unlocked_at", since),
        supabase.from("messages").select("*", head).eq("recipient_id", meId).gt("created_at", since),
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

  useEffect(() => {
    if (!me) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["unreadNotifs"] });
    window.addEventListener("trax:notification-received", refresh);
    const channel = supabase
      .channel(`unread-${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows", filter: `following_id=eq.${me.id}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "album_shares", filter: `to_user_id=eq.${me.id}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "identity_unlocks", filter: `user_id=eq.${me.id}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${me.id}` }, refresh)
      .subscribe();
    return () => {
      window.removeEventListener("trax:notification-received", refresh);
      void supabase.removeChannel(channel);
    };
  }, [me, queryClient]);

  return query;
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
