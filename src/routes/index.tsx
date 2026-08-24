import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { Stars } from "@/components/Stars";
import { Avatar } from "@/components/Avatar";
import { CommentsSheet } from "@/components/CommentsSheet";
import { Bell, Heart, MessageCircle, Loader2, Send, X, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { mockCoverFor } from "@/data/mock";
import { AlbumCover } from "@/components/AlbumCover";
import { notificationService } from "@/lib/notifications";
import { fetchTasteFingerprint } from "@/lib/taste";
import { searchSpotifyByGenre, searchSpotifyArtists, getSpotifyArtist } from "@/lib/spotify";
import { uiState } from "@/lib/ui-state";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Explore — TraX" }] }),
  component: ExplorePage,
});

type Tab = "following" | "suggested";

function ExplorePage() {
  const [tab, setTab] = useState<Tab>(uiState.exploreTab);
  const switchTab = (t: Tab) => {
    uiState.exploreTab = t;
    setTab(t);
  };
  return (
    <MobileShell>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-3xl font-extrabold tracking-tighter">Explore</h1>
          <Link
            to="/activity"
            aria-label="Activity"
            className="size-10 -mr-2 grid place-items-center rounded-full text-muted hover:text-foreground hover:bg-secondary/60"
          >
            <Bell className="size-5" />
          </Link>
        </div>
        <div className="flex gap-1 p-1 bg-secondary/60 rounded-full mb-6">
          <TabBtn active={tab === "following"} onClick={() => switchTab("following")}>Following</TabBtn>
          <TabBtn active={tab === "suggested"} onClick={() => switchTab("suggested")}>Suggested</TabBtn>
        </div>
      </div>
      {tab === "following" ? <FollowingFeed onDiscover={() => switchTab("suggested")} /> : <SuggestedTab />}
    </MobileShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-full ${active ? "bg-foreground text-background" : "text-muted"}`}>
      {children}
    </button>
  );
}

type LogRow = {
  id: string; album_key: string; title: string; artist: string; year: number | null;
  cover_url: string | null; genre: string | null; rating: number | null; review: string | null;
  created_at: string;
  user: { id: string; handle: string; name: string; avatar_url: string | null } | null;
  likes: { count: number }[];
  comments: { count: number }[];
};

function FollowingFeed({ onDiscover }: { onDiscover: () => void }) {
  const { data: me } = useMyProfile();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", me!.id);
      const ids = (follows ?? []).map((f) => f.following_id);
      if (ids.length === 0) return { followingCount: 0, logs: [] as LogRow[] };
      const { data } = await supabase
        .from("album_logs")
        .select("id, album_key, title, artist, year, cover_url, genre, rating, review, created_at, user:profiles!album_logs_user_id_fkey(id, handle, name, avatar_url), likes(count), comments(count)")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(30);
      return { followingCount: ids.length, logs: (data as unknown as LogRow[]) ?? [] };
    },
  });
  const feed = data?.logs;

  if (isLoading) return <div className="px-5"><Loader2 className="size-5 animate-spin text-muted" /></div>;
  if (!feed || feed.length === 0) {
    const following = (data?.followingCount ?? 0) > 0;
    return (
      <div className="px-5 text-center py-12">
        <p className="text-sm text-muted mb-4">
          {following
            ? "Nobody you follow has logged an album yet."
            : "You're not following anyone yet."}
        </p>
        <button onClick={onDiscover} className="text-xs font-mono uppercase tracking-widest text-accent">Discover people →</button>
      </div>
    );
  }


  return (
    <section className="px-5 space-y-12 mt-2">
      {feed.map((item) => <FeedCard key={item.id} item={item} />)}
    </section>
  );
}

function FeedCard({ item }: { item: LogRow }) {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likes[0]?.count ?? 0);
  const [commentCount, setCommentCount] = useState(item.comments[0]?.count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const cover = item.cover_url || mockCoverFor(item.album_key);

  useEffect(() => {
    if (!me) return;
    supabase.from("likes").select("user_id").eq("log_id", item.id).eq("user_id", me.id).maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [me, item.id]);

  useEffect(() => {
    setCommentCount(item.comments[0]?.count ?? 0);
  }, [item.comments]);

  async function toggleLike() {
    if (!me) return;
    if (liked) {
      setLiked(false); setLikeCount((c) => c - 1);
      await supabase.from("likes").delete().eq("log_id", item.id).eq("user_id", me.id);
    } else {
      setLiked(true); setLikeCount((c) => c + 1);
      await supabase.from("likes").insert({ log_id: item.id, user_id: me.id });
      void notificationService.notify({
        type: "like",
        actorId: me.id,
        logId: item.id,
        actorName: me.name ?? me.handle,
        albumTitle: item.title,
      });
    }
    qc.invalidateQueries({ queryKey: ["feed"] });
  }

  const time = formatDistanceToNowStrict(new Date(item.created_at), { addSuffix: false }).replace(/ (year|month|week|day|hour|minute|second)s?/, (_, u) => u[0]);

  return (
    <article>
      <div className="flex items-center gap-3 mb-4">
        <Link to="/u/$handle" params={{ handle: item.user?.handle ?? "" }}>
          <Avatar handle={item.user?.handle ?? ""} name={item.user?.name} url={item.user?.avatar_url} size={28} />
        </Link>
        <p className="text-sm italic font-medium">
          <Link to="/u/$handle" params={{ handle: item.user?.handle ?? "" }} className="not-italic font-bold hover:text-accent">{item.user?.name}</Link>
          {" "}<span className="text-muted not-italic font-normal">listened to</span>
        </p>
        <span className="ml-auto text-[10px] font-mono text-muted">{time}</span>
      </div>

      <Link to="/album/$id" params={{ id: item.album_key }} className="flex gap-4">
        <div className="w-32 aspect-square shrink-0 rounded-sm overflow-hidden bg-secondary [container-type:inline-size]">
          <AlbumCover src={cover} title={item.title} artist={item.artist} className="w-full h-full" />
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <h3 className="font-bold text-lg leading-tight text-pretty">{item.title}</h3>
          <p className="text-sm text-muted mb-2">{item.artist}{item.year ? ` • ${item.year}` : ""}</p>
          {item.rating ? <Stars value={item.rating} /> : null}
        </div>
      </Link>

      {item.review && <p className="mt-3 text-sm text-muted leading-relaxed line-clamp-3">{item.review}</p>}

      <div className="mt-3 flex gap-5 text-[11px] font-mono text-muted">
        <button onClick={toggleLike} className={`flex items-center gap-1.5 transition-colors ${liked ? "text-accent" : "hover:text-accent"}`}>
          <Heart className={`size-3.5 ${liked ? "fill-current" : ""}`} /> {likeCount}
        </button>
        <button onClick={() => setShowComments(true)} className={`flex items-center gap-1.5 hover:text-accent ${commentCount > 0 ? "text-foreground" : ""}`}>
          <MessageCircle className={`size-3.5 ${commentCount > 0 ? "fill-current" : ""}`} /> {commentCount}
        </button>
      </div>

      {showComments && <CommentsSheet logId={item.id} onClose={() => setShowComments(false)} onCountChange={setCommentCount} />}
    </article>
  );
}

function SuggestedTab() {
  const { data: me } = useMyProfile();
  const { data: taste } = useQuery({
    queryKey: ["taste", me?.id],
    enabled: !!me,
    queryFn: () => fetchTasteFingerprint(me!.id),
  });
  const loggedGenres = usableSpotifyGenres(taste?.topGenres ?? []);
  const topArtists = taste?.topArtists ?? [];

  // Many logs have no genre attached — derive genres from the user's logged artists instead.
  const { data: derivedGenres } = useQuery({
    queryKey: ["taste-derived-genres", topArtists.join("|")],
    enabled: loggedGenres.length === 0 && topArtists.length > 0,
    queryFn: async () => {
      const res = await Promise.all(
        topArtists.slice(0, 3).map((name) =>
          searchSpotifyArtists(name)
            .then((r) => {
              const exact = r.find((a) => a.name.toLowerCase() === name);
              return [...(exact?.genres ?? []), ...r.slice(0, 3).flatMap((a) => a.genres ?? [])];
            })
            .catch(() => [] as string[]),
        ),
      );

      return usableSpotifyGenres(res.flat());
    },
  });

  const topGenres = (loggedGenres.length > 0 ? loggedGenres : derivedGenres ?? []).slice(0, 3);
  const hasTaste = topArtists.length > 0 || loggedGenres.length > 0;

  const { data: similarUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["suggested-similar-users", me?.id, topGenres.join("|"), topArtists.join("|")],
    enabled: !!me && hasTaste,
    queryFn: async () => {
      const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", me!.id);
      const excluded = new Set<string>([me!.id, ...(follows ?? []).map((f) => f.following_id)]);
      const { data: logs } = await supabase
        .from("album_logs")
        .select("user_id, genre, artist")
        .order("created_at", { ascending: false })
        .limit(500);
      const genreSet = new Set(topGenres);
      const artistSet = new Set(topArtists);
      const scoreMap = new Map<string, number>();
      (logs ?? []).forEach((l) => {
        if (!l.user_id || excluded.has(l.user_id)) return;
        let s = 0;
        if (l.genre && genreSet.has(l.genre.toLowerCase())) s += 2;
        if (l.artist && artistSet.has(l.artist.toLowerCase())) s += 3;
        scoreMap.set(l.user_id, (scoreMap.get(l.user_id) ?? 0) + s);
      });
      let top = [...scoreMap.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (top.length === 0) {
        // Fallback: suggest the most active listeners the user doesn't follow yet.
        const counts = new Map<string, number>();
        (logs ?? []).forEach((l) => {
          if (!l.user_id || excluded.has(l.user_id)) return;
          counts.set(l.user_id, (counts.get(l.user_id) ?? 0) + 1);
        });
        top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => [id, 0] as [string, number]);
      }
      if (top.length === 0) {
        // Nobody has logged yet — surface recent members instead of an empty list.
        const { data: recent } = await supabase
          .from("profiles")
          .select("id, handle, name, identity, avatar_url")
          .order("created_at", { ascending: false })
          .limit(20);
        return (recent ?? [])
          .filter((p) => !excluded.has(p.id))
          .slice(0, 5)
          .map((user) => ({ user, score: 0 }));
      }
      const ids = top.map(([id]) => id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, handle, name, identity, avatar_url")
        .in("id", ids);
      return top
        .map(([id, score]) => ({ user: (profiles ?? []).find((p) => p.id === id), score }))
        .filter((x) => x.user) as { user: any; score: number }[];
    },
  });

  const { data: genreAlbums, isLoading: albumsLoading } = useQuery({
    queryKey: ["suggested-genre-albums", topGenres.join("|"), topArtists.join("|")],
    enabled: hasTaste,
    queryFn: async () => {
      const seen = new Set<string>();
      const merged: any[] = [];
      const push = (list: any[]) => {
        for (const a of list) if (a?.id && !seen.has(a.id)) { seen.add(a.id); merged.push(a); }
      };
      if (topGenres.length > 0) {
        const chunks = await Promise.all(topGenres.slice(0, 3).map((g) => searchSpotifyByGenre("albums", g, 12).catch(() => [])));
        chunks.forEach((c) => push(c as any[]));
      } else {
        // No genre data yet — fall back to more from the artists the user already logged.
        const chunks = await Promise.all(
          topArtists.slice(0, 3).map(async (name) => {
            const found = await searchSpotifyArtists(name).catch(() => []);
            const exact = found.find((a) => a.name.toLowerCase() === name) ?? found[0];
            if (!exact) return [];
            const artist = await getSpotifyArtist(exact.id).catch(() => null);
            return artist?.albums ?? [];
          }),
        );
        chunks.forEach((c) => push(c as any[]));
      }
      return merged.slice(0, 10);
    },
  });
  const { data: genreArtists, isLoading: artistsLoading } = useQuery({
    queryKey: ["suggested-genre-artists", topGenres.join("|")],
    enabled: topGenres.length > 0,
    queryFn: async () => {
      const chunks = await Promise.all(topGenres.slice(0, 3).map((g) => searchSpotifyByGenre("artists", g, 12).catch(() => [])));
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const c of chunks) for (const a of c as any[]) if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
      return merged.slice(0, 10);
    },
  });




  return (
    <section className="mt-2">
      {!hasTaste ? (
        <div className="px-5">
          <p className="text-sm text-muted">Log a few albums to unlock personalised suggestions.</p>
        </div>
      ) : (
        <>
          <div className="px-5 mb-8">
            <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-4">People with your taste</h2>
            {usersLoading ? <Loader2 className="size-5 animate-spin text-muted" /> : (
              <ul className="space-y-4">
                {(similarUsers ?? []).map(({ user, score }) => (
                  <SuggestedUser key={user.id} user={user} score={score} />
                ))}
                {similarUsers?.length === 0 && <li className="text-sm text-muted">No similar listeners found yet.</li>}
              </ul>
            )}
          </div>

          <div className="px-5 mb-8">
            <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-4">Albums for your taste</h2>
            {albumsLoading ? <Loader2 className="size-5 animate-spin text-muted" /> : (
              <div className="grid grid-cols-2 gap-3">
                {genreAlbums?.map((a: any) => (
                  <Link to="/album/$id" params={{ id: a.id }} key={a.id}>
                    <div className="aspect-square w-full rounded-xs overflow-hidden bg-secondary [container-type:inline-size]">
                      <AlbumCover src={a.cover} title={a.title} artist={a.artist} className="w-full h-full" />
                    </div>
                    <p className="text-xs font-bold mt-2 truncate">{a.title}</p>
                    <p className="text-[10px] text-muted truncate">{a.artist}</p>
                  </Link>
                ))}
                {genreAlbums?.length === 0 && <p className="col-span-2 text-sm text-muted">No albums found for these genres yet.</p>}
              </div>
            )}
          </div>

          <div className="px-5">
            <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-4">Artists for your taste</h2>
            {artistsLoading ? <Loader2 className="size-5 animate-spin text-muted" /> : (
              <ul className="divide-y divide-border">
                {genreArtists?.map((a: any) => (
                  <li key={a.id}>
                    <Link to="/artist/$id" params={{ id: a.id }} className="py-2.5 flex items-center gap-3">
                      {a.image ? <img src={a.image} alt={a.name} loading="lazy" className="size-10 rounded-full object-cover" /> : <Avatar handle={a.id} name={a.name} size={40} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{a.name}</p>
                        <p className="text-[10px] text-muted truncate">{a.genres?.slice(0, 2).join(", ") || "Artist"}</p>
                      </div>
                      <span className="text-[10px] font-mono text-muted">→</span>
                    </Link>
                  </li>
                ))}
                {(genreArtists?.length ?? 0) === 0 && (
                  <li className="py-6 text-sm text-muted">Log a couple more albums to unlock artist suggestions.</li>
                )}

              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const SPOTIFY_UNSEARCHABLE_TASTE_TAGS = /^(?:\d0s|\d{2}s|\d{4}s|00s|10s|20s|60s|70s|80s|90s)$/i;

function usableSpotifyGenres(genres: string[]) {
  const seen = new Set<string>();
  return genres
    .map((g) => g.trim().toLowerCase())
    .filter((g) => g && !SPOTIFY_UNSEARCHABLE_TASTE_TAGS.test(g))
    .filter((g) => {
      if (seen.has(g)) return false;
      seen.add(g);
      return true;
    });
}

function SuggestedUser({ user, score }: { user: { id: string; handle: string; name: string; identity: string | null; avatar_url: string | null }; score: number }) {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function follow() {
    if (!me || busy) return;
    setBusy(true);
    await supabase.from("follows").insert({ follower_id: me.id, following_id: user.id });
    void notificationService.notify({
      type: "follow",
      actorId: me.id,
      recipientId: user.id,
      actorName: me.name ?? me.handle,
    });
    qc.invalidateQueries({ queryKey: ["suggestedUsers"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
  }

  return (
    <li className="flex items-center gap-3">
      <Link to="/u/$handle" params={{ handle: user.handle }}>
        <Avatar handle={user.handle} name={user.name} url={user.avatar_url} size={44} />
      </Link>
      <Link to="/u/$handle" params={{ handle: user.handle }} className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{user.name}</p>
        <p className="text-[11px] text-muted truncate">
          {user.identity || `@${user.handle}`}
          {score > 0 && <span className="text-accent ml-1.5">• similar taste</span>}
        </p>
      </Link>
      <button onClick={follow} disabled={busy} className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5 bg-foreground text-background disabled:opacity-50">
        <UserPlus className="size-3" /> Follow
      </button>
    </li>
  );
}

type Share = {
  id: string;
  album_key: string;
  title: string;
  artist: string;
  year: number | null;
  cover_url: string | null;
  message: string | null;
  created_at: string;
  from: { handle: string; name: string; avatar_url: string | null } | null;
};

function SharedWithYou() {
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const { data: shares } = useQuery({
    queryKey: ["albumShares", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("album_shares")
        .select("id, album_key, title, artist, year, cover_url, message, created_at, from:profiles!album_shares_from_user_id_fkey(handle, name, avatar_url)")
        .eq("to_user_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as unknown as Share[]) ?? [];
    },
  });

  async function dismiss(id: string) {
    await supabase.from("album_shares").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["albumShares"] });
  }

  if (!shares || shares.length === 0) return null;

  return (
    <div className="px-5 mb-8">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-accent mb-3">
        <Send className="size-3.5" /> Shared with you
      </div>
      <ul className="space-y-3">
        {shares.map((s) => {
          const cover = s.cover_url || mockCoverFor(s.album_key);
          return (
            <li key={s.id} className="flex items-center gap-3 border border-border rounded-sm p-2.5">
              <Link to="/album/$id" params={{ id: s.album_key }} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="size-14 rounded-xs shrink-0 overflow-hidden bg-secondary [container-type:inline-size]">
                  <AlbumCover src={cover} title={s.title} artist={s.artist} className="size-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{s.title}</p>
                  <p className="text-[11px] text-muted truncate">{s.artist}{s.year ? ` • ${s.year}` : ""}</p>
                  <p className="text-[10px] text-muted truncate mt-0.5">
                    from <span className="text-foreground font-bold">{s.from?.name ?? "someone"}</span>
                    {s.message ? <span className="italic"> · “{s.message}”</span> : null}
                  </p>
                </div>
              </Link>
              <button onClick={() => dismiss(s.id)} className="text-muted hover:text-destructive p-1.5 shrink-0" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
