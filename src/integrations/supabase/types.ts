export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      album_logs: {
        Row: {
          album_key: string
          artist: string
          best_track: string | null
          cover_url: string | null
          created_at: string
          genre: string | null
          id: string
          listened_at: string
          rating: number | null
          review: string | null
          title: string
          user_id: string
          year: number | null
        }
        Insert: {
          album_key: string
          artist: string
          best_track?: string | null
          cover_url?: string | null
          created_at?: string
          genre?: string | null
          id?: string
          listened_at?: string
          rating?: number | null
          review?: string | null
          title: string
          user_id: string
          year?: number | null
        }
        Update: {
          album_key?: string
          artist?: string
          best_track?: string | null
          cover_url?: string | null
          created_at?: string
          genre?: string | null
          id?: string
          listened_at?: string
          rating?: number | null
          review?: string | null
          title?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "album_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_shares: {
        Row: {
          album_key: string
          artist: string
          cover_url: string | null
          created_at: string
          from_user_id: string
          genre: string | null
          id: string
          message: string | null
          read_at: string | null
          title: string
          to_user_id: string
          year: number | null
        }
        Insert: {
          album_key: string
          artist: string
          cover_url?: string | null
          created_at?: string
          from_user_id: string
          genre?: string | null
          id?: string
          message?: string | null
          read_at?: string | null
          title: string
          to_user_id: string
          year?: number | null
        }
        Update: {
          album_key?: string
          artist?: string
          cover_url?: string | null
          created_at?: string
          from_user_id?: string
          genre?: string | null
          id?: string
          message?: string | null
          read_at?: string | null
          title?: string
          to_user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "album_shares_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_shares_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          log_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          log_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          log_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "album_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_notifications: {
        Row: {
          created_at: string
          notif_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notif_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          notif_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_threads: {
        Row: {
          hidden_at: string
          peer_id: string
          user_id: string
        }
        Insert: {
          hidden_at?: string
          peer_id: string
          user_id: string
        }
        Update: {
          hidden_at?: string
          peer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_threads_peer_id_fkey"
            columns: ["peer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_unlocks: {
        Row: {
          id: string
          identity_key: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          id?: string
          identity_key: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          id?: string
          identity_key?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_unlocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          log_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          log_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          log_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "album_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          album_shares: boolean
          comments: boolean
          inactivity_reminders: boolean
          likes: boolean
          new_follower: boolean
          updated_at: string
          user_id: string
          watchlist_reminders: boolean
        }
        Insert: {
          album_shares?: boolean
          comments?: boolean
          inactivity_reminders?: boolean
          likes?: boolean
          new_follower?: boolean
          updated_at?: string
          user_id: string
          watchlist_reminders?: boolean
        }
        Update: {
          album_shares?: boolean
          comments?: boolean
          inactivity_reminders?: boolean
          likes?: boolean
          new_follower?: boolean
          updated_at?: string
          user_id?: string
          watchlist_reminders?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          bio_long: string | null
          bio_short: string | null
          created_at: string
          handle: string
          id: string
          identity: string | null
          is_seed: boolean
          name: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          bio_long?: string | null
          bio_short?: string | null
          created_at?: string
          handle: string
          id?: string
          identity?: string | null
          is_seed?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          bio_long?: string | null
          bio_short?: string | null
          created_at?: string
          handle?: string
          id?: string
          identity?: string | null
          is_seed?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminder_sends: {
        Row: {
          id: string
          kind: string
          ref: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          ref?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          ref?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_sends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          album_key: string
          artist: string
          cover_url: string | null
          created_at: string
          done: boolean
          genre: string | null
          id: string
          title: string
          user_id: string
          year: number | null
        }
        Insert: {
          album_key: string
          artist: string
          cover_url?: string | null
          created_at?: string
          done?: boolean
          genre?: string | null
          id?: string
          title: string
          user_id: string
          year?: number | null
        }
        Update: {
          album_key?: string
          artist?: string
          cover_url?: string | null
          created_at?: string
          done?: boolean
          genre?: string | null
          id?: string
          title?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_profile_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
