import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { Search as SearchIcon, Loader2, Disc3, Mic2, Tag, ArrowLeft, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GENRES } from "@/data/mock";
import { Avatar } from "@/components/Avatar";
import { useQuery } from "@tanstack/react-query";
import { useMyProfile } from "@/lib/auth";
import { fetchTasteFingerprint } from "@/lib/taste";
import { AlbumCover } from "@/components/AlbumCover";
import { searchSpotifyAlbums, searchSpotifyArtists, searchSpotifyByGenre, getSpotifyFeatured, getSpotifyNewReleases, type SpotifyAlbum, type SpotifyArtist } from "@/lib/spotify";
import { uiState } from "@/lib/ui-state";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/add")({
  head: () => ({ meta: [{ title: "Add music — TraX" }] }),
  component: AddPage,
});

type Mode = "albums" | "artists" | "genres";

function AddPage() {
  const [mode, setMode] = useState<Mode>(uiState.addMode);
  const switchMode = (m: Mode) => {
    uiState.addMode = m;
    setMode(m);
    setQ("");
    setSelectedGenre(null);
  };
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenreState] = useState<string | null>(uiState.addGenre);
  const setSelectedGenre = (g: string | null) => {
    uiState.addGenre = g;
    setSelectedGenreState(g);
  };
  const abortRef = useRef<AbortController | null>(null);

  const { data: me } = useMyProfile();
  const { data: taste } = useQuery({
    queryKey: ["taste", me?.id],
    enabled: !!me,
    queryFn: () => fetchTasteFingerprint(me!.id),
  });
  const myGenres = taste?.topGenres ?? [];
  const myArtists = taste?.topArtists ?? [];

  // mode-switch reset is handled in switchMode; no mount-time reset so the
  // persisted tab/genre survive navigation back from a detail page.

  useEffect(() => {
    if (mode === "genres") return;
    if (!q.trim()) { setAlbums([]); setArtists([]); setError(null); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        if (mode === "albums") setAlbums(rankAlbums(await searchSpotifyAlbums(q), myGenres, myArtists));
        else setArtists(rankArtists(await searchSpotifyArtists(q), myGenres));
      } catch (e) { if ((e as Error).name !== "AbortError") setError("Couldn't reach Spotify."); }
      finally { setLoading(false); }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, mode, myGenres.join("|"), myArtists.join("|")]);

  return (
    <MobileShell>
      <div className="px-5 pt-5">
        <h1 className="text-3xl font-extrabold tracking-tighter mb-5">Add music</h1>

        {mode !== "genres" || selectedGenre === null ? (
          <label className="flex items-center gap-3 border border-border rounded-full px-4 py-3 bg-secondary/40 focus-within:border-accent">
            <SearchIcon className="size-4 text-muted shrink-0" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={mode === "albums" ? "Search albums…" : mode === "artists" ? "Search artists…" : "Search genres…"}
              className="bg-transparent outline-none flex-1 text-sm placeholder:text-muted"
            />
            {loading && <Loader2 className="size-4 text-muted animate-spin" />}
          </label>
        ) : null}

        <div className="flex gap-1 p-1 bg-secondary/60 rounded-full mt-4">
          <ModeBtn active={mode === "albums"} onClick={() => switchMode("albums")} icon={<Disc3 className="size-3.5" />}>Albums</ModeBtn>
          <ModeBtn active={mode === "artists"} onClick={() => switchMode("artists")} icon={<Mic2 className="size-3.5" />}>Artists</ModeBtn>
          <ModeBtn active={mode === "genres"} onClick={() => switchMode("genres")} icon={<Tag className="size-3.5" />}>Genres</ModeBtn>
        </div>
      </div>

      <div className="px-5 mt-6">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {mode === "albums" && (q ? <AlbumResults items={albums} empty={!loading} /> : <SuggestedFeed kind="albums" genres={myGenres} />)}
        {mode === "artists" && (q ? <ArtistResults items={artists} empty={!loading} /> : <SuggestedFeed kind="artists" genres={myGenres} />)}
        {mode === "genres" && (
          selectedGenre ? <GenreView genre={selectedGenre} onBack={() => setSelectedGenre(null)} />
          : <GenresList query={q} onPick={setSelectedGenre} topGenres={myGenres} />
        )}
      </div>
    </MobileShell>
  );
}

function rankAlbums(items: SpotifyAlbum[], genres: string[], artists: string[]) {
  if (!genres.length && !artists.length) return items;
  const score = (it: SpotifyAlbum) => {
    let s = 0;
    if (it.genre && genres.includes(it.genre.toLowerCase())) s += 2;
    const artist = it.artist.toLowerCase();
    if (artists.includes(artist)) s += 3;
    return s;
  };
  return [...items].sort((a, b) => score(b) - score(a));
}
function rankArtists(items: SpotifyArtist[], genres: string[]) {
  if (!genres.length) return items;
  const score = (it: SpotifyArtist) => {
    const tags = (it.genres ?? []).map((t: string) => t.toLowerCase());
    return tags.some((t) => genres.includes(t)) ? 2 : 0;
  };
  return [...items].sort((a, b) => score(b) - score(a));
}

function SuggestedFeed({ kind, genres }: { kind: "albums" | "artists"; genres: string[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ["suggested-mix", kind, genres.join("|")],
    queryFn: async () => {
      // 1) Taste-based picks from Spotify (top genres)
      const tastePicks: any[] = [];
      if (genres.length > 0) {
        const picks = genres.slice(0, 3);
        const chunks = await Promise.all(picks.map((g) => searchSpotifyByGenre(kind, g).catch(() => [])));
        for (const chunk of chunks) tastePicks.push(...chunk);
      }
      // 2) Community favourites — most logged albums / most logged artists on TraX
      const communityPicks = await fetchCommunityTop(kind);
      // 3) Fallback popular from Spotify to fill the feed
      const fallback = tastePicks.length + communityPicks.length < 8
        ? await getSpotifyFeatured(kind).catch(() => [])
        : [];
      // Interleave taste + community, then top up with fallback
      const merged: any[] = [];
      const maxLen = Math.max(tastePicks.length, communityPicks.length);
      for (let i = 0; i < maxLen; i++) {
        if (tastePicks[i]) merged.push(tastePicks[i]);
        if (communityPicks[i]) merged.push(communityPicks[i]);
      }
      merged.push(...fallback);
      const seen = new Set<string>();
      return merged.filter((it) => {
        const k = kind === "albums" ? it.id : it.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 10);
    },
  });

  if (isLoading) return <div className="py-6 flex justify-center"><Loader2 className="size-5 animate-spin text-muted" /></div>;
  const items = (data as any[]) ?? [];
  return (
    <>
      {kind === "albums" && <NewReleases />}
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-3 flex items-center gap-1.5">
        <Sparkles className="size-3" />
        Trending on TraX
      </h3>
      {kind === "albums"
        ? <AlbumResults items={items as SpotifyAlbum[]} empty={false} />
        : <ArtistResults items={items as SpotifyArtist[]} empty={false} />}
    </>
  );
}

function NewReleases() {
  const { data, isLoading } = useQuery({
    queryKey: ["new-releases"],
    queryFn: () => getSpotifyNewReleases(5),
  });
  const items = data ?? [];
  if (isLoading) return <div className="py-4 flex justify-center"><Loader2 className="size-4 animate-spin text-muted" /></div>;
  if (items.length === 0) return null;
  return (
    <div className="mb-7">
      <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-3 flex items-center gap-1.5">
        <Sparkles className="size-3" />
        New releases
      </h3>
      <AlbumResults items={items} empty={false} />
    </div>
  );
}


// Fetch top logged albums or artists on the TraX community
async function fetchCommunityTop(kind: "albums" | "artists"): Promise<any[]> {
  const { data } = await supabase
    .from("album_logs")
    .select("album_key, title, artist, year, cover_url, genre")
    .order("listened_at", { ascending: false })
    .limit(500);
  if (!data) return [];
  if (kind === "albums") {
    const counts = new Map<string, { count: number; item: any }>();
    for (const r of data) {
      const cur = counts.get(r.album_key);
      if (cur) cur.count += 1;
      else counts.set(r.album_key, { count: 1, item: {
        id: r.album_key, title: r.title, artist: r.artist,
        year: r.year, cover: r.cover_url, genre: r.genre,
      } });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 15).map((v) => v.item);
  }
  // artists: group by artist name — no spotify id available from logs, skip if we lack one
  const counts = new Map<string, number>();
  for (const r of data) counts.set(r.artist, (counts.get(r.artist) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n);
  // Resolve names → Spotify artists
  const resolved = await Promise.all(top.map((name) => searchSpotifyArtists(name).then((r) => r[0]).catch(() => null)));
  return resolved.filter(Boolean) as any[];
}

function AlbumResults({ items, empty }: { items: SpotifyAlbum[]; empty: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const year = a.year ? String(a.year) : null;
        const cover = a.cover;
        return (
          <li key={a.id}>
            <Link to="/album/$id" params={{ id: a.id }} className="py-3 flex items-center gap-4">
              <div className="size-14 shrink-0 rounded-xs overflow-hidden bg-secondary [container-type:inline-size]">
                <AlbumCover src={cover} title={a.title} artist={a.artist} className="size-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{a.title}</p>
                <p className="text-[11px] text-muted truncate">
                  {a.artist}{year ? ` • ${year}` : ""}{a.type ? ` • ${a.type}` : ""}
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-accent">Open →</span>
            </Link>
          </li>
        );
      })}
      {empty && items.length === 0 && <li className="py-6 text-sm text-muted">No albums found.</li>}
    </ul>
  );
}

function ArtistResults({ items, empty }: { items: SpotifyArtist[]; empty: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id}>
          <Link to="/artist/$id" params={{ id: a.id }} className="py-3 flex items-center gap-4">
            {a.image ? <img src={a.image} alt={a.name} loading="lazy" className="size-14 rounded-full object-cover" /> : <Avatar handle={a.id} name={a.name} size={56} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{a.name}</p>
              <p className="text-[11px] text-muted truncate">{a.genres?.slice(0, 2).join(", ") || "Artist"}</p>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-accent">Open →</span>
          </Link>
        </li>
      ))}
      {empty && items.length === 0 && <li className="py-6 text-sm text-muted">No artists found.</li>}
    </ul>
  );
}

function GenresList({ query, onPick, topGenres }: { query: string; onPick: (g: string) => void; topGenres: string[] }) {
  const filtered = useMemo(() => {
    const sorted = [...GENRES].sort();
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((g) => g.toLowerCase().includes(q));
  }, [query]);
  return (
    <div>
      <ul className="divide-y divide-border">

        {filtered.map((g) => (
          <li key={g}>
            <button onClick={() => onPick(g)} className="w-full py-3 flex items-center justify-between text-left">
              <span className="text-sm font-bold">{g}</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Explore →</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="py-6 text-sm text-muted">No genre matches.</li>}
      </ul>
    </div>
  );
}

function GenreView({ genre, onBack }: { genre: string; onBack: () => void }) {
  const [albums, setAlbums] = useState<SpotifyAlbum[]>([]);
  const [artists, setArtists] = useState<SpotifyArtist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      searchSpotifyByGenre("albums", genre),
      searchSpotifyByGenre("artists", genre),
    ]).then(([rg, ar]) => {
      setAlbums(rg as SpotifyAlbum[]);
      setArtists(ar as SpotifyArtist[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [genre]);

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted mb-4 hover:text-foreground">
        <ArrowLeft className="size-3" /> All genres
      </button>
      <h2 className="text-2xl font-extrabold tracking-tighter mb-1">{genre}</h2>
      <p className="text-xs text-muted mb-6">Most popular in this genre</p>

      {loading ? <Loader2 className="size-5 animate-spin text-muted mx-auto" /> : (
        <>
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-3">Top artists</h3>
          <ul className="divide-y divide-border mb-6">
            {artists.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link to="/artist/$id" params={{ id: a.id }} className="py-2.5 flex items-center gap-3">
                  {a.image ? <img src={a.image} alt={a.name} loading="lazy" className="size-9 rounded-full object-cover" /> : <Avatar handle={a.id} name={a.name} size={36} />}
                  <span className="text-sm font-bold flex-1 truncate">{a.name}</span>
                  <span className="text-[10px] font-mono text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>

          <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent mb-3">Top albums</h3>
          <div className="grid grid-cols-2 gap-3">
            {albums.map((a) => {
              return (
                <Link to="/album/$id" params={{ id: a.id }} key={a.id}>
                  <div className="aspect-square w-full rounded-xs overflow-hidden bg-secondary [container-type:inline-size]">
                    <AlbumCover src={a.cover} title={a.title} artist={a.artist} className="size-full" />
                  </div>
                  <p className="text-xs font-bold mt-2 truncate">{a.title}</p>
                  <p className="text-[10px] text-muted truncate">{a.artist}</p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${active ? "bg-foreground text-background" : "text-muted"}`}>
      {icon}{children}
    </button>
  );
}
