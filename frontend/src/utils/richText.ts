import type { EntryFlag } from "../types/resource";

const RICH_TEXT_KIND = "funil-rich-text";
const RICH_TEXT_VERSION = 1;

type RichTextPayload = {
  kind: typeof RICH_TEXT_KIND;
  version: typeof RICH_TEXT_VERSION;
  html: string;
  text: string;
};

const URL_TEXT_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?[^\s<>"')]+\.[^\s<>"')]+/gi;
const LINK_HREF_PATTERN = /<a\b[^>]*\bhref=(["'])(.*?)\1/gi;

function isLikelyAbsoluteUrl(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function isLikelyDomainLike(value: string) {
  return /^(?:www\.|m\.)?[^\s/]+\.[^\s]+$/i.test(value);
}

function normalizeLinkCandidate(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  if (isLikelyAbsoluteUrl(candidate)) {
    return candidate;
  }

  if (candidate.startsWith("/") || candidate.startsWith("#") || candidate.startsWith("?")) {
    return null;
  }

  if (isLikelyDomainLike(candidate)) {
    return `https://${candidate}`;
  }

  return null;
}

function getCandidateHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string | null) {
  if (!hostname) {
    return false;
  }

  const currentHostname =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname.toLowerCase()
      : null;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === currentHostname;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type LegacyListBlock =
  | { kind: "bullet"; items: string[] }
  | { kind: "ordered"; items: string[] }
  | { kind: "checklist"; items: Array<{ checked: boolean; text: string }> };

function serializeLegacyListBlock(block: LegacyListBlock) {
  if (block.kind === "checklist") {
    return `<ol>${block.items
      .map((item) => `<li data-list="${item.checked ? "checked" : "unchecked"}"><span class="ql-ui" contenteditable="false"></span>${escapeHtml(item.text)}</li>`)
      .join("")}</ol>`;
  }

  return `<ol>${block.items
    .map((item) => `<li data-list="${block.kind}"><span class="ql-ui" contenteditable="false"></span>${escapeHtml(item)}</li>`)
    .join("")}</ol>`;
}

function toPlainEditorHtml(value: string) {
  if (!value) {
    return "";
  }

  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let currentList: LegacyListBlock | null = null;

  function flushCurrentList() {
    if (!currentList) {
      return;
    }
    blocks.push(serializeLegacyListBlock(currentList));
    currentList = null;
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushCurrentList();
      continue;
    }

    const checklistMatch = trimmed.match(/^- \[([ xX])\]\s+(.+)$/);
    if (checklistMatch) {
      if (!currentList || currentList.kind !== "checklist") {
        flushCurrentList();
        currentList = { kind: "checklist", items: [] };
      }
      currentList.items.push({
        checked: checklistMatch[1].toLowerCase() === "x",
        text: checklistMatch[2]
      });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.kind !== "bullet") {
        flushCurrentList();
        currentList = { kind: "bullet", items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      if (!currentList || currentList.kind !== "ordered") {
        flushCurrentList();
        currentList = { kind: "ordered", items: [] };
      }
      currentList.items.push(orderedMatch[1]);
      continue;
    }

    flushCurrentList();
    blocks.push(`<p>${escapeHtml(rawLine).replace(/\n/g, "<br />")}</p>`);
  }

  flushCurrentList();
  return blocks.join("");
}

export function supportsRichTextEntryFlag(flag: EntryFlag | null | undefined) {
  return !flag || flag !== "TABLE";
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

export function extractUrlsFromStoredText(value: string | null | undefined) {
  const payload = parseRichTextPayload(value);
  const urls = new Set<string>();

  if (payload?.html) {
    for (const match of payload.html.matchAll(LINK_HREF_PATTERN)) {
      const href = match[2]?.trim();
      if (href) {
        urls.add(href);
      }
    }
  }

  const plainText = payload?.text ?? value ?? "";
  for (const match of plainText.matchAll(URL_TEXT_PATTERN)) {
    const candidate = match[0]?.trim();
    if (candidate) {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

export function extractPrimaryLinkUrl(htmlValue: string | null | undefined, textValue: string | null | undefined) {
  const candidates: string[] = [];

  if (htmlValue) {
    for (const match of htmlValue.matchAll(LINK_HREF_PATTERN)) {
      const href = match[2]?.trim();
      const normalized = normalizeLinkCandidate(href);
      if (normalized) {
        candidates.push(normalized);
      }
    }
  }

  if (textValue) {
    for (const match of textValue.matchAll(URL_TEXT_PATTERN)) {
      const normalized = normalizeLinkCandidate(match[0]);
      if (normalized) {
        candidates.push(normalized);
      }
    }
  }

  const uniqueCandidates = Array.from(new Set(candidates));
  const externalCandidate = uniqueCandidates.find((candidate) => !isLocalHostname(getCandidateHostname(candidate)));
  if (externalCandidate) {
    return externalCandidate;
  }

  return uniqueCandidates[0] ?? null;
}

export function extractEditorHtmlFromStoredText(value: string | null | undefined) {
  const payload = parseRichTextPayload(value);
  if (payload) {
    return payload.html;
  }
  return toPlainEditorHtml(value ?? "");
}
