import type { EntryFlag } from "../../../types/resource";
import type { InboxEntryFormValues } from "../InboxEntryCreateForm";

export function resolveEntryFlag(form: InboxEntryFormValues): EntryFlag {
  switch (form.selectedPrimaryOption) {
    case "youtube":
      return "YOUTUBE";
    case "spotify":
      return "SPOTIFY";
    case "twitch":
      return "TWITCH";
    case "link":
      return "LINK";
    case "table":
      return "TABLE";
    default:
      return "RAW";
  }
}
