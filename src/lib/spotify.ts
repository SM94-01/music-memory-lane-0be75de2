import { supabase } from "@/integrations/supabase/client";

export type SpotifyTrack = {
  id: string;
  name: string;
  track_number: number | null;
  duration_ms: number | null;
};

export type SpotifyAlbum = {
  id: string;
  title: string;
  artist: string;
  artist_id?: string | null;
  year: number | null;
  cover: string | null;
  genre: string | null;
  type?: string | null;
  tracks?: SpotifyTrack[];
};

export type SpotifyArtist = {
  id: string;
  name: string;
  image: string | null;
  genres: string[];
  followers?: number | null;
  popularity?: number | null;
  albums?: SpotifyAlbum[];
};

async function invokeSpotify<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("spotify-catalog", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function searchSpotifyAlbums(query: string) {
  const result = await invokeSpotify<{ albums: SpotifyAlbum[] }>({ action: "searchAlbums", query, limit: 10 });
  return result.albums;
}

export async function searchSpotifyArtists(query: string) {
  const result = await invokeSpotify<{ artists: SpotifyArtist[] }>({ action: "searchArtists", query, limit: 10 });
  return result.artists;
}

export async function searchSpotifyByGenre(kind: "albums" | "artists", genre: string, limit = 20) {
  const result = await invokeSpotify<{ albums?: SpotifyAlbum[]; artists?: SpotifyArtist[] }>({ action: "genre", kind, genre, limit });
  return kind === "albums" ? result.albums ?? [] : result.artists ?? [];
}

export async function getSpotifyFeatured(kind: "albums" | "artists") {
  const result = await invokeSpotify<{ albums?: SpotifyAlbum[]; artists?: SpotifyArtist[] }>({ action: "featured", kind, limit: 10 });
  return kind === "albums" ? result.albums ?? [] : result.artists ?? [];
}

export async function getSpotifyAlbum(id: string) {
  const result = await invokeSpotify<{ album: SpotifyAlbum }>({ action: "album", id });
  return result.album;
}

export async function getSpotifyArtist(id: string) {
  const result = await invokeSpotify<{ artist: SpotifyArtist }>({ action: "artist", id });
  return result.artist;
}
export async function getSpotifyNewReleases(limit = 5) {
  const result = await invokeSpotify<{ albums: SpotifyAlbum[] }>({ action: "newReleases", limit });
  return result.albums ?? [];
}
