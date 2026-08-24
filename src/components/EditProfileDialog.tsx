import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@/lib/auth";
import { ChevronDown, Loader2, Lock, X } from "lucide-react";
import { IDENTITIES, computeTasteStats, identityByKey } from "@/lib/identities";

export function EditProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bioShort, setBioShort] = useState(profile.bio_short ?? "");
  const [bioLong, setBioLong] = useState(profile.bio_long ?? "");
  const initialIdentity = identityByKey(profile.identity)?.key ?? "new-listener";
  const [identity, setIdentity] = useState<string>(initialIdentity);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);

  // load stats to know which identities are unlocked
  const [stats, setStats] = useState<ReturnType<typeof computeTasteStats> | null>(null);
  const [storedUnlocked, setStoredUnlocked] = useState<Set<string>>(new Set(["new-listener"]));
  useEffect(() => {
    (async () => {
      const [{ data: logs }, { count: wl }, { data: unlocks }] = await Promise.all([
        supabase.from("album_logs").select("artist, genre, review, year").eq("user_id", profile.id),
        supabase.from("watchlist").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
        supabase.from("identity_unlocks").select("identity_key").eq("user_id", profile.id),
      ]);
      setStats(computeTasteStats({ logs: (logs ?? []) as any, watchlistCount: wl ?? 0 }));
      setStoredUnlocked(new Set(["new-listener", ...((unlocks ?? []) as any[]).map((u) => u.identity_key)]));
    })();
  }, [profile.id]);

  const unlockedIdentities = useMemo(() => IDENTITIES.filter((i) => isUnlocked(i.key)), [stats, storedUnlocked]);
  const selectedIdentity = identityByKey(identity) ?? identityByKey(profile.identity) ?? IDENTITIES[0];
  const unlockedCount = unlockedIdentities.length;
  function isUnlocked(key: string) {
    const it = IDENTITIES.find((i) => i.key === key);
    if (!it) return false;
    return storedUnlocked.has(key) || (stats ? it.unlocked(stats) : it.key === "new-listener");
  }

  async function save() {
    setBusy(true); setErr(null);
    const picked = identityByKey(identity);
    const identityLabel = picked ? picked.label : "New Listener";
    const { error } = await supabase.from("profiles").update({
      name, handle: handle.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      bio_short: bioShort || null, bio_long: bioLong || null,
      identity: identityLabel,
      updated_at: new Date().toISOString(),
    }).eq("id", profile.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    qc.invalidateQueries();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80" />
      <div
        className="relative w-full max-w-md mx-auto bg-background border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200 flex flex-col"
        style={{ maxHeight: "92%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-xl font-extrabold tracking-tight">Edit profile</h2>
          <button onClick={onClose} className="p-2 -m-2"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-10">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-4">
            Tap your avatar on the profile to change your photo.
          </p>
          <div className="space-y-4">
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Field>
            <Field label="Handle"><input value={handle} onChange={(e) => setHandle(e.target.value)} className={inp} /></Field>

            <div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted mb-1.5 block">
                Identity {stats && <span className="text-accent ml-1">— {unlockedCount}/{IDENTITIES.length} unlocked</span>}
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIdentityOpen((v) => !v)}
                  className="w-full flex items-center gap-3 rounded-sm border border-border bg-secondary/40 px-3 py-2.5 text-left"
                >
                  <span className="text-lg leading-none">{selectedIdentity.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold">{selectedIdentity.label}</span>
                    <span className="block text-[11px] text-muted truncate">{selectedIdentity.description}</span>
                  </span>
                  <ChevronDown className={`size-4 text-muted transition-transform ${identityOpen ? "rotate-180" : ""}`} />
                </button>

                {identityOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-10 max-h-64 overflow-y-auto rounded-sm border border-border bg-background shadow-lg divide-y divide-border">
                    {[...IDENTITIES].sort((a, b) => Number(isUnlocked(b.key)) - Number(isUnlocked(a.key))).map((i) => {
                      const selected = identity === i.key;
                      const locked = !isUnlocked(i.key);
                      return (
                        <button
                          key={i.key}
                          type="button"
                          disabled={locked}
                          onClick={() => { if (locked) return; setIdentity(i.key); setIdentityOpen(false); }}
                          className={`w-full text-left flex items-start gap-3 px-3 py-2.5 transition-colors ${
                            locked ? "opacity-45 cursor-not-allowed" : selected ? "bg-accent/10" : "hover:bg-accent/5"
                          }`}
                        >
                          <span className="text-lg leading-none pt-0.5">{i.emoji}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold">{i.label}</span>
                            <span className="block text-[11px] text-muted">{i.description}</span>
                          </span>
                          {locked ? (
                            <Lock className="size-3.5 text-muted shrink-0 mt-1" />
                          ) : selected ? (
                            <span className="text-[9px] font-mono uppercase tracking-widest text-accent shrink-0 pt-1">Active</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-muted">Unlock more identities by logging albums, writing reviews, and building your list.</p>
            </div>

            <Field label="Short bio"><input maxLength={80} value={bioShort} onChange={(e) => setBioShort(e.target.value)} className={inp} /></Field>
            <Field label="Long bio">
              <textarea value={bioLong} onChange={(e) => setBioLong(e.target.value)} rows={4} className={`${inp} resize-none`} />
            </Field>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button onClick={save} disabled={busy} className="w-full bg-accent text-accent-foreground py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full bg-secondary/40 border border-border rounded-sm px-3 py-2.5 text-sm outline-none focus:border-accent";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
