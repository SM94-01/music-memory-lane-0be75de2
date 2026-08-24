import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { Avatar } from "@/components/Avatar";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AlbumCover } from "@/components/AlbumCover";
import { getSpotifyArtist, type SpotifyArtist } from "@/lib/spotify";

export const Route = createFileRoute("/artist/$id")({
  head: () => ({ meta: [{ title: "Artist — TraX" }] }),
  component: ArtistPage,
});

function ArtistPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [info, setInfo] = useState<SpotifyArtist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await getSpotifyArtist(id));
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <MobileShell><div className="px-5 py-12 flex justify-center"><Loader2 className="size-5 animate-spin text-muted" /></div></MobileShell>;
  if (!info) return <MobileShell><p className="px-5 text-sm text-muted">Artist not found.</p></MobileShell>;

  return (
    <MobileShell>
      <div className="px-5 pt-3">
        <button onClick={() => router.history.back()} className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted mb-4 hover:text-foreground">
          <ArrowLeft className="size-3" /> Back
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          {info.image ? <img src={info.image} alt={info.name} className="size-[120px] rounded-full object-cover" /> : <Avatar handle={info.id} name={info.name} size={120} ring />}
          <h1 className="text-3xl font-extrabold tracking-tighter mt-4">{info.name}</h1>
          <p className="text-sm text-muted">
            {info.genres?.slice(0, 3).join(" • ") || "Artist"}
            {info.followers ? ` • ${info.followers.toLocaleString()} followers` : ""}
          </p>
        </div>

        {info.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {info.genres.slice(0, 5).map((genre) => (
              <span key={genre} className="px-2 py-0.5 bg-secondary text-[10px] font-mono uppercase tracking-widest">{genre}</span>
            ))}
          </div>
        )}

        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-accent mb-3">Albums</h2>
        <div className="grid grid-cols-2 gap-3">
          {(info.albums ?? []).map((album) => (
            <Link to="/album/$id" params={{ id: album.id }} key={album.id}>
              <div className="aspect-square w-full rounded-xs overflow-hidden bg-secondary [container-type:inline-size]">
                <AlbumCover src={album.cover} title={album.title} artist={album.artist} className="size-full" />
              </div>
              <p className="text-xs font-bold mt-2 truncate">{album.title}</p>
              <p className="text-[10px] text-muted">{album.year}</p>
            </Link>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
