import type { Edge } from "@xyflow/react";
import type { EntryItem, EntryRelationshipItem, ResourceItem } from "../types/resource";
import { extractPlainTextFromStoredText } from "./richText";

type GraphEdgeData = {
  score: number;
  reasons: string[];
  relationshipId?: number;
  manual?: boolean;
};

type EntryGraphFeatures = {
  entry: EntryItem;
  tags: Set<string>;
  linkHosts: Set<string>;
  resourceTypes: Set<string>;
  tokens: Set<string>;
};

const COMMON_STOPWORDS = new Set([
  "para", "como", "este", "esta", "estos", "estas", "sobre", "desde", "hasta", "entre", "porque",
  "donde", "cuando", "notas", "nota", "link", "enlace", "entry", "with", "that", "this", "from",
  "into", "about", "http", "https", "www", "com", "org", "net", "the", "and", "pero", "tiene",
  "tener", "using", "used", "your", "una", "unas", "unos", "esto", "esas", "esos",
]);

function normalizeForGraph(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function tokenizeText(value: string) {
  return normalizeForGraph(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COMMON_STOPWORDS.has(token));
}

function buildEntryCorpus(entry: EntryItem) {
  const parts = [entry.title];
  for (const resource of entry.resources) {
    parts.push(
      resource.title ?? "",
      extractPlainTextFromStoredText(resource.textContent),
      resource.url ?? "",
      resource.siteName ?? "",
      resource.description ?? "",
      resource.contentPreview ?? "",
      resource.fileName ?? "",
      resource.mimeType ?? ""
    );
  }
  for (const tag of entry.tags ?? []) {
    parts.push(tag.name);
  }
  return parts.join(" ");
}

function extractHost(rawUrl: string | null | undefined) {
  if (!rawUrl) {
    return null;
  }

  try {
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function collectLinkHosts(resources: ResourceItem[]) {
  const hosts = new Set<string>();
  for (const resource of resources) {
    if (resource.type !== "LINK") {
      continue;
    }
    const host = extractHost(resource.url) ?? (resource.siteName ? normalizeForGraph(resource.siteName) : null);
    if (host) {
      hosts.add(host);
    }
  }
  return hosts;
}

function collectResourceTypes(resources: ResourceItem[]) {
  return new Set(resources.map((resource) => resource.type));
}

function toFeatures(entry: EntryItem): EntryGraphFeatures {
  return {
    entry,
    tags: new Set((entry.tags ?? []).map((tag) => normalizeForGraph(tag.name)).filter(Boolean)),
    linkHosts: collectLinkHosts(entry.resources),
    resourceTypes: collectResourceTypes(entry.resources),
    tokens: new Set(tokenizeText(buildEntryCorpus(entry)).slice(0, 40)),
  };
}

function intersection<T>(left: Set<T>, right: Set<T>) {
  const result: T[] = [];
  for (const value of left) {
    if (right.has(value)) {
      result.push(value);
    }
  }
  return result;
}

function buildRelation(featuresLeft: EntryGraphFeatures, featuresRight: EntryGraphFeatures) {
  const sharedTags = intersection(featuresLeft.tags, featuresRight.tags);
  const sharedHosts = intersection(featuresLeft.linkHosts, featuresRight.linkHosts);
  const sharedTypes = intersection(featuresLeft.resourceTypes, featuresRight.resourceTypes).filter((type) => type !== "RAW");
  const sharedTokens = intersection(featuresLeft.tokens, featuresRight.tokens);

  const smallerTokenSetSize = Math.max(1, Math.min(featuresLeft.tokens.size, featuresRight.tokens.size));
  const tokenOverlapRatio = sharedTokens.length / smallerTokenSetSize;

  let score = 0;
  const reasons: string[] = [];

  if (sharedTags.length > 0) {
    score += Math.min(0.56, 0.24 + sharedTags.length * 0.16);
    reasons.push(sharedTags.length === 1 ? `tag: ${sharedTags[0]}` : `${sharedTags.length} tags en comun`);
  }

  if (sharedHosts.length > 0) {
    score += Math.min(0.28, 0.18 + Math.max(0, sharedHosts.length - 1) * 0.05);
    reasons.push(sharedHosts.length === 1 ? `mismo dominio: ${sharedHosts[0]}` : `${sharedHosts.length} dominios compartidos`);
  }

  if (tokenOverlapRatio >= 0.16 && sharedTokens.length >= 2) {
    score += Math.min(0.26, tokenOverlapRatio * 0.6);
    reasons.push("contenido relacionado");
  }

  const leftFlag = featuresLeft.entry.flag ?? "RAW";
  const rightFlag = featuresRight.entry.flag ?? "RAW";
  if (leftFlag !== "RAW" && leftFlag === rightFlag) {
    score += 0.08;
    reasons.push(`misma categoria: ${leftFlag.toLowerCase()}`);
  }

  if (sharedTypes.length > 0) {
    score += Math.min(0.1, sharedTypes.length * 0.05);
  }

  return { score, reasons };
}

export function buildGraphFromEntries(entries: EntryItem[], manualRelationships: EntryRelationshipItem[]) {
  const features = entries.map(toFeatures);
  const candidateEdges: Edge<GraphEdgeData>[] = [];
  const edgeCountByNode = new Map<number, number>();

  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      const left = features[i];
      const right = features[j];
      const relation = buildRelation(left, right);

      if (relation.score < 0.24 || relation.reasons.length === 0) {
        continue;
      }

      candidateEdges.push({
        id: `e_${left.entry.id}_${right.entry.id}`,
        source: String(left.entry.id),
        target: String(right.entry.id),
        data: {
          score: relation.score,
          reasons: relation.reasons,
        },
      });
    }
  }

  candidateEdges.sort((left, right) => (right.data?.score ?? 0) - (left.data?.score ?? 0));

  const edges = candidateEdges.filter((edge) => {
    const sourceId = Number(edge.source);
    const targetId = Number(edge.target);
    const sourceCount = edgeCountByNode.get(sourceId) ?? 0;
    const targetCount = edgeCountByNode.get(targetId) ?? 0;
    const score = edge.data?.score ?? 0;

    const keep = score >= 0.64 || (sourceCount < 4 && targetCount < 4);
    if (!keep) {
      return false;
    }

    edgeCountByNode.set(sourceId, sourceCount + 1);
    edgeCountByNode.set(targetId, targetCount + 1);
    return true;
  });

  const edgeIds = new Set(edges.map((edge) => edge.id));

  for (const relationship of manualRelationships) {
    const edgeId = `manual_${relationship.id}`;
    if (edgeIds.has(edgeId)) {
      continue;
    }

    const sourceExists = entries.some((entry) => entry.id === relationship.sourceEntryId);
    const targetExists = entries.some((entry) => entry.id === relationship.targetEntryId);
    if (!sourceExists || !targetExists) {
      continue;
    }

    edges.push({
      id: edgeId,
      source: String(relationship.sourceEntryId),
      target: String(relationship.targetEntryId),
      sourceHandle: relationship.sourceHandle ?? undefined,
      targetHandle: relationship.targetHandle ?? undefined,
      data: {
        score: 1.15,
        reasons: ["relacion manual"],
        relationshipId: relationship.id,
        manual: true,
      },
    });
  }

  return { edges };
}

export function getRelatedEntryIds(
  currentEntryId: number,
  entries: EntryItem[],
  manualRelationships: EntryRelationshipItem[]
) {
  const { edges } = buildGraphFromEntries(entries, manualRelationships);
  const relatedIds = new Set<number>();

  for (const edge of edges) {
    const source = Number(edge.source);
    const target = Number(edge.target);

    if (source === currentEntryId) {
      relatedIds.add(target);
    }
    if (target === currentEntryId) {
      relatedIds.add(source);
    }
  }

  return relatedIds;
}
