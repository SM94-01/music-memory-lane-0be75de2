
CREATE TABLE public.hidden_notifications (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notif_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notif_key)
);
GRANT SELECT, INSERT, DELETE ON public.hidden_notifications TO authenticated;
GRANT ALL ON public.hidden_notifications TO service_role;
ALTER TABLE public.hidden_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY hidden_notifs_select_own ON public.hidden_notifications FOR SELECT TO authenticated USING (user_id = public.current_profile_id());
CREATE POLICY hidden_notifs_insert_own ON public.hidden_notifications FOR INSERT TO authenticated WITH CHECK (user_id = public.current_profile_id());
CREATE POLICY hidden_notifs_delete_own ON public.hidden_notifications FOR DELETE TO authenticated USING (user_id = public.current_profile_id());

CREATE TABLE public.hidden_threads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hidden_threads TO authenticated;
GRANT ALL ON public.hidden_threads TO service_role;
ALTER TABLE public.hidden_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY hidden_threads_select_own ON public.hidden_threads FOR SELECT TO authenticated USING (user_id = public.current_profile_id());
CREATE POLICY hidden_threads_insert_own ON public.hidden_threads FOR INSERT TO authenticated WITH CHECK (user_id = public.current_profile_id());
CREATE POLICY hidden_threads_update_own ON public.hidden_threads FOR UPDATE TO authenticated USING (user_id = public.current_profile_id()) WITH CHECK (user_id = public.current_profile_id());
CREATE POLICY hidden_threads_delete_own ON public.hidden_threads FOR DELETE TO authenticated USING (user_id = public.current_profile_id());

CREATE TABLE public.reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reminder_sends_unique ON public.reminder_sends (user_id, kind, ref);
GRANT SELECT ON public.reminder_sends TO authenticated;
GRANT ALL ON public.reminder_sends TO service_role;
ALTER TABLE public.reminder_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminder_sends_select_own ON public.reminder_sends FOR SELECT TO authenticated USING (user_id = public.current_profile_id());

ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS watchlist_reminders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inactivity_reminders boolean NOT NULL DEFAULT true;
