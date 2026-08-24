import { Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { uiState } from "@/lib/ui-state";
import { Avatar } from "@/components/Avatar";
import { Stars } from "@/components/Stars";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { SettingsSheet } from "@/components/SettingsSheet";
import { ShareIdDialog } from "@/components/ShareIdDialog";
import { FollowListDialog } from "@/components/FollowListDialog";
import { Settings, Grid3x3, BookOpen, ListChecks, UserPlus, Check, Share2, Pencil, Loader2, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMyProfile, useAuth, type Profile } from "@/lib/auth";
import { mockCoverFor } from "@/data/mock";
import { AlbumCover } from "@/components/AlbumCover";
import { IDENTITIES, computeTasteStats } from "@/lib/identities";
import { toast } from "sonner";
import { notificationService } from "@/lib/notifications";

type Tab = "posts" | "diary" | "tolisten";
type Log = {
  id: string; album_key: string; title: string; artist: string; year: number | null;
  cover_url: string | null; rating: number | null; review: string | null; listened_at: string; genre: string | null;
};
type Watch = {
  id: string; album_key: string; title: string; artist: string; year: number | null;
  cover_url: string | null; genre: string | null; done: boolean; created_at: string;
};

export function ProfileView({ profile, fromProfile = false }: { profile: Profile; fromProfile?: boolean }) {
  const { data: me } = useMyProfile();
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMe = me?.id === profile.id;
  const [tab, setTab] = useState<Tab>(uiState.profileTab);
  function switchTab(t: Tab) {
    uiState.profileTab = t;
    setTab(t);
  }
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [followList, setFollowList] = useState<null | "followers" | "following">(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { data: logs } = useQuery({
    queryKey: ["logs", profile.id],
    queryFn: async (): Promise<Log[]> => {
      const { data } = await supabase
        .from("album_logs")
        .select("id, album_key, title, artist, year, cover_url, rating, review, listened_at, genre")
        .eq("user_id", profile.id)
        .order("listened_at", { ascending: false });
      return (data as Log[]) ?? [];
    },
  });

  const { data: watchlist } = useQuery({
    queryKey: ["watchlist", profile.id],
    queryFn: async (): Promise<Watch[]> => {
      const { data } = await supabase
        .from("watchlist")
        .select("id, album_key, title, artist, year, cover_url, genre, done, created_at")
        .eq("user_id", profile.id)
        .order("done", { ascending: true })
        .order("created_at", { ascending: false });
      return (data as Watch[]) ?? [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["profileCounts", profile.id],
    queryFn: async () => {
      const [{ count: tracked }, { count: followers }, { count: following }] = await Promise.all([
        supabase.from("album_logs").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
      ]);
      return { tracked: tracked ?? 0, followers: followers ?? 0, following: following ?? 0 };
    },
  });


  async function uploadAvatar(file: File) {
    if (!isMe || !session) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      // private bucket → signed URL with 10-year TTL
      const { data: signed, error: sErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (sErr) throw sErr;
      await supabase.from("profiles").update({ avatar_url: signed.signedUrl, updated_at: new Date().toISOString() }).eq("id", profile.id);
      qc.invalidateQueries();
    } catch (e: any) {
      alert("Upload failed: " + (e?.message ?? "unknown"));
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Detect newly unlocked identities: persist to identity_unlocks, toast on new ones.
  useEffect(() => {
    if (!isMe || !logs || !watchlist) return;
    (async () => {
      const stats = computeTasteStats({ logs: logs as any, watchlistCount: watchlist.length });
      const unlocked = IDENTITIES.filter((i) => i.unlocked(stats)).map((i) => i.key);
      if (unlocked.length === 0) return;
      const { data: existing } = await supabase
        .from("identity_unlocks")
        .select("identity_key")
        .eq("user_id", profile.id);
      const known = new Set((existing ?? []).map((r: any) => r.identity_key));
      const fresh = unlocked.filter((k) => !known.has(k));
      if (fresh.length === 0) return;
      const rows = fresh.map((k) => ({ user_id: profile.id, identity_key: k }));
      await supabase.from("identity_unlocks").insert(rows);
      // If nothing was known before, this is a first-time backfill: seed silently.
      const seeding = known.size === 0 && unlocked.length > 1;
      if (!seeding) {
        fresh.forEach((k) => {
          const it = IDENTITIES.find((i) => i.key === k)!;
          toast(`${it.emoji} Identity unlocked: ${it.label}`, { description: it.description });
        });
      }
      qc.invalidateQueries({ queryKey: ["activityNotifs"] });
    })();
  }, [isMe, logs, watchlist, profile.id, qc]);

  const albumLinkState = fromProfile ? { from: "profile" as const } : undefined;

  return (
    <>
      <div className="px-5 pt-4 flex justify-between items-start">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">@{profile.handle}</span>
        {isMe && (
          <button onClick={() => setSettingsOpen(true)} className="opacity-60 hover:opacity-100"><Settings className="size-4" /></button>
        )}
      </div>

      <div className="px-5 pt-4 flex items-center gap-5">
        <Avatar
          handle={profile.handle}
          name={profile.name}
          url={profile.avatar_url}
          size={80}
          ring
          onUpload={isMe ? uploadAvatar : undefined}
          uploading={uploadingAvatar}
        />
        <div className="flex-1 grid grid-cols-3 text-center">
          <Stat value={counts?.tracked ?? 0} label="Albums" />
          <Stat value={counts?.followers ?? 0} label="Followers" onClick={() => setFollowList("followers")} />
          <Stat value={counts?.following ?? 0} label="Following" onClick={() => setFollowList("following")} />
        </div>
      </div>

      <div className="px-5 mt-4">
        <h1 className="font-extrabold text-lg tracking-tight">{profile.name}</h1>
        {profile.identity && (
          <span className="inline-block mt-1 px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent text-[10px] font-mono font-medium uppercase">
            {profile.identity}
          </span>
        )}
        {profile.bio_short && <p className="mt-3 text-sm text-muted leading-relaxed">{profile.bio_short}</p>}
        {profile.bio_long && <p className="mt-2 text-sm text-muted leading-relaxed whitespace-pre-line">{profile.bio_long}</p>}

        <div className="flex gap-2 mt-4">
          {isMe ? (
            <>
              <button onClick={() => setEditing(true)} className="flex-1 bg-foreground text-background py-2 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                <Pencil className="size-3.5" /> Edit profile
              </button>
              <button onClick={() => setShareOpen(true)} className="flex-1 border border-border py-2 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                <Share2 className="size-3.5" /> Share
              </button>
            </>
          ) : (
            <>
              <FollowButton targetId={profile.id} />
              <button
                onClick={() => navigate({ to: "/messages/$handle", params: { handle: profile.handle } })}
                className="flex-1 border border-border py-2 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <MessageSquare className="size-3.5" /> Message
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 border-y border-border grid grid-cols-3">
        <TabBtn active={tab === "posts"} onClick={() => switchTab("posts")} icon={<Grid3x3 className="size-4" />} />
        <TabBtn active={tab === "diary"} onClick={() => switchTab("diary")} icon={<BookOpen className="size-4" />} />
        <TabBtn active={tab === "tolisten"} onClick={() => switchTab("tolisten")} icon={<ListChecks className="size-4" />} />
      </div>

      {!logs && <div className="py-8 flex justify-center"><Loader2 className="size-5 animate-spin text-muted" /></div>}

      {tab === "posts" && logs && (
        logs.length === 0 ? (
          <p className="text-sm text-muted text-center py-12 px-5">No albums tracked yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-px bg-border mt-px">
            {logs.map((l) => {
              const cover = l.cover_url || mockCoverFor(l.album_key);
              return (
                <Link key={l.id} to="/album/$id" params={{ id: l.album_key }} state={albumLinkState as any} className="aspect-square block bg-background relative [container-type:inline-size]">
                  <AlbumCover src={cover} title={l.title} artist={l.artist} className="size-full" />
                  {l.rating ? (
                    <span className="absolute bottom-1 left-1 text-[9px] font-mono px-1 py-0.5 bg-background/80 text-accent rounded-xs">★ {l.rating}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )
      )}

      {tab === "diary" && logs && <DiaryView logs={logs} fromProfile={fromProfile} />}
      {tab === "tolisten" && <ToListenView items={watchlist} isMe={isMe} fromProfile={fromProfile} />}

      {editing && me && <EditProfileDialog profile={me} onClose={() => setEditing(false)} />}
      {settingsOpen && me && <SettingsSheet profileId={me.id} onClose={() => setSettingsOpen(false)} />}
      {shareOpen && me && <ShareIdDialog me={me} onClose={() => setShareOpen(false)} />}
      {followList && <FollowListDialog profileId={profile.id} mode={followList} onClose={() => setFollowList(null)} />}
    </>
  );
}

function FollowButton({ targetId }: { targetId: string }) {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const [following, setFollowing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!me) return;
    supabase.from("follows").select("follower_id").eq("follower_id", me.id).eq("following_id", targetId).maybeSingle()
      .then(({ data }) => { setFollowing(!!data); setLoaded(true); });
  }, [me, targetId]);

  async function toggle() {
    if (!me) return;
    if (following) {
      setFollowing(false);
      await supabase.from("follows").delete().eq("follower_id", me.id).eq("following_id", targetId);
    } else {
      setFollowing(true);
      await supabase.from("follows").insert({ follower_id: me.id, following_id: targetId });
      void notificationService.notify({
        type: "follow",
        actorId: me.id,
        recipientId: targetId,
        actorName: me.name ?? me.handle,
      });
    }
    qc.invalidateQueries();
  }

  return (
    <button onClick={toggle} disabled={!loaded} className={`flex-1 py-2 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${following ? "border border-border text-muted" : "bg-foreground text-background"}`}>
      {following ? <><Check className="size-3.5" /> Following</> : <><UserPlus className="size-3.5" /> Follow</>}
    </button>
  );
}

function Stat({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="block font-mono text-lg font-bold">{value.toLocaleString()}</span>
      <span className="text-[9px] text-muted uppercase tracking-widest">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="hover:opacity-70 transition-opacity">
        {content}
      </button>
    );
  }
  return <div>{content}</div>;
}
function TabBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`py-3 flex items-center justify-center border-b-2 transition-colors ${active ? "border-foreground text-foreground" : "border-transparent text-muted"}`}>
      {icon}
    </button>
  );
}

function DiaryView({ logs, fromProfile }: { logs: Log[]; fromProfile: boolean }) {
  const groups = new Map<string, Log[]>();
  logs.forEach((l) => {
    const d = new Date(l.listened_at);
    const k = d.toLocaleString("en", { month: "long", year: "numeric" });
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  });
  const albumLinkState = fromProfile ? { from: "profile" as const } : undefined;
  return (
    <div className="px-5 py-6 space-y-8">
      {Array.from(groups.entries()).map(([month, entries]) => (
        <div key={month}>
          <h2 className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">{month}</h2>
          <div className="space-y-3">
            {entries.map((l) => {
              const cover = l.cover_url || mockCoverFor(l.album_key);
              return (
                <Link to="/album/$id" params={{ id: l.album_key }} state={albumLinkState as any} key={l.id} className="flex items-center gap-3">
                  <div className="size-12 rounded-xs shrink-0 overflow-hidden bg-secondary [container-type:inline-size]">
                    <AlbumCover src={cover} title={l.title} artist={l.artist} className="size-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{l.title}</p>
                    <div className="flex items-center gap-2">
                      {l.rating ? <Stars value={l.rating} /> : <span className="text-[10px] text-muted">no rating</span>}
                      <span className="text-[10px] font-mono text-muted">{new Date(l.listened_at).toLocaleDateString("en", { day: "2-digit", month: "short" })}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToListenView({ items, isMe, fromProfile }: { items: Watch[] | undefined; isMe: boolean; fromProfile: boolean }) {
  const qc = useQueryClient();
  if (!items) return <div className="py-8 flex justify-center"><Loader2 className="size-5 animate-spin text-muted" /></div>;
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-12 px-5">
        {isMe ? "No albums in your to-listen list yet. Open any album and tap “To listen” to save it here." : "Nothing saved here yet."}
      </p>
    );
  }
  const albumLinkState = fromProfile ? { from: "profile" as const } : undefined;

  async function remove(w: Watch) {
    await supabase.from("watchlist").delete().eq("id", w.id);
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  }

  return (
    <div className="px-5 py-5 space-y-2">
      {items.map((w) => {
        const cover = w.cover_url || mockCoverFor(w.album_key);
        return (
          <div key={w.id} className="flex items-center gap-3 border border-border rounded-sm p-2.5">
            <Link to="/album/$id" params={{ id: w.album_key }} state={albumLinkState as any} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="size-12 rounded-xs shrink-0 overflow-hidden bg-secondary [container-type:inline-size]">
                <AlbumCover src={cover} title={w.title} artist={w.artist} className="size-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{w.title}</p>
                <p className="text-[11px] text-muted truncate">{w.artist}{w.year ? ` • ${w.year}` : ""}</p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-accent shrink-0">Rate →</span>
            </Link>
            {isMe && (
              <button onClick={() => remove(w)} className="text-muted hover:text-destructive p-1.5 shrink-0" aria-label="Remove">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
