// Lightweight module-level store that remembers the last active tab on
// pages whose state is lost on remount (Explore, Activity, Add music). When
// a detail page (album, artist, chat) calls `router.history.back()`, these
// pages remount and read the remembered tab so the user lands where they
// left off.
type ExploreTab = "following" | "suggested";
type ActivityTab = "notifications" | "messages";
type AddMode = "albums" | "artists" | "genres";
type ProfileTab = "posts" | "diary" | "tolisten";

export const uiState = {
  exploreTab: "following" as ExploreTab,
  activityTab: "notifications" as ActivityTab,
  addMode: "albums" as AddMode,
  addGenre: null as string | null,
  profileTab: "posts" as ProfileTab,
};
