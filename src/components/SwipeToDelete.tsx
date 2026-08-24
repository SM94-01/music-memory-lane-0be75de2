import { useRef, useState, type ReactNode } from "react";

/**
 * SwipeToDelete — wraps a row and reveals a red "delete" track when the user
 * drags from right to left. Past the threshold, `onDelete` is invoked (the
 * caller is responsible for asking for confirmation).
 */
export function SwipeToDelete({
  children,
  onDelete,
  confirmText = "Delete this item?",
}: {
  children: ReactNode;
  onDelete: () => void | Promise<void>;
  confirmText?: string;
}) {
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [busy, setBusy] = useState(false);
  const THRESHOLD = 96;

  async function commit() {
    const passed = dx <= -THRESHOLD;
    setDx(0);
    startX.current = null;
    if (!passed || busy) return;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-[10px] font-mono uppercase tracking-widest text-destructive">
        Delete
      </div>
      <div
        className="relative bg-background touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: startX.current === null ? "transform 160ms" : "none" }}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          if (startX.current === null) return;
          const delta = e.touches[0].clientX - startX.current;
          setDx(Math.min(0, Math.max(-140, delta)));
        }}
        onTouchEnd={commit}
        onTouchCancel={() => {
          setDx(0);
          startX.current = null;
        }}
      >
        {children}
      </div>
    </div>
  );
}
