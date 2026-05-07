import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "primereact/panel";
import { isApiError } from "../../../api/client";
import {
  createFolder,
  deleteEntry,
  fetchEntryFolders,
  fetchFolders,
  updateEntryFolderSelection
} from "../../../api/resources";
import { useI18n } from "../../../i18n/I18nProvider";
import type { EntryFolderItem, EntryItem, FolderItem, EntryRelationshipItem } from "../../../types/resource";
import { readErrorMessage } from "../../../utils/error";
import { extractPlainTextFromStoredText, extractUrlsFromStoredText } from "../../../utils/richText";
import GlassIcons from "../../ui/GlassIcons";
import { errorTextClass, fieldLabelClass, inputClass } from "../../ui/styles";
import { StorageTabIcon } from "../../ui/StorageTabIcon";
import {
  AlarmClockIcon,
  ArrowLongLeftIcon,
  BookIcon,
  LinkIcon,
  MotionIcon,
  MusicalNoteIcon,
  SquareXIcon,
  TableIcon,
  TwitchIcon,
  YoutubeIcon
} from "../../ui/icons";
import { AnimateIcon } from "../../animate-ui/icons/icon";
import { CreateFolderModal } from "./CreateFolderModal";
import { Portal } from "../../ui/Portal";
import { HeroVideoDialog } from "../../ui/HeroVideoDialog";
import { getRelatedEntryIds } from "../../../utils/relationshipGraph";
import { EntryDetailContent, type EntryDetailContentHandle } from "./EntryDetailContent";
import { DeleteEntryConfirmModal, EntryFoldersMenu } from "./StorageEntriesSectionParts";

type StorageEntriesSectionProps = {
  entries: EntryItem[];
  manualRelationships?: EntryRelationshipItem[];
  loading: boolean;
  error: string | null;
  searchValue: string;
  searchResults: EntryItem[] | null;
  searchLoading: boolean;
  searchError: string | null;
  onSearchChange: (value: string) => void;
  onEntriesUpdated: () => Promise<void> | void;
  onEntryUpdated?: (entryId: number) => Promise<void> | void;
  onUnauthorized: () => void;
  entryToOpenId?: number | null;
  onEntryToOpenHandled?: () => void;
};

type EntryFlagFilter = "ALL" | "YOUTUBE" | "TWITCH" | "SPOTIFY" | "TABLE" | "LINK";

function TodoFilterStorageIcon({ className }: { className?: string }) {
  return <StorageTabIcon className={className} scale={0.18} />;
}

function firstNonEmptyText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function buildEntryText(entry: EntryItem, emptyText: string) {
  if (entry.flag === "TABLE") {
    const tableResource = entry.resources.find((resource) => resource.type === "RAW");
    const table = parseCsvTable(extractPlainTextFromStoredText(tableResource?.textContent).trim());
    return table ? `${table.rows.length} filas, ${table.headers.length} columnas` : "Tabla";
  }

  const textResources = entry.resources
    .filter((resource) => resource.type === "RAW")
    .map((resource) => extractPlainTextFromStoredText(resource.textContent).trim())
    .filter(Boolean);

  if (textResources.length > 0) {
    return textResources.join(" ");
  }

  for (const resource of entry.resources) {
    const preview = firstNonEmptyText(
      extractPlainTextFromStoredText(resource.textContent),
      resource.description,
      resource.contentPreview,
      resource.title,
      resource.siteName,
      resource.url,
      resource.fileName
    );
    if (preview) {
      return preview;
    }
  }

  return emptyText;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;

  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
    return "\t";
  }
  if (semicolonCount >= commaCount && semicolonCount > 0) {
    return ";";
  }
  return ",";
}

function parseCsvTable(text: string): { headers: string[]; rows: string[][] } | null {
  if (!text.trim()) {
    return null;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  const delimiter = detectCsvDelimiter(text);
  const parsedRows = lines.map((line) => parseCsvLine(line, delimiter));
  const maxColumns = Math.max(...parsedRows.map((row) => row.length));

  if (maxColumns < 2) {
    return null;
  }

  const normalized = parsedRows.map((row) => {
    if (row.length >= maxColumns) {
      return row;
    }
    return [...row, ...Array(maxColumns - row.length).fill("")];
  });

  const [headers, ...rows] = normalized;
  return { headers, rows };
}

type YouTubeVideoPreview = {
  id: number;
  title: string;
  url: string;
  videoId: string;
  embedUrl: string;
  isShort: boolean;
};

type TwitchVideoPreview = {
  id: number;
  title: string;
  url: string;
  embedUrl: string;
  variant: "live" | "vod" | "clip";
};

type EntryDisplayCard = {
  key: string;
  entry: EntryItem;
  youtubeVideo: YouTubeVideoPreview | null;
  twitchVideo: TwitchVideoPreview | null;
};

type EntryTypeIconConfig = {
  icon: ({ className }: { className: string }) => JSX.Element;
  className: string;
};

function buildDisplayCards(entries: EntryItem[]): EntryDisplayCard[] {
  const cards: EntryDisplayCard[] = [];

  for (const entry of entries) {
    const youtubeVideos = getEntryYoutubeVideos(entry);
    const twitchVideos = getEntryTwitchVideos(entry);
    const hasYoutubeVideos = youtubeVideos.length > 0;
    const hasTwitchVideos = twitchVideos.length > 0;

    if (entry.flag === "YOUTUBE" && hasYoutubeVideos) {
      youtubeVideos.forEach((video, index) => {
        cards.push({
          key: `${entry.id}-youtube-${video.videoId}-${index}`,
          entry,
          youtubeVideo: video,
          twitchVideo: null
        });
      });
      continue;
    }

    if (entry.flag === "TWITCH" && hasTwitchVideos) {
      twitchVideos.forEach((video, index) => {
        cards.push({
          key: `${entry.id}-twitch-${video.variant}-${index}`,
          entry,
          youtubeVideo: null,
          twitchVideo: video
        });
      });
      continue;
    }

    youtubeVideos.forEach((video, index) => {
      cards.push({
        key: `${entry.id}-youtube-${video.videoId}-${index}`,
        entry,
        youtubeVideo: video,
        twitchVideo: null
      });
    });

    twitchVideos.forEach((video, index) => {
      cards.push({
        key: `${entry.id}-twitch-${video.variant}-${index}`,
        entry,
        youtubeVideo: null,
        twitchVideo: video
      });
    });

    if (!hasYoutubeVideos && !hasTwitchVideos) {
      cards.push({
        key: String(entry.id),
        entry,
        youtubeVideo: null,
        twitchVideo: null
      });
    }
  }

  return cards;
}

function getEntryTypeIconConfig(entry: EntryItem): EntryTypeIconConfig {
  switch (entry.flag) {
    case "YOUTUBE":
      return { icon: YoutubeIcon, className: "text-rose-600" };
    case "TWITCH":
      return { icon: TwitchIcon, className: "text-violet-600" };
    case "SPOTIFY":
      return { icon: MusicalNoteIcon, className: "text-emerald-600" };
    case "TABLE":
      return { icon: TableIcon, className: "text-sky-600" };
    case "LINK":
      return { icon: LinkIcon, className: "text-indigo-600" };
    case "RAW":
    default:
      return { icon: BookIcon, className: "text-brand-600" };
  }
}

function extractYoutubeVideoId(rawUrl: string): string | null {
  try {
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      const firstPathSegment = parsedUrl.pathname.split("/").filter(Boolean)[0];
      return firstPathSegment && /^[A-Za-z0-9_-]{11}$/.test(firstPathSegment) ? firstPathSegment : null;
    }

    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (parsedUrl.pathname === "/watch") {
        const videoId = parsedUrl.searchParams.get("v");
        return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
      }

      const segments = parsedUrl.pathname.split("/").filter(Boolean);
      if (segments.length >= 2 && ["shorts", "embed", "live"].includes(segments[0])) {
        const videoId = segments[1];
        return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function isYoutubeShortUrl(rawUrl: string): boolean {
  try {
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

    if (host !== "youtube.com" && host !== "youtube-nocookie.com") {
      return false;
    }

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    return segments.length >= 2 && segments[0] === "shorts";
  } catch {
    return false;
  }
}

function getEntryYoutubeVideos(entry: EntryItem): YouTubeVideoPreview[] {
  const videosById = new Map<string, YouTubeVideoPreview>();

  for (const resource of entry.resources) {
    if (resource.type !== "LINK" || !resource.url) {
      continue;
    }
    const videoId = extractYoutubeVideoId(resource.url);
    if (!videoId || videosById.has(videoId)) {
      continue;
    }

    videosById.set(videoId, {
      id: resource.id,
      title: resource.title?.trim() || "YouTube",
      url: resource.url,
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      isShort: isYoutubeShortUrl(resource.url)
    });
  }

  return Array.from(videosById.values());
}

function getYoutubeThumbnail(videoId: string | null | undefined) {
  if (!videoId) {
    return null;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function getTwitchEmbedParentHost() {
  if (typeof window !== "undefined" && window.location.hostname) {
    return window.location.hostname;
  }
  return "localhost";
}

function parseTwitchVideoPreview(rawUrl: string): Omit<TwitchVideoPreview, "id" | "title" | "url"> | null {
  try {
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsedUrl = new URL(normalizedUrl);
    const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const parent = encodeURIComponent(getTwitchEmbedParentHost());

    if (host === "clips.twitch.tv" && segments.length >= 1) {
      const slug = segments[0];
      if (!/^[A-Za-z0-9_-]{3,}$/.test(slug)) {
        return null;
      }
      return {
        variant: "clip",
        embedUrl: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${parent}&autoplay=false`
      };
    }

    if (host !== "twitch.tv" || segments.length === 0) {
      return null;
    }

    const first = segments[0].toLowerCase();
    if (first === "videos" && segments.length >= 2) {
      const videoId = segments[1];
      if (!/^\d+$/.test(videoId)) {
        return null;
      }
      return {
        variant: "vod",
        embedUrl: `https://player.twitch.tv/?video=v${encodeURIComponent(videoId)}&parent=${parent}&autoplay=false`
      };
    }

    if (first === "clip" && segments.length >= 2) {
      const slug = segments[1];
      if (!/^[A-Za-z0-9_-]{3,}$/.test(slug)) {
        return null;
      }
      return {
        variant: "clip",
        embedUrl: `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${parent}&autoplay=false`
      };
    }

    if (!/^[A-Za-z0-9_]{2,25}$/.test(first)) {
      return null;
    }

    const reserved = new Set([
      "directory",
      "downloads",
      "jobs",
      "settings",
      "subscriptions",
      "turbo",
      "wallet",
      "friends",
      "inventory",
      "messages",
      "prime",
      "store",
      "search",
      "videos",
      "clip",
      "moderator"
    ]);
    if (reserved.has(first)) {
      return null;
    }

    return {
      variant: "live",
      embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(first)}&parent=${parent}&autoplay=false`
    };
  } catch {
    return null;
  }
}

function getTwitchVariantBadgeConfig(variant: TwitchVideoPreview["variant"]) {
  switch (variant) {
    case "live":
      return {
        labelKey: "storage.twitchLive" as const,
        className:
          "inline-flex w-fit rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700"
      };
    case "vod":
      return {
        labelKey: "storage.twitchVod" as const,
        className:
          "inline-flex w-fit rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700"
      };
    case "clip":
    default:
      return {
        labelKey: "storage.twitchClip" as const,
        className:
          "inline-flex w-fit rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700"
      };
  }
}

function getYouTubeTypeBadgeConfig(isShort: boolean) {
  return {
    label: isShort ? "SHORTS" : "VIDEO",
    className:
      "inline-flex w-fit rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-700"
  };
}

function getEntryTwitchVideos(entry: EntryItem): TwitchVideoPreview[] {
  const videosByEmbed = new Map<string, TwitchVideoPreview>();

  for (const resource of entry.resources) {
    if (resource.type === "LINK" && resource.url) {
      const parsed = parseTwitchVideoPreview(resource.url);
      if (!parsed || videosByEmbed.has(parsed.embedUrl)) {
        continue;
      }

      videosByEmbed.set(parsed.embedUrl, {
        id: resource.id,
        title: resource.title?.trim() || "Twitch",
        url: resource.url,
        embedUrl: parsed.embedUrl,
        variant: parsed.variant
      });
      continue;
    }

    if ((resource.type === "RAW") && resource.textContent) {
      for (const candidateUrl of extractUrlsFromStoredText(resource.textContent)) {
        const parsed = parseTwitchVideoPreview(candidateUrl);
        if (!parsed || videosByEmbed.has(parsed.embedUrl)) {
          continue;
        }

        videosByEmbed.set(parsed.embedUrl, {
          id: resource.id,
          title: "Twitch",
          url: /^https?:\/\//i.test(candidateUrl) ? candidateUrl : `https://${candidateUrl}`,
          embedUrl: parsed.embedUrl,
          variant: parsed.variant
        });
      }
    }
  }

  return Array.from(videosByEmbed.values());
}

export function StorageEntriesSection({
  entries,
  manualRelationships = [],
  loading,
  error,
  searchValue,
  searchResults,
  searchLoading,
  searchError,
  onSearchChange,
  onEntriesUpdated,
  onEntryUpdated,
  onUnauthorized,
  entryToOpenId = null,
  onEntryToOpenHandled
}: StorageEntriesSectionProps) {
  const { t } = useI18n();
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [folderEntriesLoading, setFolderEntriesLoading] = useState(false);
  const [folderEntriesError, setFolderEntriesError] = useState<string | null>(null);
  const [folderEntryIds, setFolderEntryIds] = useState<number[]>([]);
  const [foldersViewActive, setFoldersViewActive] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [entryFolders, setEntryFolders] = useState<EntryFolderItem[]>([]);
  const [entryFoldersLoading, setEntryFoldersLoading] = useState(false);
  const [entryFoldersError, setEntryFoldersError] = useState<string | null>(null);
  const [entryFoldersOpen, setEntryFoldersOpen] = useState(false);
  const [updatingFolderId, setUpdatingFolderId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<number | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [deleteEntryError, setDeleteEntryError] = useState<string | null>(null);
  const [carouselSliding, setCarouselSliding] = useState(false);
  const [carouselDirection, setCarouselDirection] = useState<"left" | "right" | null>(null);
  const [forcedLeftEntryId, setForcedLeftEntryId] = useState<number | null>(null);
  const [forcedRightEntryId, setForcedRightEntryId] = useState<number | null>(null);
  const [activeFlagFilter, setActiveFlagFilter] = useState<EntryFlagFilter>("ALL");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const entryFoldersMenuRef = useRef<HTMLDivElement | null>(null);
  const carouselTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryDetailContentRef = useRef<EntryDetailContentHandle | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  function buildAlarmCountdownText(notificationDate: string | null) {
    if (!notificationDate) {
      return null;
    }
    const deadlineMs = Date.parse(notificationDate);
    if (Number.isNaN(deadlineMs)) {
      return null;
    }
    const diffMs = deadlineMs - nowMs;
    if (diffMs <= 0) {
      return "Vencida";
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) {
      return `Queda ${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `Queda ${hours}h ${minutes}m`;
    }
    return `Queda ${minutes}m`;
  }

  const filteredEntries = useMemo(() => {
    const query = searchValue.trim();
    const searchFiltered = !query ? entries : (searchResults ?? []);

    if (activeFlagFilter === "ALL") {
      return searchFiltered;
    }

    return searchFiltered.filter((entry) => entry.flag === activeFlagFilter);
  }, [activeFlagFilter, entries, searchResults, searchValue]);

  const flagFilters = useMemo(
    () => [
      { key: "ALL" as const, label: "Todo", icon: TodoFilterStorageIcon },
      { key: "YOUTUBE" as const, label: "YouTube", icon: YoutubeIcon },
      { key: "TWITCH" as const, label: "Twitch", icon: TwitchIcon },
      { key: "SPOTIFY" as const, label: "Spotify", icon: MusicalNoteIcon },
      { key: "TABLE" as const, label: "Tablas", icon: TableIcon },
      { key: "LINK" as const, label: "Links", icon: LinkIcon }
    ],
    []
  );

  const glassFilterItems = useMemo(
    () =>
      flagFilters.map((filter) => {
        const Icon = filter.icon;
        const colorByKey: Record<EntryFlagFilter, string> = {
          ALL: "indigo",
          YOUTUBE: "red",
          TWITCH: "purple",
          SPOTIFY: "green",
          TABLE: "blue",
          LINK: "indigo"
        };

        return {
          icon: <Icon className="h-5 w-5" />,
          color: colorByKey[filter.key],
          label: filter.label,
          active: activeFlagFilter === filter.key,
          onClick: () => setActiveFlagFilter(filter.key)
        };
      }),
    [activeFlagFilter, flagFilters]
  );

  const filteredFolders = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return folders;
    }

    return folders.filter((folder) => folder.title.toLowerCase().includes(query));
  }, [folders, searchValue]);

  const selectedEntry = useMemo(() => {
    if (selectedEntryId === null) {
      return null;
    }
    return entries.find((entry) => entry.id === selectedEntryId) ?? null;
  }, [entries, selectedEntryId]);

  const selectedEntryStableId = selectedEntry?.id ?? null;

  const pendingDeleteEntry = useMemo(() => {
    if (pendingDeleteEntryId === null) {
      return null;
    }
    return entries.find((entry) => entry.id === pendingDeleteEntryId) ?? null;
  }, [entries, pendingDeleteEntryId]);

  useEffect(() => {
    if (entryToOpenId === null) {
      return;
    }

    const targetEntry = entries.find((entry) => entry.id === entryToOpenId);
    if (!targetEntry) {
      if (!loading) {
        onEntryToOpenHandled?.();
      }
      return;
    }

    setFoldersViewActive(false);
    setSelectedFolder(null);
    setSelectedEntryId(targetEntry.id);
    onEntryToOpenHandled?.();
  }, [entries, entryToOpenId, loading, onEntryToOpenHandled]);
  const relatedEntries = useMemo(() => {
    if (!selectedEntry) {
      return [];
    }

    const relatedIds = getRelatedEntryIds(selectedEntry.id, entries, manualRelationships);

    return entries.filter(
      (entry) => entry.id !== selectedEntry.id && relatedIds.has(entry.id)
    );
  }, [selectedEntry, entries, manualRelationships]);

  const entriesById = useMemo(() => {
    return new Map(entries.map((entry) => [entry.id, entry]));
  }, [entries]);

  const { leftRelatedEntries, rightRelatedEntries } = useMemo(() => {
    if (!selectedEntry) {
      return { leftRelatedEntries: [] as EntryItem[], rightRelatedEntries: [] as EntryItem[] };
    }

    const candidates = relatedEntries.filter((entry) => entry.id !== selectedEntry.id);
    const ordered: EntryItem[] = [];
    const usedIds = new Set<number>();

    const pushCandidate = (candidate: EntryItem | null) => {
      if (!candidate || usedIds.has(candidate.id)) {
        return;
      }
      if (!candidates.some((entry) => entry.id === candidate.id)) {
        return;
      }
      ordered.push(candidate);
      usedIds.add(candidate.id);
    };

    pushCandidate(forcedLeftEntryId !== null ? entriesById.get(forcedLeftEntryId) ?? null : null);
    pushCandidate(forcedRightEntryId !== null ? entriesById.get(forcedRightEntryId) ?? null : null);

    for (const candidate of candidates) {
      pushCandidate(candidate);
    }

    const visible = ordered.slice(0, 6);
    const midpoint = Math.ceil(visible.length / 2);

    return {
      leftRelatedEntries: visible.slice(0, midpoint),
      rightRelatedEntries: visible.slice(midpoint)
    };
  }, [entriesById, forcedLeftEntryId, forcedRightEntryId, relatedEntries, selectedEntry]);

  const selectedFolderEntries = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }
    const allowedIds = new Set(folderEntryIds);
    return filteredEntries.filter((entry) => allowedIds.has(entry.id));
  }, [filteredEntries, folderEntryIds, selectedFolder]);

  const handleRequestError = useCallback(
    (requestError: unknown, setError: (message: string) => void) => {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      setError(readErrorMessage(requestError, t("common.unexpectedError")));
    },
    [onUnauthorized, t]
  );

  const mapFoldersLoadError = useCallback(
    (requestError: unknown) => {
      if (isApiError(requestError) && requestError.status === 403) {
        return t("storage.folderForbidden");
      }
      if (isApiError(requestError) && requestError.status === 404) {
        return t("storage.foldersFeatureUnavailable");
      }
      return readErrorMessage(requestError, t("storage.foldersLoadError"));
    },
    [t]
  );

  const mapEntryFoldersLoadError = useCallback(
    (requestError: unknown) => {
      if (isApiError(requestError) && requestError.status === 403) {
        return t("storage.folderForbidden");
      }
      if (isApiError(requestError) && requestError.status === 404) {
        return t("storage.foldersFeatureUnavailable");
      }
      return readErrorMessage(requestError, t("storage.entryFoldersLoadError"));
    },
    [t]
  );

  const loadFolders = useCallback(async () => {
    try {
      setFoldersLoading(true);
      setFoldersError(null);
      const data = await fetchFolders();
      setFolders(data);
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      setFoldersError(mapFoldersLoadError(requestError));
    } finally {
      setFoldersLoading(false);
    }
  }, [mapFoldersLoadError, onUnauthorized]);

  const loadEntryFolders = useCallback(
    async (entryId: number) => {
      try {
        setEntryFoldersLoading(true);
        setEntryFoldersError(null);
        const data = await fetchEntryFolders(entryId);
        setEntryFolders(data);
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return;
        }
        setEntryFoldersError(mapEntryFoldersLoadError(requestError));
      } finally {
        setEntryFoldersLoading(false);
      }
    },
    [mapEntryFoldersLoadError, onUnauthorized]
  );

  const loadSelectedFolderEntries = useCallback(
    async (folderId: number) => {
      try {
        setFolderEntriesLoading(true);
        setFolderEntriesError(null);

        const relations = await Promise.all(
          entries.map(async (entry) => {
            const entryFolderItems = await fetchEntryFolders(entry.id);
            const belongsToFolder = entryFolderItems.some((folder) => folder.id === folderId && folder.selected);
            return belongsToFolder ? entry.id : null;
          })
        );

        setFolderEntryIds(relations.filter((entryId): entryId is number => entryId !== null));
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return;
        }
        setFolderEntriesError(mapEntryFoldersLoadError(requestError));
        setFolderEntryIds([]);
      } finally {
        setFolderEntriesLoading(false);
      }
    },
    [entries, mapEntryFoldersLoadError, onUnauthorized]
  );

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (!selectedEntry) {
      setEntryFoldersOpen(false);
      setEntryFolders([]);
      setEntryFoldersError(null);
      setDeleteConfirmOpen(false);
      setDeletingEntry(false);
      setDeleteEntryError(null);
      setCarouselSliding(false);
      setCarouselDirection(null);
      setForcedLeftEntryId(null);
      setForcedRightEntryId(null);
      return;
    }
  }, [selectedEntryStableId]);
  useEffect(() => {
    setSelectedEntryId(null);
    setEntryFoldersOpen(false);
  }, [selectedFolder]);

  useEffect(() => {
    if (!foldersViewActive || !selectedFolder) {
      setFolderEntryIds([]);
      setFolderEntriesError(null);
      setFolderEntriesLoading(false);
      return;
    }
    void loadSelectedFolderEntries(selectedFolder.id);
  }, [foldersViewActive, loadSelectedFolderEntries, selectedFolder]);

  useEffect(() => {
    if (selectedEntryId === null && !entryFoldersOpen && !createFolderModalOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (deleteConfirmOpen) {
          setDeleteConfirmOpen(false);
          setDeleteEntryError(null);
          return;
        }
        void (async () => {
          const closed = await closeSelectedEntry();
          if (!closed) {
            return;
          }
          setSelectedFolder(null);
          setEntryFoldersOpen(false);
          setCreateFolderModalOpen(false);
          setFoldersViewActive(false);
        })();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeSelectedEntry, createFolderModalOpen, deleteConfirmOpen, entryFoldersOpen, selectedEntryId]);

  useEffect(() => {
    if (!entryFoldersOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (entryFoldersOpen && !entryFoldersMenuRef.current?.contains(target)) {
        setEntryFoldersOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => document.removeEventListener("mousedown", handleDocumentMouseDown);
  }, [entryFoldersOpen]);

  useEffect(() => {
    return () => {
      if (carouselTimeoutRef.current) {
        clearTimeout(carouselTimeoutRef.current);
      }
    };
  }, []);

  function iconToggleClass(active: boolean) {
    return [
      "inline-flex h-10 w-10 items-center justify-center rounded-control border transition",
      active
        ? "border-brand-500 bg-brand-500 text-white shadow-sm"
        : "border-[#F0F0F0] bg-white/25 text-brand-700 hover:bg-brand-50"
    ].join(" ");
  }

  function openCreateFolderModal() {
    setCreateFolderError(null);
    setNewFolderTitle("");
    setCreateFolderModalOpen(true);
  }

  function toggleFoldersView() {
    setFoldersViewActive((current) => {
      const next = !current;
      if (next) {
        setSelectedEntryId(null);
        setEntryFoldersOpen(false);
        setSelectedFolder(null);
        void loadFolders();
      } else {
        setSelectedFolder(null);
      }
      return next;
    });
  }

  function openFolder(folder: FolderItem) {
    setSelectedFolder(folder);
  }

  function handleFoldersHeaderButtonClick() {
    if (foldersViewActive && selectedFolder) {
      setSelectedFolder(null);
      return;
    }
    toggleFoldersView();
  }

  async function handleCreateFolder() {
    const title = newFolderTitle.trim();
    if (!title) {
      setCreateFolderError(t("storage.folderTitleRequired"));
      return;
    }

    try {
      setCreatingFolder(true);
      setCreateFolderError(null);
      await createFolder(title);
      setCreateFolderModalOpen(false);
      setNewFolderTitle("");
      await loadFolders();
      if (selectedEntry && entryFoldersOpen) {
        await loadEntryFolders(selectedEntry.id);
      }
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      if (isApiError(requestError) && requestError.status === 403) {
        setCreateFolderError(t("storage.folderForbidden"));
        return;
      }
      if (isApiError(requestError) && requestError.status === 409) {
        setCreateFolderError(t("storage.folderAlreadyExists"));
        return;
      }
      setCreateFolderError(readErrorMessage(requestError, t("storage.folderCreateError")));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleToggleEntryFolder(folder: EntryFolderItem) {
    if (!selectedEntry) {
      return;
    }

    try {
      setUpdatingFolderId(folder.id);
      setEntryFoldersError(null);
      const data = await updateEntryFolderSelection(selectedEntry.id, folder.id, !folder.selected);
      setEntryFolders(data);
      await loadFolders();
      if (foldersViewActive && selectedFolder) {
        await loadSelectedFolderEntries(selectedFolder.id);
      }
    } catch (requestError) {
      handleRequestError(requestError, setEntryFoldersError);
    } finally {
      setUpdatingFolderId(null);
    }
  }

  function openEntryFoldersMenu() {
    if (!selectedEntry) {
      return;
    }

    setEntryFoldersOpen((current) => {
      const next = !current;
      if (next) {
        void loadEntryFolders(selectedEntry.id);
      }
      return next;
    });
  }

  function openDeleteEntryConfirm() {
    if (!selectedEntry) {
      return;
    }
    setEntryFoldersOpen(false);
    setDeleteEntryError(null);
    setPendingDeleteEntryId(selectedEntry.id);
    setDeleteConfirmOpen(true);
  }

  function openDeleteEntryConfirmForEntry(entryId: number) {
    setEntryFoldersOpen(false);
    setDeleteEntryError(null);
    setPendingDeleteEntryId(entryId);
    setDeleteConfirmOpen(true);
  }

  function closeDeleteEntryConfirm() {
    if (deletingEntry) {
      return;
    }
    setDeleteConfirmOpen(false);
    setDeleteEntryError(null);
    setPendingDeleteEntryId(null);
  }

  async function confirmDeleteSelectedEntry() {
    if (!pendingDeleteEntry) {
      return;
    }

    try {
      setDeletingEntry(true);
      setDeleteEntryError(null);
      await deleteEntry(pendingDeleteEntry.id);
      setDeleteConfirmOpen(false);
      setPendingDeleteEntryId(null);
      setForcedLeftEntryId(null);
      setForcedRightEntryId(null);
      if (selectedEntryId === pendingDeleteEntry.id) {
        setSelectedEntryId(null);
      }
      await onEntriesUpdated();
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      setDeleteEntryError(readErrorMessage(requestError, t("storage.deleteEntryError")));
    } finally {
      setDeletingEntry(false);
    }
  }

  async function closeSelectedEntry() {
    if (entryDetailContentRef.current) {
      const saved = await entryDetailContentRef.current.saveTextChanges();
      if (!saved) {
        return false;
      }
    }

    setForcedLeftEntryId(null);
    setForcedRightEntryId(null);
    setSelectedEntryId(null);
    return true;
  }

  async function openRelatedEntry(entry: EntryItem, direction: "left" | "right") {
    if (selectedEntryId === entry.id || carouselSliding) {
      return;
    }
    if (entryDetailContentRef.current) {
      const saved = await entryDetailContentRef.current.saveTextChanges();
      if (!saved) {
        return;
      }
    }

    const currentCenterId = selectedEntryId;
    setCarouselDirection(direction);
    setCarouselSliding(true);

    if (currentCenterId !== null) {
      if (direction === "right") {
        setForcedLeftEntryId(currentCenterId);
        setForcedRightEntryId(null);
      } else {
        setForcedRightEntryId(currentCenterId);
        setForcedLeftEntryId(null);
      }
    }
    setSelectedEntryId(entry.id);

    if (carouselTimeoutRef.current) {
      clearTimeout(carouselTimeoutRef.current);
    }

    carouselTimeoutRef.current = setTimeout(() => {
      setCarouselSliding(false);
      setCarouselDirection(null);
      carouselTimeoutRef.current = null;
    }, 180);
  }
  const carouselTranslateClass = carouselSliding
    ? carouselDirection === "left"
      ? "translate-x-3"
      : carouselDirection === "right"
        ? "-translate-x-3"
        : "translate-x-0"
    : "translate-x-0";
  const leftCardScaleClass = carouselSliding
    ? carouselDirection === "left"
      ? "scale-[0.99] opacity-100"
      : "scale-[0.96] opacity-80"
    : "scale-[0.985] opacity-95";
  const centerCardScaleClass = carouselSliding ? "scale-[0.985] opacity-96" : "scale-100 opacity-100";
  const rightCardScaleClass = carouselSliding
    ? carouselDirection === "right"
      ? "scale-[0.99] opacity-100"
      : "scale-[0.96] opacity-80"
    : "scale-[0.985] opacity-95";

  function renderRelatedStack(entriesToRender: EntryItem[], side: "left" | "right", scaleClass: string, title: string) {
    return (
      <div
        className={`hidden w-[240px] shrink-0 flex-col gap-3 transform-gpu transition-all duration-300 ease-out lg:flex ${scaleClass} ${
          entriesToRender.length === 0 ? "opacity-60" : ""
        }`}
      >
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</p>
        {entriesToRender.length === 0 ? (
          <div className="rounded-[24px] border border-white/45 bg-white/35 px-4 py-4 text-xs text-ink-600 shadow-[0_10px_26px_rgba(15,23,42,0.06)] backdrop-blur-[18px]">
            {t("storage.noRelatedEntries")}
          </div>
        ) : (
          entriesToRender.map((entry, index) => (
            <button
              key={`${side}-related-${entry.id}`}
              type="button"
              className={`w-full rounded-[26px] border border-slate-200/60 p-3 text-left shadow-[0_14px_36px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(255,255,255,0.08),inset_0_0_8px_3px_rgba(255,255,255,0.18)] backdrop-blur-[20px] transition-all duration-200 ${
                index === 0
                  ? "bg-[linear-gradient(180deg,rgba(247,248,250,0.82)_0%,rgba(232,236,241,0.62)_100%)] hover:-translate-y-0.5 hover:shadow-lg"
                  : "bg-[linear-gradient(180deg,rgba(249,250,252,0.72)_0%,rgba(235,239,244,0.52)_100%)] hover:-translate-y-0.5 hover:shadow-md"
              }`}
              onClick={() => void openRelatedEntry(entry, side)}
              aria-label={t("storage.openRelatedAria", { title: entry.title })}
              disabled={carouselSliding}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-bold text-ink-900">{entry.title}</h4>
                  <p className="mt-2 break-words text-xs text-ink-700 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                    {buildEntryText(entry, t("entries.noContent"))}
                  </p>
                </div>
                <span className="inline-flex shrink-0 rounded-full border border-white/70 bg-white/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                  {entry.processingCategory || (entry.flag && entry.flag !== "RAW" ? entry.flag.toLowerCase() : "nota")}
                </span>
              </div>
              {entry.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span
                      key={`${entry.id}-related-tag-${tag.id}`}
                      className="inline-flex rounded-full border border-white/75 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-ink-700"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
    );
  }

  const showingEntries = foldersViewActive && selectedFolder ? selectedFolderEntries : filteredEntries;
  const displayCards = useMemo(() => buildDisplayCards(showingEntries), [showingEntries]);

  return (
    <>
      <section className="flex h-full flex-col gap-4 px-4 py-4 sm:px-6">
        <section className="glass-card shadow-card shrink-0 border-white/90 bg-[linear-gradient(180deg,rgba(255,247,239,0.95)_0%,rgba(229,243,255,0.9)_100%)] shadow-[0_24px_52px_rgba(15,23,42,0.11)]">
        <div className="grid gap-3 px-4 py-4 md:px-5">
          <h2 className="heading-title text-center text-ink-900">
            {foldersViewActive && selectedFolder ? selectedFolder.title : t("section.storage")}
          </h2>

          <div className="flex items-center gap-2">
            <label className={`${fieldLabelClass} flex-1`}>
              <input
                type="text"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t("storage.searchPlaceholder")}
                className={inputClass}
                aria-label={t("storage.searchLabel")}
              />
            </label>

            <div className="flex shrink-0 justify-center">
              <button
                type="button"
                className={iconToggleClass(foldersViewActive)}
                aria-label={foldersViewActive && selectedFolder ? t("common.back") : t("storage.foldersToggleAria")}
                onClick={handleFoldersHeaderButtonClick}
              >
                {foldersViewActive && selectedFolder ? (
                  <ArrowLongLeftIcon className="h-6 w-6" />
                ) : (
                  <StorageTabIcon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
          {searchValue.trim() && searchLoading ? (
            <p className="text-xs font-semibold text-ink-500">{t("storage.searching")}</p>
          ) : null}
          {searchValue.trim() && searchError ? <p className={errorTextClass}>{searchError}</p> : null}
          <GlassIcons items={glassFilterItems} className="storage-glass-filters" />
        </div>
        </section>

      <div className="scrollbar-brand min-h-0 flex-1 overflow-y-auto">
        {foldersViewActive && !selectedFolder ? (
        <>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-white/80 bg-[#FFF9F0]/92 px-3 text-sm font-semibold text-brand-800 shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition hover:border-brand-200 hover:bg-[#FFF4E6]"
              aria-label={t("storage.createFolderAria")}
              onClick={openCreateFolderModal}
              disabled={creatingFolder}
            >
              <StorageTabIcon className="h-5 w-5" />
              <span>{t("storage.createFolder")}</span>
            </button>
          </div>

          {foldersError ? (
            <section className="mt-5 rounded-card border border-white/80 bg-[#FFF9F0]/92 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
              <p className="text-sm font-medium text-ink-600">{foldersError}</p>
            </section>
          ) : null}

          {foldersLoading ? (
            <section className="mt-5 rounded-card border border-white/80 bg-[#FFF9F0]/92 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
              <p className="text-sm font-medium text-ink-600">{t("storage.loading")}</p>
            </section>
          ) : filteredFolders.length === 0 ? (
            <section className="mt-5 rounded-card border border-white/80 bg-[#FFF9F0]/92 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
              <p className="text-sm font-medium text-ink-600">{t("storage.noFolders")}</p>
            </section>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
            >
              {filteredFolders.map((folder) => (
                <button
                  key={`folder-${folder.id}`}
                  type="button"
                  className="col-span-1 grid min-w-0 gap-3 rounded-[28px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,240,0.96)_0%,rgba(255,243,229,0.92)_100%)] p-4 text-left shadow-[0_22px_44px_rgba(15,23,42,0.10)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-[linear-gradient(180deg,rgba(255,246,235,0.98)_0%,rgba(255,238,216,0.95)_100%)]"
                  onClick={() => openFolder(folder)}
                  aria-label={folder.title}
                >
                  <h3 className="break-words text-base font-semibold leading-snug text-ink-950">{folder.title}</h3>
                  <div className="flex min-h-20 items-center justify-center rounded-[22px] border border-[#EADFCF] bg-[linear-gradient(180deg,#FFFDF8_0%,#FFF5E8_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <StorageTabIcon className="h-10 w-10 text-brand-700" scale={0.38} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : foldersViewActive && selectedFolder && folderEntriesLoading ? (
        <section className="rounded-card border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,242,0.92)_0%,rgba(235,244,252,0.84)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
          <p className="text-sm font-medium text-ink-600">{t("storage.loading")}</p>
        </section>
      ) : foldersViewActive && selectedFolder && folderEntriesError ? (
        <section className="rounded-card border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,242,0.92)_0%,rgba(235,244,252,0.84)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
          <p className="text-sm font-medium text-ink-600">{folderEntriesError}</p>
        </section>
      ) : loading ? (
        <section className="rounded-card border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,242,0.92)_0%,rgba(235,244,252,0.84)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
          <p className="text-sm font-medium text-ink-600">{t("storage.loading")}</p>
        </section>
      ) : error ? (
        <section className="rounded-card border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,242,0.92)_0%,rgba(235,244,252,0.84)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
          <p className={errorTextClass}>{t("common.errorPrefix", { message: error })}</p>
        </section>
      ) : displayCards.length === 0 ? (
        <section className="rounded-card border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,242,0.92)_0%,rgba(235,244,252,0.84)_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:p-5">
          <p className="text-sm font-medium text-ink-600">
            {searchValue.trim() ? t("storage.emptyFiltered") : t("storage.empty")}
          </p>
        </section>
      ) : (
        <>
          <div className="columns-1 gap-3 md:columns-2 xl:columns-3 2xl:columns-4">
            {displayCards.map((card) => {
              const { entry, youtubeVideo, twitchVideo } = card;
              const selected = selectedEntryId === entry.id;
              const isYoutubeCard = youtubeVideo !== null;
              const isTwitchCard = twitchVideo !== null;
              const entryTypeIcon = getEntryTypeIconConfig(entry);
              const EntryTypeIcon = entryTypeIcon.icon;
              const cardTitle = isYoutubeCard
                ? youtubeVideo!.title
                : isTwitchCard
                  ? twitchVideo!.title
                  : entry.title;

              if (!isYoutubeCard && !isTwitchCard) {
                return (
                  <article
                    key={card.key}
                    className="mb-3 inline-block w-full break-inside-avoid text-left"
                  >
                    <Panel
                      header={
                        <div className="flex items-start justify-between gap-3">
                          <span className="break-words pr-2 text-base font-extrabold leading-snug text-ink-900">
                            {cardTitle}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {entry.notificationDate ? (
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <AlarmClockIcon className="h-4 w-4" />
                              </span>
                            ) : null}
                            <EntryTypeIcon className={`h-6 w-6 ${entryTypeIcon.className}`} />
                          </div>
                        </div>
                      }
                      className={`library-entry-panel ${selected ? "library-entry-panel-selected" : ""}`}
                      onClick={() => {
                        setForcedLeftEntryId(null);
                        setForcedRightEntryId(null);
                        setSelectedEntryId(entry.id);
                      }}
                    >
                      <p className="break-words text-sm text-ink-700 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {buildEntryText(entry, t("entries.noContent"))}
                      </p>
                      {entry.notificationDate ? (
                        <div className="mt-2 grid gap-1">
                          <p className="text-xs font-semibold text-amber-700">
                            Deadline: {new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.notificationDate))}
                          </p>
                          <p className="text-xs font-semibold text-emerald-700">
                            {buildAlarmCountdownText(entry.notificationDate)}
                          </p>
                        </div>
                      ) : null}
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {entry.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800"
                            >
                              #{tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center text-rose-700 transition hover:text-rose-800"
                          aria-label={t("storage.deleteEntryAria")}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDeleteEntryConfirmForEntry(entry.id);
                          }}
                        >
                          <AnimateIcon animateOnHover>
                            <SquareXIcon className="h-4 w-4" />
                          </AnimateIcon>
                        </button>
                      </div>
                    </Panel>
                  </article>
                );
              }

              return (
                <article
                  key={card.key}
                  className={`relative mb-3 inline-block w-full break-inside-avoid rounded-card border bg-[linear-gradient(180deg,rgba(255,250,244,0.9)_0%,rgba(235,244,252,0.82)_100%)] p-4 text-left shadow-[0_18px_38px_rgba(15,23,42,0.08)] transition ${
                    selected
                      ? "border-brand-500 ring-2 ring-brand-100"
                      : "border-white/80 hover:bg-[linear-gradient(180deg,rgba(255,247,239,0.96)_0%,rgba(227,242,255,0.88)_100%)]"
                  }`}
                  onClick={() => {
                    setForcedLeftEntryId(null);
                    setForcedRightEntryId(null);
                    setSelectedEntryId(entry.id);
                  }}
                >
                  <div className="mb-2 pr-20">
                    <h3 className="break-words text-base font-extrabold leading-snug text-ink-900">{cardTitle}</h3>
                  </div>
                  <EntryTypeIcon
                    className={`pointer-events-none absolute right-4 top-4 h-7 w-7 ${entryTypeIcon.className}`}
                  />
                  {entry.notificationDate ? (
                    <span className="pointer-events-none absolute right-4 top-12 inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow-sm">
                      <AlarmClockIcon className="h-4 w-4" />
                    </span>
                  ) : null}
                  {entry.notificationDate ? (
                    <div className="mb-2 grid gap-1">
                      <p className="text-xs font-semibold text-amber-700">
                        Deadline: {new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.notificationDate))}
                      </p>
                      <p className="text-xs font-semibold text-emerald-700">
                        {buildAlarmCountdownText(entry.notificationDate)}
                      </p>
                    </div>
                  ) : null}
                  {isYoutubeCard && (
                    <div className="mt-2 flex justify-start">
                      {(() => {
                        const badge = getYouTubeTypeBadgeConfig(youtubeVideo!.isShort);
                        return <span className={badge.className}>{badge.label}</span>;
                      })()}
                    </div>
                  )}
                  {isTwitchCard && (
                    <div className="mt-2 flex justify-start">
                      {(() => {
                        const badge = getTwitchVariantBadgeConfig(twitchVideo!.variant);
                        return <span className={badge.className}>{t(badge.labelKey)}</span>;
                      })()}
                    </div>
                  )}
                  <div className="mt-2 h-px w-full bg-brand-200" />
                  {isYoutubeCard ? (
                    <div className="mt-2">
                      <HeroVideoDialog
                        animationStyle="from-center"
                        videoSrc={youtubeVideo!.embedUrl}
                        thumbnailSrc={getYoutubeThumbnail(youtubeVideo!.videoId)}
                        thumbnailAlt={youtubeVideo!.title}
                        title={youtubeVideo!.title}
                        aspectRatio={youtubeVideo!.isShort ? "short" : "video"}
                      />
                    </div>
                  ) : isTwitchCard ? (
                    <div className="mt-2">
                      <HeroVideoDialog
                        animationStyle="from-center"
                        videoSrc={twitchVideo!.embedUrl}
                        title={twitchVideo!.title}
                        aspectRatio="video"
                        triggerContent={
                          <div
                            className={`relative aspect-video overflow-hidden rounded-control border ${
                              twitchVideo!.variant === "live"
                                ? "border-rose-200 bg-rose-50"
                                : twitchVideo!.variant === "vod"
                                  ? "border-indigo-200 bg-indigo-50"
                                  : "border-amber-200 bg-amber-50"
                            }`}
                          >
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/30 backdrop-blur-md">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-md">
                                  <TwitchIcon className="h-5 w-5 text-violet-700" />
                                </div>
                              </div>
                            </div>
                          </div>
                        }
                      />
                    </div>
                  ) : (
                    <p className="break-words text-sm text-ink-700 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {buildEntryText(entry, t("entries.noContent"))}
                    </p>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800"
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center text-rose-700 transition hover:text-rose-800"
                      aria-label={t("storage.deleteEntryAria")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDeleteEntryConfirmForEntry(entry.id);
                      }}
                    >
                      <AnimateIcon animateOnHover>
                        <SquareXIcon className="h-4 w-4" />
                      </AnimateIcon>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <DeleteEntryConfirmModal
            open={deleteConfirmOpen && pendingDeleteEntry !== null}
            submitting={deletingEntry}
            error={deleteEntryError ? t("common.errorPrefix", { message: deleteEntryError }) : null}
            title={t("storage.deleteEntryConfirmTitle")}
            message={t("storage.deleteEntryConfirmMessage")}
            cancelLabel={t("storage.deleteEntryConfirmNo")}
            confirmLabel={t("storage.deleteEntryConfirmYes")}
            savingLabel={t("common.saving")}
            onClose={closeDeleteEntryConfirm}
            onConfirm={() => void confirmDeleteSelectedEntry()}
          />
        </>
      )}
      </div>

      <CreateFolderModal
        open={createFolderModalOpen}
        value={newFolderTitle}
        submitting={creatingFolder}
        error={createFolderError}
        onChange={(value) => {
          setNewFolderTitle(value);
          if (createFolderError) {
            setCreateFolderError(null);
          }
        }}
        onSubmit={handleCreateFolder}
        onClose={() => {
          if (creatingFolder) {
            return;
          }
          setCreateFolderModalOpen(false);
          setCreateFolderError(null);
        }}
      />
      </section>

      {selectedEntry && (
        <Portal>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={t("storage.detailTitle")}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                void closeSelectedEntry();
              }
            }}
          >
          <div className="w-full overflow-hidden">
            <div
              className={`mx-auto flex w-full max-w-[1120px] items-center justify-center gap-3 transform-gpu transition-transform duration-300 ease-out ${carouselTranslateClass}`}
            >
            {renderRelatedStack(leftRelatedEntries, "left", leftCardScaleClass, t("storage.relatedLeft"))}

            <div
              className={`flex max-h-[calc(100vh-2rem)] w-full max-w-[calc(100vw-2rem)] shrink-0 flex-col overflow-hidden transform-gpu transition-all duration-300 ease-out md:max-w-[560px] ${centerCardScaleClass}`}
            >
              <div className="scrollbar-brand min-h-0 overflow-y-auto pr-1">
                <EntryDetailContent
                  ref={entryDetailContentRef}
                  entry={selectedEntry}
                  onEntriesUpdated={onEntriesUpdated}
                  onEntryUpdated={onEntryUpdated}
                  onUnauthorized={onUnauthorized}
                  headerActions={
                    <EntryFoldersMenu
                      open={entryFoldersOpen}
                      loading={entryFoldersLoading}
                      error={entryFoldersError}
                      folders={entryFolders}
                      updatingFolderId={updatingFolderId}
                      menuRef={entryFoldersMenuRef}
                      emptyLabel={t("storage.entryFoldersEmpty")}
                      loadingLabel={t("storage.entryFoldersLoading")}
                      menuAriaLabel={t("storage.entryFoldersMenuAria")}
                      toggleAriaLabel={t("storage.entryFoldersToggleAria")}
                      onToggle={openEntryFoldersMenu}
                      onFolderToggle={handleToggleEntryFolder}
                      toggleClassName={iconToggleClass(entryFoldersOpen)}
                      closeAction={
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-emerald-200/85 bg-[linear-gradient(180deg,rgba(240,253,244,0.94)_0%,rgba(209,250,229,0.86)_100%)] text-emerald-700 shadow-[0_10px_22px_rgba(15,23,42,0.06)] transition hover:border-emerald-300 hover:bg-emerald-50"
                          aria-label={t("storage.closeDetailAria")}
                          onClick={() => void closeSelectedEntry()}
                        >
                          <MotionIcon name="BookCheck" animation="bounce" className="h-5 w-5 text-emerald-700" />
                        </button>
                      }
                    />
                  }
                />
              </div>
            </div>

            {renderRelatedStack(rightRelatedEntries, "right", rightCardScaleClass, t("storage.relatedRight"))}
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
