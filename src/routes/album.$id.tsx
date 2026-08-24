import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { Stars } from "@/components/Stars";
import { Avatar } from "@/components/Avatar";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Bookmark, BookmarkCheck, Loader2, Send, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMockAlbum, mockCoverFor } from "@/data/mock";
import { AlbumCover } from "@/components/AlbumCover";
import { ShareAlbumDialog } from "@/components/ShareAlbumDialog";
import { getSpotifyAlbum, type SpotifyTrack } from "@/lib/spotify";

type AlbumInfo = { title: string; artist: string; artistId?: string | null; year: number | null; cover: string | null; genre: string | null; tracks?: SpotifyTrack[] };

export const Route = createFileRoute("/album/$id")({
  component: AlbumPage,
});

function AlbumPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const [info, setInfo] = useState<AlbumInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [logged, setLogged] = useState(false);
  const [myLogId, setMyLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [bestTrack, setBestTrack] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!me) return;
    supabase.from("watchlist").select("id").eq("user_id", me.id).eq("album_key", id).maybeSingle()
      .then(({ data }) => setWatchId(data?.id ?? null));
  }, [me, id]);

  async function toggleWatch() {
    if (!me || !info) return;
    if (watchId) {
      await supabase.from("watchlist").delete().eq("id", watchId);
      setWatchId(null);
    } else {
      const { data } = await supabase.from("watchlist").insert({
        user_id: me.id, album_key: id, title: info.title, artist: info.artist,
        year: info.year, cover_url: info.cover, genre: info.genre,
      }).select("id").single();
      if (data) setWatchId(data.id);
    }
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  }

  // Resolve album info: mock first, then DB log, then Spotify. Always try Spotify for tracks.
  useEffect(() => {
    (async () => {
      const mock = getMockAlbum(id);
      let base: AlbumInfo | null = null;
      if (mock) {
        base = { title: mock.title, artist: mock.artist, year: mock.year, cover: mockCoverFor(id) ?? null, genre: mock.genre };
      } else {
        const { data: anyLog } = await supabase
          .from("album_logs").select("title, artist, year, cover_url, genre")
          .eq("album_key", id).limit(1).maybeSingle();
        if (anyLog) base = { title: anyLog.title, artist: anyLog.artist, year: anyLog.year, cover: anyLog.cover_url, genre: anyLog.genre };
      }
      // Try Spotify (also brings tracks). Spotify IDs are 22-char base62.
      if (/^[A-Za-z0-9]{22}$/.test(id)) {
        try {
          const album = await getSpotifyAlbum(id);
          base = {
            title: base?.title ?? album.title,
            artist: base?.artist ?? album.artist,
            year: base?.year ?? album.year,
            cover: base?.cover ?? album.cover,
            genre: base?.genre ?? album.genre,
            artistId: album.artist_id ?? null,
            tracks: album.tracks,
          };
        } catch {}
      }
      setInfo(base);
      setLoading(false);
    })();
  }, [id]);

  // Load my log
  useEffect(() => {
    if (!me) return;
    supabase.from("album_logs").select("id, rating, review, best_track").eq("user_id", me.id).eq("album_key", id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMyLogId(data.id);
          setRating(data.rating ?? 0);
          setReview(data.review ?? "");
          setBestTrack((data as any).best_track ?? null);
          setLogged(true);
        }
      });
  }, [me, id]);

  const { data: reviews } = useQuery({
    queryKey: ["albumReviews", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("album_logs")
        .select("id, rating, review, best_track, listened_at, user:profiles!album_logs_user_id_fkey(handle, name, avatar_url)")
        .eq("album_key", id)
        .or("rating.not.is.null,review.not.is.null")
        .order("listened_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  async function saveLog() {
    if (!me || !info) return;
    setSaving(true);
    const payload = {
      user_id: me.id, album_key: id, title: info.title, artist: info.artist,
      year: info.year, cover_url: info.cover, genre: info.genre,
      rating: rating || null, review: review || null,
      best_track: bestTrack || null,
    };
    if (myLogId) {
      await supabase.from("album_logs").update(payload).eq("id", myLogId);
    } else {
      const { data } = await supabase.from("album_logs").insert(payload).select("id").single();
      if (data) setMyLogId(data.id);
      setLogged(true);
    }
    // Rated albums leave the "to listen" list automatically
    if (watchId) {
      await supabase.from("watchlist").delete().eq("id", watchId);
      setWatchId(null);
    }
    setSaving(false);
    qc.invalidateQueries();
    // Prompt for best track after saving, if tracklist available and none picked yet.
    if (info.tracks && info.tracks.length > 0 && !bestTrack) setPickerOpen(true);
  }

  async function pickBest(name: string | null) {
    setBestTrack(name);
    setPickerOpen(false);
    if (myLogId) {
      await supabase.from("album_logs").update({ best_track: name }).eq("id", myLogId);
      qc.invalidateQueries();
    }
  }

  async function unlog() {
    if (!myLogId) return;
    await supabase.from("album_logs").delete().eq("id", myLogId);
    setMyLogId(null); setLogged(false); setRating(0); setReview(""); setBestTrack(null);
    qc.invalidateQueries();
  }

  if (loading) {
    return <MobileShell><div className="px-5 py-12 flex justify-center"><Loader2 className="size-5 animate-spin text-muted" /></div></MobileShell>;
  }
  if (!info) {
    return <MobileShell><p className="px-5 text-sm text-muted">Album not found.</p></MobileShell>;
  }

  return (
    <MobileShell>
      <div className="px-5 pt-3">
        <button onClick={() => router.history.back()} className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted mb-4 hover:text-foreground">
          <ArrowLeft className="size-3" /> Back
        </button>

        <section>
          <div className="relative aspect-square mb-6 overflow-hidden rounded-sm bg-secondary [container-type:inline-size]">
            <AlbumCover src={info.cover} title={info.title} artist={info.artist} className="w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-extrabold tracking-tighter text-pretty">{info.title}</h1>
            <p className="text-lg font-medium text-muted">
              {info.artistId ? (
                <Link to="/artist/$id" params={{ id: info.artistId }} className="hover:text-accent underline-offset-4 hover:underline">
                  {info.artist}
                </Link>
              ) : (
                info.artist
              )}
              {info.year ? ` • ${info.year}` : ""}
            </p>
            {info.genre && (
              <span className="mt-2 inline-block w-fit px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent text-[10px] font-mono uppercase">{info.genre}</span>
            )}
          </div>

          {info.tracks && info.tracks.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-4">Tracklist</h2>
              <ul className="divide-y divide-border">
                {info.tracks.map((t) => {
                  const isBest = bestTrack === t.name;
                  return (
                    <li key={t.id} className="py-2.5 flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted w-5 text-right">{t.track_number ?? "•"}</span>
                      <span className={`text-sm flex-1 truncate flex items-center gap-1.5 ${isBest ? "font-bold text-accent" : ""}`}>
                        {isBest && <Star className="size-3.5 shrink-0 fill-accent text-accent" aria-label="Top track" />}
                        {t.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted">{formatDuration(t.duration_ms)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="py-6 border-y border-border my-6">
            <div className="flex items-center justify-center gap-1 text-3xl leading-none">
              {[1, 2, 3, 4, 5].map((n) => {
                const halfVal = n - 0.5;
                const fullVal = n;
                const fillPct = rating >= fullVal ? 100 : rating >= halfVal ? 50 : 0;
                return (
                  <span key={n} className="relative inline-block select-none" aria-label={`Rate ${n}`}>
                    <span className="text-muted/20">★</span>
                    <span
                      className="absolute inset-0 overflow-hidden text-accent pointer-events-none"
                      style={{ width: `${fillPct}%` }}
                      aria-hidden
                    >
                      ★
                    </span>
                    <button
                      type="button"
                      onClick={() => setRating(rating === halfVal ? 0 : halfVal)}
                      className="absolute inset-y-0 left-0 w-1/2"
                      aria-label={`${halfVal} stars`}
                    />
                    <button
                      type="button"
                      onClick={() => setRating(rating === fullVal ? 0 : fullVal)}
                      className="absolute inset-y-0 right-0 w-1/2"
                      aria-label={`${fullVal} stars`}
                    />
                  </span>
                );
              })}
            </div>
            <p className="text-center text-[9px] text-muted uppercase tracking-widest mt-2">
              Your rating {rating ? `— ${rating}` : ""}
            </p>
          </div>


          <textarea
            value={review} onChange={(e) => setReview(e.target.value)}
            placeholder="Write a review (optional)…" rows={3}
            className="w-full bg-secondary/40 border border-border rounded-sm px-3 py-2 text-sm outline-none focus:border-accent resize-none mb-3"
          />

          <div className="grid grid-cols-2 gap-3">
            <button onClick={saveLog} disabled={saving} className="py-3 font-bold text-sm rounded-sm bg-accent text-accent-foreground flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : (logged && <Check className="size-4" />)}
              {logged ? "Update log" : "Log listen"}
            </button>
            {logged ? (
              <button onClick={unlog} className="py-3 font-bold text-sm rounded-sm border border-border text-muted">Remove</button>
            ) : (
              <button onClick={toggleWatch} className={`py-3 font-bold text-sm rounded-sm border flex items-center justify-center gap-2 ${watchId ? "border-accent text-accent" : "border-border text-muted"}`}>
                {watchId ? <><BookmarkCheck className="size-4" /> Saved</> : <><Bookmark className="size-4" /> To listen</>}
              </button>
            )}
          </div>

          <button
            onClick={() => setShareOpen(true)}
            className="mt-3 w-full py-3 font-bold text-sm rounded-sm border border-border text-muted hover:text-accent hover:border-accent flex items-center justify-center gap-2"
          >
            <Send className="size-4" /> Share with a friend
          </button>




          <div className="mt-10">
            <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-4">Community reviews</h2>
            <div className="space-y-6">
              {(!reviews || reviews.length === 0) && <p className="text-sm text-muted">No reviews yet.</p>}
              {reviews?.map((r: any) => (
                <div key={r.id} className="border-t border-border pt-4">
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <Link to="/u/$handle" params={{ handle: r.user?.handle ?? "" }} className="flex items-center gap-2 min-w-0">
                      <Avatar handle={r.user?.handle ?? ""} name={r.user?.name} url={r.user?.avatar_url} size={24} />
                      <span className="text-sm font-bold truncate">{r.user?.name}</span>
                    </Link>
                    {r.rating && <Stars value={r.rating} />}
                  </div>
                  {r.best_track && (
                    <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1 flex items-center gap-1.5">
                      <Star className="size-3 fill-accent text-accent" /> Top track: <span className="text-foreground normal-case tracking-normal">{r.best_track}</span>
                    </p>
                  )}
                  {r.review && <p className="text-sm text-muted leading-relaxed">{r.review}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      {shareOpen && <ShareAlbumDialog albumKey={id} album={info} onClose={() => setShareOpen(false)} />}
      {pickerOpen && info.tracks && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-md bg-background border border-border rounded-sm max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold">Pick the best track</h3>
              <button onClick={() => setPickerOpen(false)} className="text-muted hover:text-foreground"><X className="size-4" /></button>
            </div>
            <ul className="overflow-y-auto divide-y divide-border">
              {bestTrack && (
                <li>
                  <button onClick={() => pickBest(null)} className="w-full py-3 px-4 text-left text-xs font-mono uppercase tracking-widest text-muted hover:text-destructive">
                    Clear selection
                  </button>
                </li>
              )}
              {info.tracks.map((t) => {
                const isBest = bestTrack === t.name;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => pickBest(t.name)}
                      className={`w-full py-3 px-4 flex items-center gap-3 text-left ${isBest ? "bg-accent/10" : "hover:bg-secondary/40"}`}
                    >
                      <span className="text-[10px] font-mono text-muted w-5 text-right">{t.track_number ?? "•"}</span>
                      <span className={`text-sm flex-1 truncate ${isBest ? "font-bold text-accent" : ""}`}>{t.name}</span>
                      {isBest && <Check className="size-4 text-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-muted px-4 py-2 border-t border-border">Remember to press "Log listen" / "Update log" to save.</p>
          </div>
        </div>
      )}
    </MobileShell>
  );
}

function formatDuration(ms: number | null | undefined) {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
