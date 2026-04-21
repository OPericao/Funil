import type { EntryFlag } from "../types/resource";

const RICH_TEXT_KIND = "funil-rich-text";
const RICH_TEXT_VERSION = 1;

type RichTextPayload = {
  kind: typeof RICH_TEXT_KIND;
  version: typeof RICH_TEXT_VERSION;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toPlainEditorHtml(value: string) {
  if (!value) {
    return "";
  }

  return `<p>${escapeHtml(value).replace(/\n/g, "<br />")}</p>`;
}

export function supportsRichTextEntryFlag(flag: EntryFlag | null | undefined) {
  return !flag || flag === "RAW";
}

export function serializeRichTextPayload(htmlValue: string | null | undefined, textValue: string | null | undefined) {
  const payload: RichTextPayload = {
    kind: RICH_TEXT_KIND,
    version: RICH_TEXT_VERSION,
    html: htmlValue?.trim() ?? "",
    text: textValue?.replace(/\r\n/g, "\n").replace(/\n$/, "").trim() ?? ""
  };

  return JSON.stringify(payload);
}

export function parseRichTextPayload(value: string | null | undefined): RichTextPayload | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<RichTextPayload>;
    if (parsed.kind !== RICH_TEXT_KIND || parsed.version !== RICH_TEXT_VERSION) {
      return null;
    }

    return {
      kind: RICH_TEXT_KIND,
      version: RICH_TEXT_VERSION,
      html: typeof parsed.html === "string" ? parsed.html : "",
      text: typeof parsed.text === "string" ? parsed.text : ""
    };
  } catch {
    return null;
  }
}

export function extractPlainTextFromStoredText(value: string | null | undefined) {
  const payload = parseRichTextPayload(value);
  if (payload) {
    return payload.text;
  }
  return value ?? "";
}

export function extractEditorHtmlFromStoredText(value: string | null | undefined) {
  const payload = parseRichTextPayload(value);
  if (payload) {
    return payload.html;
  }
  return toPlainEditorHtml(value ?? "");
}
