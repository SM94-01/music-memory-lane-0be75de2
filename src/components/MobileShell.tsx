import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, Plus, User, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

const PULL_THRESHOLD = 70;
const PULL_MAX = 120;

export function MobileShell({ children, hideNav = false }: { children: ReactNode; hideNav?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Always show a newly opened page from the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      const scroller = document.scrollingElement || document.documentElement;
      if ((scroller.scrollTop || 0) <= 0) {
        startY.current = e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      const damped = Math.min(PULL_MAX, dy * 0.5);
      setPull(damped);
    };
    const onTouchEnd = async () => {
      if (startY.current == null || refreshing) { setPull(0); startY.current = null; return; }
      const shouldRefresh = pull >= PULL_THRESHOLD;
      startY.current = null;
      if (shouldRefresh) {
        setRefreshing(true);
        setPull(PULL_THRESHOLD);
        try {
          await qc.invalidateQueries();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pull, refreshing, qc]);

  const isActive = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));

  if (loading || !session) {
    return <div className="min-h-screen bg-background" />;
  }

  const indicatorVisible = pull > 0 || refreshing;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {indicatorVisible && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center justify-center pointer-events-none"
          style={{
            top: `calc(env(safe-area-inset-top, 0px) + ${Math.max(8, pull - 32)}px)`,
            opacity: Math.min(1, pull / PULL_THRESHOLD),
          }}
        >
          <div className="size-9 rounded-full bg-foreground/90 text-background flex items-center justify-center shadow-lg">
            <Loader2
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
            />
          </div>
        </div>
      )}

      <nav
        className="sticky top-0 z-40 bg-background border-b border-border px-5 pb-3 flex items-center justify-between"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <Link to="/" aria-label="TraX home" className="flex items-center"><Logo className="h-12 w-auto" /></Link>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Track your music journey</span>
      </nav>

      <main
        className="max-w-md mx-auto pb-32 transition-transform"
        style={{ transform: pull > 0 ? `translateY(${pull}px)` : undefined }}
      >
        {children}
      </main>

      {!hideNav && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-sm z-40">
          <div className="bg-foreground text-background px-3 py-2 flex justify-between items-center rounded-full shadow-2xl ring-4 ring-background/80">
            <NavItem to="/" active={isActive("/") && !isActive("/profile") && !isActive("/add")} label="Explore">
              <Compass className="size-5" strokeWidth={2.2} />
            </NavItem>
            <Link
              to="/add"
              className="size-14 -my-4 bg-accent flex items-center justify-center shrink-0 rounded-full shadow-lg shadow-accent/40 ring-4 ring-background/80"
              aria-label="Add music"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </Link>
            <NavItem to="/profile" active={isActive("/profile")} label="Profile">
              <User className="size-5" strokeWidth={2.2} />
            </NavItem>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, active, label, children }: { to: string; active: boolean; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center gap-0.5 px-6 py-2 transition-opacity ${active ? "opacity-100" : "opacity-40"}`}
    >
      {children}
      <span className="text-[9px] font-mono uppercase tracking-widest">{label}</span>
    </Link>
  );
}
