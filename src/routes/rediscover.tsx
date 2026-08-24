import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Star, X, Check } from "lucide-react";

export const Route = createFileRoute("/rediscover")({
  head: () => ({ meta: [{ title: "Rediscover — TraX" }] }),
  component: RediscoverPage,
});

type Card = {
  album_key: string;
  title: string;
  artist: string;
  year: number | null;
  cover_url: string | null;
  avg: number;
  reason: string;
};

function RediscoverPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const { data: me } = useMyProfile();
  const [started, setStarted] = useState(false);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["rediscover", me?.id],
    enabled: !!me && started,
    queryFn: async (): Promise<Card[]> => {
      const meId = me!.id;
      const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();

      const [{ data: recent }, { data: mine }, { data: follows }] = await Promise.all([
        supabase
          .from("album_logs")
          .select("user_id, album_key, title, artist, year, cover_url, genre, rating")
          .gte("created_at", since)
          .not("rating", "is", null)
          .limit(500),
        supabase.from("album_logs").select("album_key").eq("user_id", meId),
        supabase.from("follows").select("following_id").eq("follower_id", meId),
      ]);

      const alreadyLogged = new Set((mine ?? []).map((m) => m.album_key));
      const friends = new Set((follows ?? []).map((f) => f.following_id));

      // My favourite genre = most logged genre overall.
      const { data: myLogs } = await supabase.from("album_logs").select("genre").eq("user_id", meId);
      const genreCount = new Map<string, number>();
      (myLogs ?? []).forEach((l) => {
        if (l.genre) genreCount.set(l.genre.toLowerCase(), (genreCount.get(l.genre.toLowerCase()) ?? 0) + 1);
      });
      const topGenre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      type Agg = { sum: number; n: number; row: any; friend: boolean };
      const agg = new Map<string, Agg>();
      (recent ?? []).forEach((r: any) => {
        if (r.user_id === meId) return;
        if (alreadyLogged.has(r.album_key)) return;
        const cur = agg.get(r.album_key) ?? { sum: 0, n: 0, row: r, friend: false };
        cur.sum += Number(r.rating ?? 0);
        cur.n += 1;
        if (friends.has(r.user_id)) cur.friend = true;
        agg.set(r.album_key, cur);
      });

      const list = [...agg.entries()].map(([key, a]) => ({
        album_key: key,
        title: a.row.title,
        artist: a.row.artist,
        year: a.row.year,
        cover_url: a.row.cover_url,
        genre: (a.row.genre ?? "").toLowerCase(),
        friend: a.friend,
        avg: a.sum / a.n,
      }));
      list.sort((x, y) => y.avg - x.avg);

      const picks: Card[] = [];
      const push = (item: (typeof list)[number] | undefined, reason: string) => {
        if (!item) return;
        if (picks.some((p) => p.album_key === item.album_key)) return;
        picks.push({ ...item, reason });
      };

      push(list[0], "Top rated on TraX");
      if (topGenre) push(list.find((i) => i.genre === topGenre), `Top rated in ${topGenre}`);
      push(list.find((i) => i.friend), "Top rated by your friends");
      // Fill up to 3 with the next best.
      for (const item of list) {
        if (picks.length >= 3) break;
        push(item, "Top rated on TraX");
      }
      return picks;
    },
  });

  if (!started) {
    return (
      <MobileShell hideNav>
        <div className="px-6 pt-4">
          <button
            onClick={() => router.history.back()}
            className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Back
          </button>
        </div>
        <div className="px-6 flex flex-col items-center justify-center text-center min-h-[70dvh] gap-5">
          <h1 className="text-3xl font-extrabold tracking-tighter leading-tight">
            Hey, you've been away for a while.
            <br />
            Want to rate some albums?
          </h1>
          <p className="text-sm text-muted max-w-xs">
            Swipe right on what you'd like to rate, swipe left to skip.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button
              onClick={() => setStarted(true)}
              className="w-full bg-accent text-accent-foreground py-3.5 rounded-full text-xs font-bold uppercase tracking-widest"
            >
              Yes, let's go
            </button>
            <button
              onClick={() => navigate({ to: "/" })}
              className="w-full border border-border py-3.5 rounded-full text-xs font-bold uppercase tracking-widest text-muted"
            >
              Not now
            </button>
          </div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell hideNav>
      <div className="px-6 pt-4">
        <button
          onClick={() => navigate({ to: "/" })}
          className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Home
        </button>
      </div>
      {isLoading ? (
        <div className="grid place-items-center min-h-[60dvh]">
          <Loader2 className="size-6 animate-spin text-muted" />
        </div>
      ) : (
        <Deck cards={cards ?? []} onDone={() => navigate({ to: "/" })} />
      )}
    </MobileShell>
  );
}

function Deck({ cards, onDone }: { cards: Card[]; onDone: () => void }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const current = cards[index];

  const remaining = useMemo(() => cards.length - index, [cards.length, index]);

  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);

  if (!current) {
    return (
      <div className="px-6 min-h-[60dvh] grid place-items-center text-center">
        <div>
          <p className="text-sm text-muted mb-5">
            {cards.length === 0 ? "Nothing new to rediscover right now." : "That's all for now."}
          </p>
          <button
            onClick={onDone}
            className="bg-accent text-accent-foreground px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest"
          >
            Back home
          </button>
        </div>
      </div>
    );
  }

  const like = () => navigate({ to: "/album/$id", params: { id: current.album_key } });
  const skip = () => {
    setDx(0);
    setIndex((i) => i + 1);
  };

  return (
    <div className="px-6 pt-4 select-none">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">
        {remaining} to review
      </p>
      <div
        className="rounded-2xl border border-border overflow-hidden bg-secondary/30"
        style={{
          transform: `translateX(${dx}px) rotate(${dx / 30}deg)`,
          transition: startX.current === null ? "transform 180ms" : "none",
        }}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          if (startX.current === null) return;
          setDx(e.touches[0].clientX - startX.current);
        }}
        onTouchEnd={() => {
          const d = dx;
          startX.current = null;
          if (d > 100) like();
          else if (d < -100) skip();
          else setDx(0);
        }}
      >
        {current.cover_url ? (
          <img src={current.cover_url} alt={`${current.title} cover`} className="w-full aspect-square object-cover" />
        ) : (
          <div className="w-full aspect-square bg-secondary" />
        )}
        <div className="p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">{current.reason}</p>
          <h2 className="text-xl font-extrabold tracking-tight leading-tight">{current.title}</h2>
          <p className="text-sm text-muted">
            {current.artist}
            {current.year ? ` · ${current.year}` : ""}
          </p>
          <p className="mt-2 text-xs text-muted flex items-center gap-1">
            <Star className="size-3 fill-current text-accent" /> {current.avg.toFixed(1)} average on TraX
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mt-6">
        <button
          onClick={skip}
          aria-label="Skip"
          className="size-14 rounded-full border border-border grid place-items-center text-muted"
        >
          <X className="size-6" />
        </button>
        <button
          onClick={like}
          aria-label="Rate this album"
          className="size-14 rounded-full bg-accent text-accent-foreground grid place-items-center"
        >
          <Check className="size-6" />
        </button>
      </div>
      <p className="text-center text-[10px] font-mono uppercase tracking-widest text-muted mt-4">
        Swipe right to rate · left to skip
      </p>
    </div>
  );
}
