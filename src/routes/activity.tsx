import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { SwipeToDelete } from "@/components/SwipeToDelete";
import { ArrowLeft, Heart, MessageCircle, UserPlus, Send, Loader2, Sparkles } from "lucide-react";
import { IDENTITIES } from "@/lib/identities";
import { uiState } from "@/lib/ui-state";
import { useEffect, useState } from "react";
import { useMarkNotificationsRead } from "@/lib/unread";
import { formatDistanceToNowStrict } from "date-fns";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity — TraX" }] }),
  component: ActivityPage,
});

type Tab = "notifications" | "messages";

function ActivityPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(uiState.activityTab);
  const markRead = useMarkNotificationsRead();
  useEffect(() => {
    void markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const switchTab = (t: Tab) => {
    uiState.activityTab = t;
    setTab(t);
  };

  return (
    <MobileShell hideNav>
      <div className="px-5 pt-3">
        <button
          onClick={() => router.history.back()}
          className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted mb-4 hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Back
        </button>
        <h1 className="text-3xl font-extrabold tracking-tighter mb-5">Activity</h1>
        <div className="flex gap-1 p-1 bg-secondary/60 rounded-full mb-6">
          <TabBtn active={tab === "notifications"} onClick={() => switchTab("notifications")}>Notifications</TabBtn>
          <TabBtn active={tab === "messages"} onClick={() => switchTab("messages")}>Messages</TabBtn>
        </div>
      </div>
      {tab === "notifications" ? <NotificationsList /> : <MessagesList />}
    </MobileShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-full ${active ? "bg-foreground text-background" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

type NotifItem = {
  key: string;
  kind: "follow" | "like" | "comment" | "share" | "identity";
  created_at: string;
  actor: { handle: string; name: string; avatar_url: string | null } | null;
  albumTitle?: string;
  albumKey?: string;
  preview?: string;
  identityKey?: string;
};


function shortTime(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: false })
    .replace(/ (year|month|week|day|hour|minute|second)s?/, (_, u) => u[0]);
}

function NotificationsList() {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const { data: items, isLoading } = useQuery({
    queryKey: ["activityNotifs", me?.id],
    enabled: !!me,
    queryFn: async (): Promise<NotifItem[]> => {
      const meId = me!.id;
      const [follows, myLogs, shares, unlocks, hidden] = await Promise.all([
        supabase
          .from("follows")
          .select("created_at, actor:profiles!follows_follower_id_fkey(handle, name, avatar_url)")
          .eq("following_id", meId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("album_logs")
          .select("id, album_key, title")
          .eq("user_id", meId),
        supabase
          .from("album_shares")
          .select("id, created_at, album_key, title, actor:profiles!album_shares_from_user_id_fkey(handle, name, avatar_url)")
          .eq("to_user_id", meId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("identity_unlocks")
          .select("id, identity_key, unlocked_at")
          .eq("user_id", meId)
          .order("unlocked_at", { ascending: false })
          .limit(50),
        supabase.from("hidden_notifications").select("notif_key").eq("user_id", meId),
      ]);
      const hiddenKeys = new Set((hidden.data ?? []).map((h) => h.notif_key));

      const logIds = (myLogs.data ?? []).map((l) => l.id);
      const logMap = new Map((myLogs.data ?? []).map((l) => [l.id, l]));

      const [likesRes, commentsRes] = await Promise.all([
        logIds.length
          ? supabase
              .from("likes")
              .select("log_id, user_id, created_at, actor:profiles!likes_user_id_fkey(handle, name, avatar_url)")
              .in("log_id", logIds)
              .neq("user_id", meId)
              .order("created_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as any[] }),
        logIds.length
          ? supabase
              .from("comments")
              .select("log_id, user_id, body, created_at, actor:profiles!comments_user_id_fkey(handle, name, avatar_url)")
              .in("log_id", logIds)
              .neq("user_id", meId)
              .order("created_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const list: NotifItem[] = [];
      (follows.data ?? []).forEach((f: any) =>
        list.push({ key: `f-${f.actor?.handle}-${f.created_at}`, kind: "follow", created_at: f.created_at, actor: f.actor })
      );
      (likesRes.data ?? []).forEach((l: any) => {
        const log = logMap.get(l.log_id);
        list.push({
          key: `l-${l.user_id}-${l.log_id}`,
          kind: "like",
          created_at: l.created_at,
          actor: l.actor,
          albumTitle: log?.title,
          albumKey: log?.album_key,
        });
      });
      (commentsRes.data ?? []).forEach((c: any) => {
        const log = logMap.get(c.log_id);
        list.push({
          key: `c-${c.user_id}-${c.log_id}-${c.created_at}`,
          kind: "comment",
          created_at: c.created_at,
          actor: c.actor,
          albumTitle: log?.title,
          albumKey: log?.album_key,
          preview: c.body,
        });
      });
      (shares.data ?? []).forEach((s: any) =>
        list.push({
          key: `s-${s.id}`,
          kind: "share",
          created_at: s.created_at,
          actor: s.actor,
          albumTitle: s.title,
          albumKey: s.album_key,
        })
      );
      (unlocks.data ?? []).forEach((u: any) =>
        list.push({
          key: `id-${u.id}`,
          kind: "identity",
          created_at: u.unlocked_at,
          actor: null,
          identityKey: u.identity_key,
        })
      );

      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return list.filter((n) => !hiddenKeys.has(n.key)).slice(0, 100);
    },
  });

  async function clearAll() {
    if (!me || !items || items.length === 0) return;
    await supabase
      .from("hidden_notifications")
      .insert(items.map((n) => ({ user_id: me.id, notif_key: n.key })));
    qc.invalidateQueries({ queryKey: ["activityNotifs"] });
  }

  if (isLoading) return <div className="px-5"><Loader2 className="size-5 animate-spin text-muted" /></div>;
  if (!items || items.length === 0) return <p className="px-5 text-sm text-muted text-center py-12">No notifications yet.</p>;

  return (
    <div className="px-5">
      <div className="flex justify-end mb-3">
        <button
          onClick={clearAll}
          className="text-[10px] font-mono uppercase tracking-widest text-destructive hover:opacity-70"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-3">
      {items.map((n) => {
        const identity = n.identityKey ? IDENTITIES.find((i) => i.key === n.identityKey) : null;
        return (
        <li key={n.key}>
        <div className="flex items-center gap-3 border-b border-border pb-3">
          {n.kind === "identity" ? (
            <span className="size-10 rounded-full bg-accent/10 text-accent grid place-items-center text-lg shrink-0">{identity?.emoji ?? "✨"}</span>
          ) : (
            <Link to="/u/$handle" params={{ handle: n.actor?.handle ?? "" }}>
              <Avatar handle={n.actor?.handle ?? ""} name={n.actor?.name} url={n.actor?.avatar_url ?? null} size={40} />
            </Link>
          )}
          <div className="flex-1 min-w-0 text-sm">
            <p className="leading-snug">
              {n.kind === "identity" ? (
                <>
                  <span className="font-bold">Identity unlocked</span>{" "}
                  <span className="text-muted">— <span className="text-foreground">{identity?.label ?? n.identityKey}</span></span>
                </>
              ) : (
                <>
                  <Link to="/u/$handle" params={{ handle: n.actor?.handle ?? "" }} className="font-bold hover:text-accent">
                    {n.actor?.name ?? "Someone"}
                  </Link>{" "}
                  <span className="text-muted">
                    {n.kind === "follow" && "started following you"}
                    {n.kind === "like" && (
                      <>liked your log{n.albumTitle ? <> of “<span className="text-foreground">{n.albumTitle}</span>”</> : null}</>
                    )}
                    {n.kind === "comment" && (
                      <>commented{n.albumTitle ? <> on “<span className="text-foreground">{n.albumTitle}</span>”</> : null}
                        {n.preview ? <>: <span className="italic">{n.preview.slice(0, 60)}</span></> : null}
                      </>
                    )}
                    {n.kind === "share" && (
                      <>shared “<span className="text-foreground">{n.albumTitle}</span>” with you</>
                    )}
                  </span>
                </>
              )}
            </p>
            <p className="text-[10px] font-mono text-muted mt-0.5 flex items-center gap-1.5">
              {n.kind === "follow" && <UserPlus className="size-3" />}
              {n.kind === "like" && <Heart className="size-3" />}
              {n.kind === "comment" && <MessageCircle className="size-3" />}
              {n.kind === "share" && <Send className="size-3" />}
              {n.kind === "identity" && <Sparkles className="size-3" />}
              {shortTime(n.created_at)}
            </p>
          </div>
          {n.albumKey && (n.kind === "share" || n.kind === "like" || n.kind === "comment") && (
            <Link
              to="/album/$id"
              params={{ id: n.albumKey }}
              className="text-[10px] font-mono uppercase tracking-widest text-accent shrink-0"
            >
              View
            </Link>
          )}
        </div>
        </li>
        );
      })}
      </ul>
    </div>
  );
}

type Thread = {
  peer: { id: string; handle: string; name: string; avatar_url: string | null };
  last: string;
  at: string;
  fromMe: boolean;
};

function MessagesList() {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const { data: threads, isLoading } = useQuery({
    queryKey: ["activityThreads", me?.id],
    enabled: !!me,
    queryFn: async (): Promise<Thread[]> => {
      const meId = me!.id;
      const [{ data: msgs }, { data: hiddenRows }] = await Promise.all([
        supabase
          .from("messages")
          .select("id, sender_id, recipient_id, body, created_at")
          .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("hidden_threads").select("peer_id, hidden_at").eq("user_id", meId),
      ]);
      const hiddenAt = new Map((hiddenRows ?? []).map((h) => [h.peer_id, h.hidden_at]));
      const byPeer = new Map<string, { last: string; at: string; fromMe: boolean }>();
      const peerIds = new Set<string>();
      (msgs ?? []).forEach((m) => {
        const peer = m.sender_id === meId ? m.recipient_id : m.sender_id;
        const cut = hiddenAt.get(peer);
        if (cut && new Date(m.created_at) <= new Date(cut)) return;
        peerIds.add(peer);
        if (!byPeer.has(peer)) byPeer.set(peer, { last: m.body, at: m.created_at, fromMe: m.sender_id === meId });
      });
      if (peerIds.size === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, handle, name, avatar_url")
        .in("id", Array.from(peerIds));
      const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
      const out: Thread[] = [];
      for (const [pid, info] of byPeer) {
        const p = profMap.get(pid);
        if (!p) continue;
        out.push({ peer: p as Thread["peer"], ...info });
      }
      out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return out;
    },
  });

  async function hideThread(peerId: string) {
    if (!me) return;
    await supabase
      .from("hidden_threads")
      .upsert(
        { user_id: me.id, peer_id: peerId, hidden_at: new Date().toISOString() },
        { onConflict: "user_id,peer_id" },
      );
    qc.invalidateQueries({ queryKey: ["activityThreads"] });
  }

  if (isLoading) return <div className="px-5"><Loader2 className="size-5 animate-spin text-muted" /></div>;
  if (!threads || threads.length === 0) return <p className="px-5 text-sm text-muted text-center py-12">No messages yet.</p>;

  return (
    <ul className="px-5 space-y-3">
      {threads.map((t) => (
        <li key={t.peer.id}>
          <SwipeToDelete onDelete={() => hideThread(t.peer.id)} confirmText={`Delete the conversation with ${t.peer.name}?`}>
            <Link
              to="/messages/$handle"
              params={{ handle: t.peer.handle }}
              className="flex items-center gap-3 border-b border-border pb-3"
            >
              <Avatar handle={t.peer.handle} name={t.peer.name} url={t.peer.avatar_url} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold truncate">{t.peer.name}</p>
                  <span className="text-[10px] font-mono text-muted shrink-0">{shortTime(t.at)}</span>
                </div>
                <p className="text-xs text-muted truncate">
                  {t.fromMe ? "You: " : ""}{t.last}
                </p>
              </div>
            </Link>
          </SwipeToDelete>
        </li>
      ))}
    </ul>
  );
}
