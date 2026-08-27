import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notificationService } from "@/lib/notifications";

export const Route = createFileRoute("/messages/$handle")({
  head: ({ params }) => ({ meta: [{ title: `Chat with @${params.handle} — TraX` }] }),
  component: ChatPage,
});

type Msg = {
  id: string; sender_id: string; recipient_id: string; body: string; created_at: string;
};

function ChatPage() {
  const { handle } = Route.useParams();
  const router = useRouter();
  const { data: me } = useMyProfile();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: other } = useQuery({
    queryKey: ["chatPeer", handle],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, handle, name, avatar_url, identity").eq("handle", handle).maybeSingle();
      return data;
    },
  });

  const { data: messages, isLoading } = useQuery({
    queryKey: ["chat", me?.id, other?.id],
    enabled: !!me && !!other,
    queryFn: async (): Promise<Msg[]> => {
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, recipient_id, body, created_at")
        .or(`and(sender_id.eq.${me!.id},recipient_id.eq.${other!.id}),and(sender_id.eq.${other!.id},recipient_id.eq.${me!.id})`)
        .order("created_at", { ascending: true })
        .limit(200);
      return (data as Msg[]) ?? [];
    },
    refetchInterval: 4000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!text.trim() || !me || !other) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      sender_id: me.id, recipient_id: other.id, body: text.trim(),
    });
    setSending(false);
    if (!error) {
      void notificationService.notify({
        type: "message",
        actorId: me.id,
        recipientId: other.id,
        actorName: me.name ?? me.handle,
        preview: text.trim(),
      });
      setText("");
      qc.invalidateQueries({ queryKey: ["chat"] });
    }
  }

  return (
    <MobileShell hideNav>
      <div className="fixed inset-x-0 bottom-0 top-[calc(4.5rem+env(safe-area-inset-top))] bg-background flex flex-col z-30">
        <header className="flex-shrink-0 px-5 py-3 border-b border-border flex items-center gap-3">
          <button onClick={() => router.history.back()} className="p-1 -m-1 text-muted hover:text-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </button>
          {other ? (
            <Link to="/u/$handle" params={{ handle: other.handle }} className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar handle={other.handle} name={other.name} url={other.avatar_url} size={36} />
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{other.name}</p>
                <p className="text-[10px] font-mono text-muted truncate">@{other.handle}</p>
              </div>
            </Link>
          ) : (
            <span className="text-sm text-muted">Loading…</span>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-2">
          {isLoading && <Loader2 className="size-5 animate-spin text-muted mx-auto" />}
          {!isLoading && messages && messages.length === 0 && (
            <p className="text-sm text-muted text-center pt-12">No messages yet. Say hi.</p>
          )}
          {messages?.map((m) => {
            const mine = m.sender_id === me?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm leading-snug ${mine ? "bg-accent text-accent-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm"}`}>
                  {m.body}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-shrink-0 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-border flex items-center gap-2">
          <input
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message…"
            className="flex-1 bg-secondary/40 border border-border rounded-full px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button onClick={send} disabled={sending || !text.trim() || !other} className="size-10 bg-accent text-accent-foreground rounded-full grid place-items-center disabled:opacity-40">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
