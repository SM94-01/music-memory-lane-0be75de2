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

// Remembering the last tab only applies *within* a macro section. Switching
// between Explore / Add music / Profile resets everything back to defaults.
type Section = "explore" | "add" | "profile";
let currentSection: Section | null = null;

export function enterSection(section: Section) {
  if (currentSection === section) return;
  currentSection = section;
  uiState.exploreTab = "following";
  uiState.activityTab = "notifications";
  uiState.addMode = "albums";
  uiState.addGenre = null;
  uiState.profileTab = "posts";
}

