/**
 * Notification service — shared types.
 */

export type NotificationPrefKey = "new_follower" | "likes" | "comments" | "album_shares";

export type NotificationEvent =
  | {
      type: "follow";
      actorId: string;
      recipientId: string;
      actorName?: string;
    }
  | {
      type: "like";
      actorId: string;
      logId: string;
      actorName?: string;
      albumTitle?: string;
    }
  | {
      type: "comment";
      actorId: string;
      logId: string;
      actorName?: string;
      albumTitle?: string;
      preview?: string;
    }
  | {
      type: "album_share";
      actorId: string;
      recipientId: string;
      albumKey: string;
      albumTitle: string;
      actorName?: string;
    }
  | {
      type: "message";
      actorId: string;
      recipientId: string;
      actorName?: string;
      preview?: string;
    };

export type NotificationType = NotificationEvent["type"];

export interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}
