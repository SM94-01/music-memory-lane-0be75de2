// Gamified profile identities. Users start as "New Listener" and unlock more
// as they use the app. They can pick any unlocked tag from the edit dialog.

export type Identity = {
  key: string;
  label: string;
  emoji: string;
  description: string;
  // Returns true if the user has unlocked this badge.
  unlocked: (s: TasteStats) => boolean;
};

export type TasteStats = {
  logsCount: number;
  reviewsCount: number;
  watchlistCount: number;
  topArtistCount: number;     // # of logs for the user's most-logged artist
  topGenreShare: number;      // 0..1 share of logs in the dominant genre
  distinctArtists: number;
  distinctGenres: number;
  oldestYear: number | null;  // oldest album year they logged
};

export const IDENTITIES: Identity[] = [
  { key: "new-listener", label: "New Listener", emoji: "🌱", description: "Just joined TraX.", unlocked: () => true },
  { key: "heavy-logger", label: "Heavy Logger", emoji: "📚", description: "Logged 20+ albums.", unlocked: (s) => s.logsCount >= 20 },
  { key: "vinyl-marathoner", label: "Marathoner", emoji: "🏃", description: "Logged 50+ albums.", unlocked: (s) => s.logsCount >= 50 },
  { key: "artist-devotee", label: "Artist Devotee", emoji: "💿", description: "5+ albums from one artist.", unlocked: (s) => s.topArtistCount >= 5 },
  { key: "genre-purist", label: "Genre Purist", emoji: "🎯", description: "60%+ of logs in one genre.", unlocked: (s) => s.topGenreShare >= 0.6 && s.logsCount >= 5 },
  { key: "eclectic", label: "Eclectic", emoji: "🌈", description: "Logged 6+ different genres.", unlocked: (s) => s.distinctGenres >= 6 },
  { key: "crate-digger", label: "Crate Digger", emoji: "🔎", description: "Followed 15+ different artists.", unlocked: (s) => s.distinctArtists >= 15 },
  { key: "critic", label: "Critic", emoji: "✍️", description: "Wrote 10+ reviews.", unlocked: (s) => s.reviewsCount >= 10 },
  { key: "curator", label: "Curator", emoji: "🗂️", description: "10+ albums on the to-listen list.", unlocked: (s) => s.watchlistCount >= 10 },
  { key: "time-traveler", label: "Time Traveler", emoji: "🕰️", description: "Logged an album from before 1980.", unlocked: (s) => s.oldestYear !== null && s.oldestYear < 1980 },
  { key: "first-spin", label: "First Spin", emoji: "🎧", description: "Logged your very first album.", unlocked: (s) => s.logsCount >= 1 },
  { key: "getting-serious", label: "Getting Serious", emoji: "🔥", description: "Logged 10+ albums.", unlocked: (s) => s.logsCount >= 10 },
  { key: "century-club", label: "Century Club", emoji: "💯", description: "Logged 100+ albums.", unlocked: (s) => s.logsCount >= 100 },
  { key: "wordsmith", label: "Wordsmith", emoji: "🖋️", description: "Wrote 25+ reviews.", unlocked: (s) => s.reviewsCount >= 25 },
  { key: "hot-take-machine", label: "Hot Take Machine", emoji: "🌶️", description: "Wrote 50+ reviews.", unlocked: (s) => s.reviewsCount >= 50 },
  { key: "genre-hopper", label: "Genre Hopper", emoji: "🦘", description: "Logged 10+ different genres.", unlocked: (s) => s.distinctGenres >= 10 },
  { key: "archivist", label: "Archivist", emoji: "🏛️", description: "Logged an album from before 1970.", unlocked: (s) => s.oldestYear !== null && s.oldestYear < 1970 },
  { key: "superfan", label: "Superfan", emoji: "🤩", description: "10+ albums from one artist.", unlocked: (s) => s.topArtistCount >= 10 },
  { key: "list-hoarder", label: "List Hoarder", emoji: "🗃️", description: "30+ albums on the to-listen list.", unlocked: (s) => s.watchlistCount >= 30 },
  { key: "encyclopedia", label: "Encyclopedia", emoji: "📖", description: "Logged 40+ different artists.", unlocked: (s) => s.distinctArtists >= 40 },
];

export function identityByKey(key: string | null | undefined): Identity | undefined {
  if (!key) return undefined;
  return IDENTITIES.find((i) => i.key === key) ?? IDENTITIES.find((i) => i.label.toLowerCase() === key.toLowerCase());
}

export function computeTasteStats(args: {
  logs: { artist: string | null; genre: string | null; review: string | null; year: number | null }[];
  watchlistCount: number;
}): TasteStats {
  const logs = args.logs;
  const reviews = logs.filter((l) => l.review && l.review.trim().length > 0).length;
  const artistMap = new Map<string, number>();
  const genreMap = new Map<string, number>();
  let oldest: number | null = null;
  for (const l of logs) {
    if (l.artist) artistMap.set(l.artist.toLowerCase(), (artistMap.get(l.artist.toLowerCase()) ?? 0) + 1);
    if (l.genre) genreMap.set(l.genre.toLowerCase(), (genreMap.get(l.genre.toLowerCase()) ?? 0) + 1);
    if (l.year && (oldest === null || l.year < oldest)) oldest = l.year;
  }
  const topArtistCount = Math.max(0, ...artistMap.values());
  const topGenreCount = Math.max(0, ...genreMap.values());
  const topGenreShare = logs.length > 0 ? topGenreCount / logs.length : 0;
  return {
    logsCount: logs.length,
    reviewsCount: reviews,
    watchlistCount: args.watchlistCount,
    topArtistCount,
    topGenreShare,
    distinctArtists: artistMap.size,
    distinctGenres: genreMap.size,
    oldestYear: oldest,
  };
}
