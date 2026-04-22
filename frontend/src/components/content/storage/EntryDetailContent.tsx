import { ReactNode, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Editor } from "primereact/editor";
import { Panel } from "primereact/panel";
import { isApiError } from "../../../api/client";
import { createTextResource, updateEntryTitle, updateTextResource } from "../../../api/resources";
import { useI18n } from "../../../i18n/I18nProvider";
import type { EntryItem } from "../../../types/resource";
import { readErrorMessage } from "../../../utils/error";
import {
  extractEditorHtmlFromStoredText,
  extractPlainTextFromStoredText,
  extractUrlsFromStoredText,
  serializeRichTextPayload,
  supportsRichTextEntryFlag
} from "../../../utils/richText";
import { errorTextClass } from "../../ui/styles";
import {
  ArrowDownTrayIcon,
  TrashIcon,
  TwitchIcon,
  XMarkIcon
} from "../../ui/icons";
import { HeroVideoDialog } from "../../ui/HeroVideoDialog";
import { richTextEditorHeader } from "../richTextEditorHeader";

type EditableCsvTable = { delimiter: string; headers: string[]; rows: string[][] };

type EntryDetailContentProps = {
  entry: EntryItem;
  onEntriesUpdated: () => Promise<void> | void;
  onEntryUpdated?: (entryId: number) => Promise<void> | void;
  onUnauthorized: () => void;
  headerActions?: ReactNode;
};

export type EntryDetailContentHandle = {
  saveTextChanges: () => Promise<boolean>;
};

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

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
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


function buildDefaultEditableTable(): EditableCsvTable {
  return {
    delimiter: ",",
    headers: ["Col 1", "Col 2"],
    rows: [["", ""]]
  };
}

function parseEditableCsvTable(text: string): EditableCsvTable {
  const parsed = parseCsvTable(text);
  if (!parsed) {
    return buildDefaultEditableTable();
  }

  return {
    delimiter: detectCsvDelimiter(text),
    headers: parsed.headers.length > 0 ? parsed.headers : buildDefaultEditableTable().headers,
    rows: parsed.rows.length > 0 ? parsed.rows : [Array(parsed.headers.length).fill("")]
  };
}

function escapeCsvCell(value: string, delimiter: string): string {
  const normalized = value ?? "";
  if (normalized.includes("\"")) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  if (normalized.includes(delimiter) || normalized.includes("\n")) {
    return `"${normalized}"`;
  }
  return normalized;
}

function serializeEditableCsvTable(table: EditableCsvTable): string {
  const delimiter = table.delimiter || ",";
  const width = Math.max(1, table.headers.length, ...table.rows.map((row) => row.length));
  const headers = [...table.headers, ...Array(Math.max(0, width - table.headers.length)).fill("")].slice(0, width);
  const rows = table.rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")].slice(0, width));

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter))
    .join("\n");
}

function buildEntryText(entry: EntryItem, emptyText: string) {
  if (entry.flag === "TABLE") {
    const tableResource = entry.resources.find((resource) => resource.type === "RAW");
    const table = parseCsvTable(extractPlainTextFromStoredText(tableResource?.textContent).trim());
    return table ? `${table.rows.length} filas Â· ${table.headers.length} columnas` : "Tabla";
  }

  const textResources = entry.resources
    .filter((resource) => resource.type === "RAW")
    .map((resource) => extractPlainTextFromStoredText(resource.textContent).trim())
    .filter(Boolean);

  if (textResources.length > 0) {
    return textResources.join(" ");
  }

  for (const resource of entry.resources) {
    const preview =
      extractPlainTextFromStoredText(resource.textContent)
      ?? resource.description
      ?? resource.contentPreview
      ?? resource.url
      ?? resource.fileName
      ?? resource.title
      ?? resource.siteName;
    if (preview) {
      return preview;
    }
  }

  return emptyText;
}

function getEntryLinks(entry: EntryItem) {
  return entry.resources
    .filter((resource) => resource.type === "LINK" && Boolean(resource.url))
    .map((resource) => ({
      id: resource.id,
      title: resource.title?.trim() || resource.siteName?.trim() || resource.url!,
      url: resource.url!,
      description: resource.description?.trim() || resource.contentPreview?.trim() || null,
      siteName: resource.siteName?.trim() || null
    }));
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

    if (resource.type === "RAW" && resource.textContent) {
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

function resolveMediaUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/api/uploads/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/uploads/")) {
    return `/api${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  if (trimmed.startsWith("uploads/")) {
    return `/api/${trimmed}`;
  }
  return `/${trimmed}`;
}

function getEntryMedia(entry: EntryItem) {
  return entry.resources
    .filter((resource) => resource.type === "MEDIA")
    .map((resource) => ({
      id: resource.id,
      title: resource.title?.trim() || resource.fileName || "Archivo",
      fileName: resource.fileName || "archivo",
      mimeType: resource.mimeType || "",
      url: resolveMediaUrl(resource.storageKey)
    }))
    .filter((media) => Boolean(media.url));
}

export const EntryDetailContent = forwardRef<EntryDetailContentHandle, EntryDetailContentProps>(function EntryDetailContent({
  entry,
  onEntriesUpdated,
  onEntryUpdated,
  onUnauthorized,
  headerActions
}, ref) {
  const { t } = useI18n();
  const [titleDraft, setTitleDraft] = useState(entry.title);
  const [textDraft, setTextDraft] = useState("");
  const [textHtmlDraft, setTextHtmlDraft] = useState("");
  const [tableDraft, setTableDraft] = useState<EditableCsvTable>(buildDefaultEditableTable());
  const [savingField, setSavingField] = useState<"title" | "text" | null>(null);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  const [detailSaveSuccess, setDetailSaveSuccess] = useState<string | null>(null);
  const pendingTextSaveRef = useRef<Promise<boolean> | null>(null);

  const selectedEntryLinks = useMemo(() => getEntryLinks(entry), [entry]);
  const selectedEntryYoutubeVideos = useMemo(() => getEntryYoutubeVideos(entry), [entry]);
  const selectedEntryTwitchVideos = useMemo(() => getEntryTwitchVideos(entry), [entry]);
  const selectedEntryOtherLinks = useMemo(
    () => selectedEntryLinks.filter((link) => !extractYoutubeVideoId(link.url) && !parseTwitchVideoPreview(link.url)),
    [selectedEntryLinks]
  );
  const selectedEntryMedia = useMemo(() => getEntryMedia(entry), [entry]);

  const selectedTextResource = useMemo(
    () => entry.resources.find((resource) => resource.type === "RAW") ?? null,
    [entry]
  );
  const selectedCsvTable = useMemo(() => {
    if (entry.flag !== "TABLE") {
      return null;
    }
    const rawText = extractPlainTextFromStoredText(selectedTextResource?.textContent).trim();
    if (!rawText) {
      return null;
    }
    return parseCsvTable(rawText);
  }, [entry.flag, selectedTextResource]);
  const selectedTextHtml = useMemo(() => {
    const html = extractEditorHtmlFromStoredText(selectedTextResource?.textContent).trim();
    return html.length > 0 ? html : null;
  }, [selectedTextResource]);

  useEffect(() => {
    const baseStoredText = selectedTextResource?.textContent ?? "";
    const baseText = extractPlainTextFromStoredText(baseStoredText);
    setTitleDraft(entry.title);
    setTextDraft(baseText);
    setTextHtmlDraft(extractEditorHtmlFromStoredText(baseStoredText));
    setTableDraft(parseEditableCsvTable(baseText));
    setDetailSaveError(null);
    setDetailSaveSuccess(null);
  }, [entry, selectedTextResource]);

  function clearTextFeedback() {
    if (detailSaveError) {
      setDetailSaveError(null);
    }
    if (detailSaveSuccess) {
      setDetailSaveSuccess(null);
    }
  }

  function updateTableHeader(index: number, value: string) {
    setTableDraft((current) => ({
      ...current,
      headers: current.headers.map((header, headerIndex) => (headerIndex === index ? value : header))
    }));
    clearTextFeedback();
  }

  function updateTableCell(rowIndex: number, cellIndex: number, value: string) {
    setTableDraft((current) => ({
      ...current,
      rows: current.rows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? row.map((cell, currentCellIndex) => (currentCellIndex === cellIndex ? value : cell)) : row
      )
    }));
    clearTextFeedback();
  }


  async function saveTextChanges() {
    if (pendingTextSaveRef.current) {
      return pendingTextSaveRef.current;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setDetailSaveError(t("inbox.titleRequired"));
      return false;
    }

    const titleChanged = nextTitle !== entry.title;
    const nextStoredText = (() => {
      if (entry.flag === "TABLE") {
        return serializeEditableCsvTable(tableDraft).trim();
      }
      return supportsRichTextEntryFlag(entry.flag)
        ? serializeRichTextPayload(textHtmlDraft, textDraft)
        : textDraft.trim();
    })();
    const currentStoredText = selectedTextResource?.textContent ?? "";
    const textChanged = selectedTextResource
      ? nextStoredText !== currentStoredText
      : nextStoredText.length > 0;

    if (!titleChanged && !textChanged) {
      return true;
    }

    const savePromise = (async () => {
      try {
        setSavingField("text");
        setDetailSaveError(null);
        setDetailSaveSuccess(null);

        if (titleChanged) {
          await updateEntryTitle(entry.id, nextTitle);
        }

        if (textChanged) {
          if (selectedTextResource) {
            await updateTextResource(entry.id, selectedTextResource.id, {
              title: selectedTextResource.title ?? undefined,
              textContent: nextStoredText
            });
          } else {
            await createTextResource(entry.id, {
              textContent: nextStoredText
            });
          }
        }

        if (onEntryUpdated) {
          await onEntryUpdated(entry.id);
        } else {
          void Promise.resolve(onEntriesUpdated()).catch(() => undefined);
        }
        setDetailSaveSuccess(t("storage.detailSaved"));
        return true;
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return false;
        }
        setDetailSaveError(readErrorMessage(requestError, t("common.unexpectedError")));
        return false;
      } finally {
        setSavingField(null);
        pendingTextSaveRef.current = null;
      }
    })();

    pendingTextSaveRef.current = savePromise;
    return savePromise;
  }

  useImperativeHandle(ref, () => ({
    saveTextChanges
  }), [saveTextChanges]);

  return (
    <div className="grid gap-3">
      <Panel
        header={
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={titleDraft}
              onChange={(event) => {
                setTitleDraft(event.target.value);
                if (detailSaveError) {
                  setDetailSaveError(null);
                }
                if (detailSaveSuccess) {
                  setDetailSaveSuccess(null);
                }
              }}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-base font-semibold text-ink-900 shadow-none outline-none ring-0 placeholder:text-ink-500 focus:border-0 focus:outline-none focus:ring-0 sm:text-lg"
              aria-label={t("storage.detailEntryTitle")}
              disabled={savingField !== null}
            />
            {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
          </div>
        }
        className="notes-panel"
      >
        <div className="grid gap-4">
          <div className="min-w-0 w-full overflow-hidden">
            {true ? (
              <div className="grid gap-2">
                {entry.flag === "TABLE" ? (
                  <div className="scrollbar-brand grid max-h-72 gap-3 overflow-y-auto pr-1">
                    <div className="scrollbar-brand max-w-full overflow-x-auto overflow-y-auto rounded-control border border-brand-200">
                      <table className="w-max min-w-full border-collapse text-sm">
                        <thead className="bg-brand-50">
                          <tr>
                            {tableDraft.headers.map((header, index) => (
                              <th key={`table-edit-h-${index}`} className="border-b border-brand-200 px-2 py-2 align-top">
                                <div className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="text"
                                    value={header}
                                    onChange={(event) => updateTableHeader(index, event.target.value)}
                                    className="w-[8rem] min-w-[8rem] max-w-[10rem] rounded-control border border-brand-200 bg-white px-2 py-1 text-sm text-ink-800 outline-none focus:border-brand-500"
                                    disabled={savingField === "text"}
                                  />
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-200 text-brand-700 transition hover:bg-brand-100"
                                    onClick={() => {
                                      setTableDraft((current) => {
                                        if (current.headers.length <= 1) {
                                          return current;
                                        }
                                        return {
                                          ...current,
                                          headers: current.headers.filter((_, headerIndex) => headerIndex !== index),
                                          rows: current.rows.map((row) => row.filter((_, cellIndex) => cellIndex !== index))
                                        };
                                      });
                                      clearTextFeedback();
                                    }}
                                    disabled={savingField === "text" || tableDraft.headers.length <= 1}
                                  >
                                    <XMarkIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableDraft.rows.map((row, rowIndex) => (
                            <tr key={`table-edit-row-${rowIndex}`} className="odd:bg-white/25 even:bg-brand-50/40">
                              {row.map((cell, cellIndex) => (
                                <td key={`table-edit-cell-${rowIndex}-${cellIndex}`} className="border-b border-brand-100 px-2 py-2">
                                  <input
                                    type="text"
                                    value={cell}
                                    onChange={(event) => updateTableCell(rowIndex, cellIndex, event.target.value)}
                                    className="w-[8rem] min-w-[8rem] max-w-[10rem] rounded-control border border-brand-200 bg-white px-2 py-1 text-sm text-ink-800 outline-none focus:border-brand-500"
                                    disabled={savingField === "text"}
                                  />
                                </td>
                              ))}
                              <td className="border-b border-brand-100 px-2 py-2">
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-200 text-brand-700 transition hover:bg-brand-100"
                                  onClick={() => {
                                    setTableDraft((current) => ({
                                      ...current,
                                      rows: current.rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex)
                                    }));
                                    clearTextFeedback();
                                  }}
                                  disabled={savingField === "text"}
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-control border border-brand-200 bg-white/25 px-3 text-sm font-semibold text-ink-700 transition hover:bg-brand-50"
                        onClick={() => {
                          setTableDraft((current) => ({
                            ...current,
                            headers: [...current.headers, `Col ${current.headers.length + 1}`],
                            rows: current.rows.map((row) => [...row, ""])
                          }));
                          clearTextFeedback();
                        }}
                        disabled={savingField === "text"}
                      >
                        Anadir columna
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-control border border-brand-200 bg-white/25 px-3 text-sm font-semibold text-ink-700 transition hover:bg-brand-50"
                        onClick={() => {
                          setTableDraft((current) => ({
                            ...current,
                            rows: [...current.rows, Array(Math.max(1, current.headers.length)).fill("")]
                          }));
                          clearTextFeedback();
                        }}
                        disabled={savingField === "text"}
                      >
                        Anadir fila
                      </button>
                    </div>
                  </div>
                ) : (
                  <Editor
                    readOnly={savingField === "text"}
                    showHeader
                    placeholder={t("storage.detailDescription")}
                    headerTemplate={richTextEditorHeader}
                    value={textHtmlDraft || extractEditorHtmlFromStoredText(textDraft)}
                    className="w-full title-input-editor"
                    style={{ height: "240px" }}
                    onTextChange={(event) => {
                      setTextDraft(event.htmlValue ? event.textValue.replace(/\r\n/g, "\n").replace(/\n$/, "") : "");
                      setTextHtmlDraft(event.htmlValue ?? "");
                      clearTextFeedback();
                    }}
                  />
                )}
              </div>
            ) : (
              <>
                {entry.flag === "TABLE" && selectedCsvTable ? (
                  <div className="scrollbar-brand mt-2 max-w-full overflow-x-auto overflow-y-auto rounded-control border border-brand-200">
                    <table className="w-max min-w-full border-collapse text-sm">
                      <thead className="bg-brand-50">
                        <tr>
                          {selectedCsvTable!.headers.map((header, index) => (
                            <th
                              key={`csv-h-${index}`}
                              className="max-w-[10rem] border-b border-brand-200 px-3 py-2 text-left font-semibold text-ink-800"
                            >
                              <span className="block max-w-[10rem] break-words whitespace-pre-wrap">
                                {header || `Col ${index + 1}`}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCsvTable!.rows.map((row, rowIndex) => (
                          <tr key={`csv-r-${rowIndex}`} className="odd:bg-white/25 even:bg-brand-50/40">
                            {row.map((cell, cellIndex) => (
                              <td
                                key={`csv-c-${rowIndex}-${cellIndex}`}
                                className="max-w-[10rem] border-b border-brand-100 px-3 py-2 text-ink-700"
                              >
                                <span className="block max-w-[10rem] break-words whitespace-pre-wrap">
                                  {cell}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  selectedTextHtml ? (
                    <div className="rich-text-display ql-snow mt-2 rounded-control border border-brand-200 bg-white/70 px-3 py-2.5 text-sm text-ink-700">
                      <div className="ql-editor" dangerouslySetInnerHTML={{ __html: selectedTextHtml ?? "" }} />
                    </div>
                  ) : (
                    <p className="break-all whitespace-pre-wrap text-sm text-ink-700">
                      {buildEntryText(entry, t("entries.noContent"))}
                    </p>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </Panel>

      {selectedEntryMedia.length > 0 && (
        <article className="p-3" style={{
          background: "rgba(255, 255, 255, 0.77)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t("storage.detailAttachments")}
          </p>
          <div className="mt-2 grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1">
            {selectedEntryMedia.map((media) => {
              const mime = media.mimeType.toLowerCase();
              const isImage = mime.startsWith("image/");
              const isVideo = mime.startsWith("video/");
              const isAudio = mime.startsWith("audio/");
              const isPdf = mime === "application/pdf";
              const downloadName = media.fileName || "archivo";

              return (
                <div key={media.id} className="relative rounded-control border border-brand-200 bg-brand-50 p-2">
                  <a
                    href={media.url!}
                    download={downloadName}
                    aria-label={`Descargar ${downloadName}`}
                    title="Descargar"
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-300 bg-white/25 text-brand-700 shadow-sm transition hover:bg-brand-100"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </a>
                  <p className="mb-1 truncate text-xs font-semibold text-ink-800">{media.title}</p>

                  {isImage && (
                    <img
                      src={media.url!}
                      alt={media.fileName}
                      className="h-24 w-full rounded border border-brand-200 object-cover"
                    />
                  )}
                  {isVideo && (
                    <video src={media.url!} controls className="h-24 w-full rounded border border-brand-200 object-cover" />
                  )}
                  {isAudio && <audio src={media.url!} controls className="w-full" />}
                  {isPdf && (
                    <iframe src={media.url!} title={media.fileName} className="h-32 w-full rounded border border-brand-200" />
                  )}
                  {!isImage && !isVideo && !isAudio && !isPdf && (
                    <a
                      href={media.url!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center rounded-control border border-brand-300 bg-white/25 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    >
                      {media.fileName}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      )}

      {selectedEntryYoutubeVideos.length > 0 && (
        <article className="p-3" style={{
          background: "rgba(255, 255, 255, 0.77)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t("storage.youtubeVideos")}
          </p>
          <div className="scrollbar-brand mt-2 grid max-h-96 gap-3 overflow-y-auto pr-1">
            {selectedEntryYoutubeVideos.map((video) => (
              <div key={`${video.id}-${video.videoId}`} className="grid gap-2">
                {(() => {
                  const badge = getYouTubeTypeBadgeConfig(video.isShort);
                  return <span className={badge.className}>{badge.label}</span>;
                })()}

                <div className={video.isShort ? "flex justify-center" : ""}>
                  <div className={video.isShort ? "w-full max-w-[180px]" : "w-full max-w-[320px]"}>
                    <HeroVideoDialog
                      animationStyle="from-center"
                      videoSrc={video.embedUrl}
                      thumbnailSrc={getYoutubeThumbnail(video.videoId)}
                      thumbnailAlt={video.title}
                      title={video.title}
                      aspectRatio={video.isShort ? "short" : "video"}
                    />
                  </div>
                </div>

                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
                  onClick={(event) => event.stopPropagation()}
                >
                  {video.title}
                </a>
              </div>
            ))}
          </div>
        </article>
      )}

      {selectedEntryTwitchVideos.length > 0 && (
        <article className="p-3" style={{
          background: "rgba(255, 255, 255, 0.77)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t("storage.twitchVideos")}
          </p>
          <div className="scrollbar-brand mt-2 grid max-h-96 gap-3 overflow-y-auto pr-1">
            {selectedEntryTwitchVideos.map((video) => (
              <div key={`${video.id}-${video.embedUrl}`} className="grid gap-2">
                {(() => {
                  const badge = getTwitchVariantBadgeConfig(video.variant);
                  return <span className={badge.className}>{t(badge.labelKey)}</span>;
                })()}

                <div className="w-full max-w-[320px]">
                  <HeroVideoDialog
                    animationStyle="from-center"
                    videoSrc={video.embedUrl}
                    title={video.title}
                    aspectRatio="video"
                    triggerContent={
                      <div
                        className={`relative aspect-video overflow-hidden rounded-control border ${
                          video.variant === "live"
                            ? "border-rose-200 bg-rose-50"
                            : video.variant === "vod"
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

                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-800"
                  onClick={(event) => event.stopPropagation()}
                >
                  {video.title}
                </a>
              </div>
            ))}
          </div>
        </article>
      )}

      {selectedEntryOtherLinks.length > 0 && (
        <article className="p-3" style={{
          background: "rgba(255, 255, 255, 0.77)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t("storage.detailLinks")}
          </p>
          <div className="mt-2 grid gap-2">
            {selectedEntryOtherLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
              >
                {link.title}
              </a>
            ))}
          </div>
        </article>
      )}

      {(entry.processingCategory || entry.keyIdeas.length > 0 || entry.actions.length > 0) && (
        <article className="p-3" style={{
          background: "rgba(255, 255, 255, 0.77)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Procesado
          </p>
          {entry.processingCategory ? (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-sm font-semibold text-violet-800 shadow-sm">
                {entry.processingCategory}
              </span>
            </div>
          ) : null}
          {entry.keyIdeas.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Ideas clave</p>
              <div className="mt-2 grid gap-2">
                {entry.keyIdeas.map((idea) => (
                  <p key={idea} className="rounded-control bg-violet-50 px-3 py-2 text-sm text-ink-800">
                    {idea}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {entry.actions.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Acciones</p>
              <div className="mt-2 grid gap-2">
                {entry.actions.map((action) => (
                  <p key={action} className="rounded-control bg-rose-50 px-3 py-2 text-sm text-ink-800">
                    {action}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <article className="p-3" style={{
          background: "rgba(255, 255, 255, 0.77)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.3)"
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t("storage.tags")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full bg-brand-500 px-2.5 py-1 text-sm font-semibold text-white shadow-sm"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        </article>
      )}

      {detailSaveError && <p className={errorTextClass}>{t("common.errorPrefix", { message: detailSaveError })}</p>}
      {detailSaveSuccess && (
        <p className="text-sm font-semibold text-emerald-600">{detailSaveSuccess}</p>
      )}
    </div>
  );
});
