// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SPOTIFY_API = "https://api.spotify.com/v1";

let cachedToken: { token: string; exp: number } | null = null;

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function clampLimit(value: unknown, fallback = 20) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

const SEARCH_LIMIT = "10";

function compact<T>(items: (T | null | undefined)[]) {
  return items.filter(Boolean) as T[];
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function genreQuery(genre: string) {
  return `genre:"${genre.replace(/"/g, "").trim()}"`;
}

function genreScore(item: any, genre: string) {
  const target = normalize(genre);
  const tags = (item.genres ?? []).map((g: string) => normalize(g));
  if (tags.includes(target)) return 100;
  if (tags.some((g: string) => g.includes(target) || target.includes(g))) return 50;
  const words = target.split(" ").filter((w) => w.length > 2);
  const overlap = tags.reduce((score: number, tag: string) => score + words.filter((w) => tag.includes(w)).length, 0);
  return overlap;
}

function yearFromDate(date?: string | null) {
  const y = date?.slice(0, 4);
  return y ? Number(y) : null;
}

function largestImage(images?: { url: string; width: number | null; height: number | null }[]) {
  return [...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Spotify credentials are missing");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cachedToken.token;
}

const responseCache = new Map<string, { exp: number; data: any }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const HOT_TTL_MS = 3000;

let inflight: Promise<any> = Promise.resolve();
function queued<T>(fn: () => Promise<T>): Promise<T> {
  const run = inflight.then(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return fn();
  }, fn);
  inflight = run.then(() => {}, () => {});
  return run;
}

async function spotify<T>(
  path: string,
  opts: { cache?: boolean; attempts?: number; retryAfterCapMs?: number; fastFail429?: boolean } = {},
): Promise<T> {
  const useCache = opts.cache !== false;
  const attempts = Math.max(1, opts.attempts ?? 4);
  const retryAfterCapMs = opts.retryAfterCapMs ?? 10_000;
  const hotKey = `hot:${path}`;
  const hotHit = responseCache.get(hotKey);
  if (hotHit && hotHit.exp > Date.now()) return hotHit.data as T;
  if (useCache) {
    const hit = responseCache.get(path);
    if (hit && hit.exp > Date.now()) return hit.data as T;
  }
  const data = await queued(async () => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const token = await getAccessToken();
      const res = await fetch(`${SPOTIFY_API}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get("Retry-After") ?? "0");
        await res.body?.cancel();
        if (opts.fastFail429 || attempt === attempts - 1) {
          throw new Error(`Spotify request failed: 429 ${path} (rate limited)`);
        }
        const waitMs = retry > 0 ? Math.min(retryAfterCapMs, retry * 1000) : Math.min(retryAfterCapMs, 500 * Math.pow(2, attempt));
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) throw new Error(`Spotify request failed: ${res.status} ${path} ${await res.text()}`);
      return await res.json();
    }
    throw new Error(`Spotify request failed: 429 ${path} (exhausted retries)`);
  });
  responseCache.set(hotKey, { exp: Date.now() + HOT_TTL_MS, data });
  if (useCache) responseCache.set(path, { exp: Date.now() + CACHE_TTL_MS, data });
  return data as T;
}

async function fetchArtistAlbumSearchFallback(artist: any, artistId: string) {
  const q = String(artist.name ?? "").replace(/"/g, "").trim();
  const fallback = await spotify<any>(
    `/search?${new URLSearchParams({ q, type: "album", limit: SEARCH_LIMIT })}`,
    { attempts: 2, retryAfterCapMs: 1000 },
  ).catch((e) => {
    console.warn("[spotify-catalog] artist album search fallback failed", artistId, e);
    return null;
  });
  return (fallback?.albums?.items ?? []).filter((a: any) =>
    (a.artists ?? []).some((x: any) => x.id === artistId || normalize(x.name) === normalize(artist.name)),
  );
}

async function hydrateArtists(items: any[]) {
  const seen = new Set<string>();
  return compact(items).filter((a: any) => {
    if (!a?.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

async function fetchArtistsByGenre(genre: string, limit: number) {
  const primary = await spotify<any>(
    `/search?${new URLSearchParams({ q: genreQuery(genre), type: "artist", limit: SEARCH_LIMIT })}`,
  );
  let artists = await hydrateArtists(primary.artists?.items ?? []);

  if (artists.length < Math.min(8, limit)) {
    const fallback = await spotify<any>(
      `/search?${new URLSearchParams({ q: genre, type: "artist", limit: SEARCH_LIMIT })}`,
    );
    artists = await hydrateArtists([...artists, ...(fallback.artists?.items ?? [])]);
  }

  const seen = new Set<string>();
  const scored = artists
    .filter((a: any) => {
      if (!a?.id || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .map((a: any) => ({ item: a, score: genreScore(a, genre) }));
  const exact = scored.filter((a) => a.score > 0);
  const pool = exact.length >= Math.min(4, limit) ? exact : scored;
  pool.sort(
    (a, b) =>
      b.score - a.score ||
      (b.item.popularity ?? 0) - (a.item.popularity ?? 0) ||
      (b.item.followers?.total ?? 0) - (a.item.followers?.total ?? 0),
  );
  return pool.slice(0, limit).map(({ item }) => item);
}

async function fetchAlbumsForGenre(genre: string, limit: number) {
  // Single search call keeps upstream traffic minimal (was: fan-out to each artist's discography).
  const primary = await spotify<any>(
    `/search?${new URLSearchParams({ q: genreQuery(genre), type: "album", limit: SEARCH_LIMIT })}`,
  ).catch(() => null);
  const albums: any[] = ((primary?.albums?.items ?? []) as any[]).map((a: any) => ({ ...a, _tasteGenre: genre }));

  if (albums.length === 0) {
    const fallback = await spotify<any>(
      `/search?${new URLSearchParams({ q: genre, type: "album", limit: SEARCH_LIMIT })}`,
    ).catch(() => null);
    albums.push(...((fallback?.albums?.items ?? []) as any[]).map((a: any) => ({ ...a, _tasteGenre: genre })));
  }

  const seen = new Set<string>();
  return albums
    .filter((a: any) => {
      const artistName = (a.artists ?? [])
        .map((x: any) => x.name)
        .join(", ")
        .toLowerCase();
      const key = `${normalize(a.name ?? "")}::${artistName}`;
      if (!a?.id || !a.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a: any, b: any) => (b.release_date ?? "").localeCompare(a.release_date ?? ""))
    .slice(0, limit);
}

function albumFromItem(item: any, genre: string | null = null) {
  const tracks = (item.tracks?.items ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    track_number: t.track_number ?? null,
    duration_ms: t.duration_ms ?? null,
  }));
  return {
    id: item.id,
    title: item.name,
    artist: (item.artists ?? []).map((a: any) => a.name).join(", ") || "Unknown",
    artist_id: (item.artists ?? [])[0]?.id ?? null,
    year: yearFromDate(item.release_date),
    cover: largestImage(item.images),
    genre,
    type: item.album_type ?? "album",
    tracks: tracks.length ? tracks : undefined,
  };
}

function artistFromItem(item: any, albums?: any[]) {
  return {
    id: item.id,
    name: item.name,
    image: largestImage(item.images),
    genres: item.genres ?? [],
    followers: item.followers?.total ?? null,
    popularity: item.popularity ?? null,
    albums: albums?.map((a) => albumFromItem(a, item.genres?.[0] ?? null)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const limit = clampLimit(body.limit);

    if (action === "searchAlbums") {
      const query = String(body.query ?? "").trim();
      if (query.length < 2) return json(400, { error: "Query is too short" });
      const data = await spotify<any>(
        `/search?${new URLSearchParams({ q: query, type: "album", limit: SEARCH_LIMIT })}`,
      );
      return json(200, { albums: (data.albums?.items ?? []).map((a: any) => albumFromItem(a)) });
    }

    if (action === "searchArtists") {
      const query = String(body.query ?? "").trim();
      if (query.length < 2) return json(400, { error: "Query is too short" });
      const data = await spotify<any>(
        `/search?${new URLSearchParams({ q: query, type: "artist", limit: SEARCH_LIMIT })}`,
      );
      const artists = await hydrateArtists(data.artists?.items ?? []);
      return json(200, { artists: artists.map((a: any) => artistFromItem(a)) });
    }

    if (action === "genre") {
      const genre = String(body.genre ?? "")
        .trim()
        .toLowerCase();
      const kind = body.kind === "artists" ? "artist" : "album";
      if (!genre) return json(400, { error: "Genre is required" });
      if (kind === "artist") {
        const artists = await fetchArtistsByGenre(genre, limit);
        return json(200, { artists: artists.map((a: any) => artistFromItem(a)) });
      }
      const albums = await fetchAlbumsForGenre(genre, limit);
      return json(200, { albums: albums.map((a: any) => albumFromItem(a, genre)) });
    }

    if (action === "album") {
      const id = String(body.id ?? "").trim();
      if (!id) return json(400, { error: "Album id is required" });
      const album = await spotify<any>(`/albums/${encodeURIComponent(id)}`);
      let genre: string | null = album.genres?.[0] ?? null;
      const firstArtistId = album.artists?.[0]?.id;
      if (!genre && firstArtistId) {
        const artist = await spotify<any>(`/artists/${encodeURIComponent(firstArtistId)}`);
        genre = artist.genres?.[0] ?? null;
      }
      return json(200, { album: albumFromItem(album, genre) });
    }

    if (action === "artist") {
      const id = String(body.id ?? "").trim();
      if (!id) return json(400, { error: "Artist id is required" });
      const artist = await spotify<any>(`/artists/${encodeURIComponent(id)}`);
      // Prefer the artist discography endpoint; fall back to search when Spotify rate-limits us.
      const all: any[] = await fetchArtistAlbumSearchFallback(artist, id);
      const pageSize = 10;
      let discographyFailed = false;
      for (let offset = 0; offset < 150; offset += pageSize) {
        try {
          const page: any = await spotify<any>(
            `/artists/${encodeURIComponent(id)}/albums?${new URLSearchParams({
              include_groups: "album,single,compilation",
              limit: String(pageSize),
              offset: String(offset),
            })}`,
            { attempts: 1, fastFail429: true },
          );
          const items = page.items ?? [];
          all.push(...items);
          if (!page.next) break;
        } catch (e) {
          console.warn("[spotify-catalog] artist albums page failed", offset, e);
          discographyFailed = offset === 0;
          break;
        }
      }
      const seenIds = new Set<string>();
      const seenKeys = new Set<string>();
      const unique = all.filter((a: any) => {
        if (!a?.id || seenIds.has(a.id)) return false;
        seenIds.add(a.id);
        const key = `${(a.name || "").toLowerCase().trim()}::${a.album_type ?? ""}::${(a.release_date ?? "").slice(0, 4)}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });
      unique.sort((a: any, b: any) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
      return json(200, { artist: artistFromItem(artist, unique) });
    }

    if (action === "featured") {
      // Client-credentials tokens can't call /browse/new-releases anymore.
      // Fall back to a broad search of recent popular releases.
      const kind = body.kind === "artists" ? "artist" : "album";
      const year = new Date().getFullYear();
      const q = `year:${year - 1}-${year}`;
      const data = await spotify<any>(`/search?${new URLSearchParams({ q, type: kind, limit: String(limit) })}`);
      if (kind === "album") return json(200, { albums: (data.albums?.items ?? []).map((a: any) => albumFromItem(a)) });
      return json(200, { artists: (data.artists?.items ?? []).map((a: any) => artistFromItem(a)) });
    }

    if (action === "newReleases") {
      const year = new Date().getFullYear();
      let items: any[] = [];
      {
        const search = await spotify<any>(
          `/search?${new URLSearchParams({ q: `year:${year - 1}-${year}`, type: "album", limit: SEARCH_LIMIT })}`,
        ).catch((e) => {
          console.warn("[spotify-catalog] new-releases search fallback failed", String(e));
          return null;
        });
        items = (search?.albums?.items ?? []) as any[];
      }

      const sorted = [...items].sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
      console.log("[spotify-catalog] newReleases items", items.length);
      return json(200, { albums: sorted.slice(0, limit).map((a: any) => albumFromItem(a)) });
    }




    return json(400, { error: "Unknown action" });
  } catch (e) {
    console.error("[spotify-catalog]", e);
    return json(500, { error: (e as Error).message });
  }
});
