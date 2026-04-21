import type { AppLanguage, I18nKey } from "../../../i18n/messages";
import type { InboxEntryFormValues } from "../InboxEntryCreateForm";

export type InboxSection = "explore" | "storage" | "inbox" | "relationshipGraph" | "profile";
export type ProfileFormSection = "username" | "password";

export const INITIAL_INBOX_ENTRY_FORM: InboxEntryFormValues = {
  title: "",
  textContent: "",
  textContentHtml: "",
  mediaFiles: [],
  selectedPrimaryOption: null,
  alarmEnabled: false
};

export const LANGUAGE_OPTIONS: AppLanguage[] = ["es", "en", "fr", "gl"];

export const SECTION_PATH_MAP: Record<InboxSection, string> = {
  explore: "/explore",
  storage: "/library",
  inbox: "/inbox",
  relationshipGraph: "/relationship-graph",
  profile: "/profile"
};

export const SECTION_TITLE_KEY_MAP: Record<
  Exclude<InboxSection, "inbox" | "profile">,
  I18nKey
> = {
  explore: "section.explore",
  storage: "section.storage",
  relationshipGraph: "section.relationshipGraph"
};

export const CONTENT_INBOX_BACKGROUND_URL = new URL(
  "../../../assets/fondocentro.jpg",
  import.meta.url
).href;

const footerButtonBaseClass =
  "flex h-full flex-1 items-center justify-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70";

export function footerButtonClass(active: boolean, withRightBorder: boolean) {
  return [
    footerButtonBaseClass,
    withRightBorder ? "border-r border-brand-200" : "",
    active
      ? "bg-brand-100 text-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
      : "bg-white/85 text-ink-700 hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(170,170,170,0.52)] hover:text-ink-900 hover:backdrop-blur-[20px] hover:shadow-[0_8px_32px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(255,255,255,0.1),inset_0_0_6px_3px_rgba(255,255,255,0.3)]"
  ]
    .filter(Boolean)
    .join(" ");
}

export function sectionFromPath(pathname: string): InboxSection {
  if (pathname === "/profile") {
    return "profile";
  }

  if (pathname === "/explore") {
    return "explore";
  }

  if (pathname === "/library" || pathname === "/storage") {
    return "storage";
  }

  if (pathname === "/relationship-graph") {
    return "relationshipGraph";
  }

  return "inbox";
}
