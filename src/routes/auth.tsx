import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — TraX" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session?.user) {
      navigate({ to: "/", replace: true });
    }
  }, [session?.user, navigate]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("username") ?? "").trim();

    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        await signUp(email, password, name);
        setNotice("Account creato. Se richiesto, controlla la mail per confermare l'accesso.");
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "auth-input w-full bg-secondary/40 border border-border rounded-full px-4 py-3 outline-none focus:border-accent";

  return (
    <main
      className="auth-page bg-background text-foreground px-6 pb-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2.5rem)" }}
    >
      <section className="max-w-md mx-auto w-full">
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo className="h-40 w-auto mb-4" />
          <p className="text-sm text-muted mt-1">Track your music journey</p>
        </div>

        <div className="flex gap-1 p-1 bg-secondary/60 rounded-full mb-6">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErr(null);
                setNotice(null);
              }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-full ${mode === m ? "bg-foreground text-background" : "text-muted"}`}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              name="username"
              type="text"
              placeholder="Username"
              required
              minLength={3}
              pattern="[A-Za-z0-9_]{3,}"
              title="Solo lettere, numeri o _ (min. 3 caratteri)"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className={inputClass}
            />
          )}
          <input
            name="email"
            type="email"
            inputMode="email"
            placeholder="Email"
            required
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            className={inputClass}
          />
          <input
            name="password"
            type="password"
            placeholder="Password (min. 6 chars)"
            minLength={6}
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={inputClass}
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          {notice && <p className="text-xs text-muted">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-accent text-accent-foreground py-3 rounded-full text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-[11px] text-muted text-center mt-6 leading-relaxed">
          By continuing you agree to share your music taste with the world
          <br />Your reviews stay yours
        </p>
      </section>
    </main>
  );
}
