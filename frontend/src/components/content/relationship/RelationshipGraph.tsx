import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Background,
  BaseEdge,
  Connection,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type OnConnect,
  type ReactFlowInstance,
  getBezierPath,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  createEntryRelationship,
  deleteEntryRelationship,
  fetchEntries,
  fetchEntryRelationships,
} from "../../../api/resources";
import type { EntryItem, EntryRelationshipItem, ResourceItem } from "../../../types/resource";
import { extractPlainTextFromStoredText } from "../../../utils/richText";
import { EntryDetailContent } from "../storage/EntryDetailContent";

type GraphNodeData = {
  label: string;
  entryId: number;
  tags: string[];
  subtitle: string;
  strength: number;
};

type GraphEdgeData = {
  score: number;
  reasons: string[];
  relationshipId?: number;
  manual?: boolean;
  onDelete?: (relationshipId: number) => void;
};

type EntryGraphFeatures = {
  entry: EntryItem;
  tags: Set<string>;
  linkHosts: Set<string>;
  resourceTypes: Set<string>;
  tokens: Set<string>;
};

function isChecklistResource(resource: ResourceItem) {
  const label = `${resource.title ?? ""} ${resource.fileName ?? ""}`.toLowerCase();
  return label.includes("checklist") || label.includes("todo") || label.includes("task");
}

function buildRelationshipEntryText(entry: EntryItem) {
  const textResources = entry.resources
    .filter((resource) => resource.type === "RAW" && !isChecklistResource(resource))
    .map((resource) => extractPlainTextFromStoredText(resource.textContent).trim())
    .filter(Boolean);

  if (textResources.length > 0) {
    return textResources.join("\n\n");
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

  return "Sin contenido";
}

const HANDLE_STYLE: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
  border: "2px solid #ffffff",
  background: "#0f766e",
  boxShadow: "0 0 0 2px rgba(15,118,110,0.14)",
};

const COMMON_STOPWORDS = new Set([
  "para", "como", "este", "esta", "estos", "estas", "sobre", "desde", "hasta", "entre", "porque",
  "donde", "cuando", "notas", "nota", "link", "enlace", "entry", "with", "that", "this", "from",
  "into", "about", "http", "https", "www", "com", "org", "net", "the", "and", "pero", "tiene",
  "tener", "using", "used", "your", "una", "unas", "unos", "esto", "esas", "esos",
]);

function RelationshipNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div
      className={`relative min-w-[220px] max-w-[260px] rounded-[24px] px-4 py-3 text-left ${
        selected ? "ring-2 ring-teal-300" : ""
      }`}
    >
      {/* TOP */}
      <Handle id="top" type="source" position={Position.Top} style={{ ...HANDLE_STYLE, top: -6, zIndex: 2 }} />
      <Handle id="top" type="target" position={Position.Top} style={{ ...HANDLE_STYLE, top: -6, zIndex: 1, opacity: 0 }} />

      {/* RIGHT */}
      <Handle id="right" type="source" position={Position.Right} style={{ ...HANDLE_STYLE, right: -6, zIndex: 2 }} />
      <Handle id="right" type="target" position={Position.Right} style={{ ...HANDLE_STYLE, right: -6, zIndex: 1, opacity: 0 }} />

      {/* BOTTOM */}
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ ...HANDLE_STYLE, bottom: -6, zIndex: 2 }} />
      <Handle id="bottom" type="target" position={Position.Bottom} style={{ ...HANDLE_STYLE, bottom: -6, zIndex: 1, opacity: 0 }} />

      {/* LEFT */}
      <Handle id="left" type="source" position={Position.Left} style={{ ...HANDLE_STYLE, left: -6, zIndex: 2 }} />
      <Handle id="left" type="target" position={Position.Left} style={{ ...HANDLE_STYLE, left: -6, zIndex: 1, opacity: 0 }} />

      <div className="pointer-events-none">
        <p className="line-clamp-2 break-words text-sm font-extrabold leading-snug text-slate-900">{data.label}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{data.subtitle}</p>
        {data.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ManualRelationshipEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps<Edge<GraphEdgeData>>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const buttonX = sourceX + (targetX - sourceX) * 0.82;
  const buttonY = sourceY + (targetY - sourceY) * 0.82;

  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      {data?.relationshipId && data.onDelete ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${buttonX}px, ${buttonY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold leading-none text-slate-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              aria-label="Eliminar relacion"
              title="Eliminar relacion"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (data.relationshipId !== undefined) {
                  data.onDelete?.(data.relationshipId);
                }
              }}
            >
              x
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

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

export function buildGraphFromEntries(entries: EntryItem[], manualRelationships: EntryRelationshipItem[] = []) {
  const features = entries.map(toFeatures);
  const nodeStrength = new Map<number, number>();
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
        label: relation.reasons[0],
        style: {
          stroke: relation.score >= 0.65 ? "#0f766e" : relation.score >= 0.45 ? "#0f766e99" : "#94a3b8",
          strokeWidth: relation.score >= 0.65 ? 3.2 : relation.score >= 0.45 ? 2.4 : 1.5,
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
    nodeStrength.set(sourceId, (nodeStrength.get(sourceId) ?? 0) + score);
    nodeStrength.set(targetId, (nodeStrength.get(targetId) ?? 0) + score);
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

    const score = 1.15;
    nodeStrength.set(relationship.sourceEntryId, (nodeStrength.get(relationship.sourceEntryId) ?? 0) + score);
    nodeStrength.set(relationship.targetEntryId, (nodeStrength.get(relationship.targetEntryId) ?? 0) + score);
    edges.push({
      id: edgeId,
      source: String(relationship.sourceEntryId),
      target: String(relationship.targetEntryId),
      sourceHandle: relationship.sourceHandle ?? undefined,
      targetHandle: relationship.targetHandle ?? undefined,
      type: "manualRelationship",
      data: {
        score,
        reasons: ["relacion manual"],
        relationshipId: relationship.id,
        manual: true,
      },
      label: "relacion manual",
      style: {
        stroke: "#0f172a",
        strokeWidth: 3.4,
      },
    });
  }

  const nodes: Node<GraphNodeData>[] = features.map(({ entry, tags, linkHosts }) => {
    const strength = nodeStrength.get(entry.id) ?? 0;
    const tagList = [...tags];
    const hostList = [...linkHosts];
    const subtitle =
      tagList.slice(0, 2).join(" · ")
      || hostList[0]
      || (entry.flag && entry.flag !== "RAW" ? entry.flag.toLowerCase() : "nota");

    const nodeStyle: CSSProperties = {
      borderRadius: 24,
      border: strength >= 1.2 ? "2px solid #0f766e" : "1px solid rgba(15, 23, 42, 0.12)",
      background: strength >= 1.2
        ? "linear-gradient(135deg, rgba(204, 251, 241, 0.95), rgba(255,255,255,0.96))"
        : "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))",
      color: "#0f172a",
      boxShadow: strength >= 1.2 ? "0 18px 45px rgba(15,118,110,0.15)" : "0 12px 30px rgba(15,23,42,0.08)",
      minWidth: 220,
      maxWidth: 260,
      padding: "14px 16px",
    };

    return {
      id: String(entry.id),
      type: "relationshipNode",
      position: { x: 0, y: 0 },
      data: {
        label: entry.title || `Entry #${entry.id}`,
        entryId: entry.id,
        tags: tagList,
        subtitle,
        strength,
      },
      style: nodeStyle,
    };
  });

  const rootNode = [...nodes].sort((left, right) => (right.data.strength ?? 0) - (left.data.strength ?? 0))[0] ?? null;
  return { nodes, edges, rootId: rootNode?.id ?? null };
}

export function getRelatedEntryIds(
  currentEntryId: number,
  entries: EntryItem[],
  manualRelationships: EntryRelationshipItem[] = []
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

function buildAdjacency(edges: Edge[]) {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
  }
  return adjacency;
}

function layoutBfsRings(nodes: Node<GraphNodeData>[], edges: Edge[], rootId: string | null, radiusStep = 240) {
  if (!rootId) {
    return nodes;
  }

  const adjacency = buildAdjacency(edges);
  const level = new Map<string, number>();
  const queue: string[] = [rootId];
  level.set(rootId, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = level.get(current)!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (level.has(neighbor)) {
        continue;
      }
      level.set(neighbor, currentLevel + 1);
      queue.push(neighbor);
    }
  }

  const maxLevel = Math.max(0, ...level.values());
  for (const node of nodes) {
    if (!level.has(node.id)) {
      level.set(node.id, maxLevel + 1);
    }
  }

  const groups = new Map<number, string[]>();
  for (const [id, currentLevel] of level.entries()) {
    groups.set(currentLevel, [...(groups.get(currentLevel) ?? []), id]);
  }

  return nodes.map((node) => ({ ...node })).map((node) => {
    const currentLevel = level.get(node.id) ?? maxLevel + 1;
    const ids = groups.get(currentLevel) ?? [node.id];

    if (currentLevel === 0) {
      return { ...node, position: { x: 0, y: 0 } };
    }

    const index = ids.indexOf(node.id);
    const step = (2 * Math.PI) / Math.max(1, ids.length);
    const radius = currentLevel * radiusStep;
    const angle = index * step - Math.PI / 2;
    return {
      ...node,
      position: {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      },
    };
  });
}

export function RelationshipGraph() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [manualRelationships, setManualRelationships] = useState<EntryRelationshipItem[]>([]);
  const [rf, setRf] = useState<ReactFlowInstance<Node<GraphNodeData>, Edge<GraphEdgeData>> | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  const nodeTypes = useMemo(() => ({ relationshipNode: RelationshipNode }), []);
  const handleDeleteManualRelationship = useCallback((relationshipId: number) => {
    void (async () => {
      try {
        await deleteEntryRelationship(relationshipId);
        setManualRelationships((current) => current.filter((relationship) => relationship.id !== relationshipId));
      } catch (error) {
        console.error("Failed to delete manual relationship", error);
      }
    })();
  }, []);
  const edgeTypes = useMemo(() => ({ manualRelationship: ManualRelationshipEdge }), []);
  const refreshEntries = useCallback(async () => {
    const entriesData = await fetchEntries();
    setEntries(entriesData);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [entriesData, relationshipsData] = await Promise.all([
          fetchEntries(),
          fetchEntryRelationships(),
        ]);
        if (!cancelled) {
          setEntries(entriesData);
          setManualRelationships(relationshipsData);
        }
      } catch {
        if (!cancelled) {
          setLoadError("No se pudieron cargar las relaciones.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const { baseNodes, baseEdges } = useMemo(() => {
    const { nodes, edges, rootId } = buildGraphFromEntries(entries, manualRelationships);
    return {
      baseNodes: layoutBfsRings(nodes, edges, rootId, 240),
      baseEdges: edges,
    };
  }, [entries, manualRelationships]);

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  useEffect(() => {
    setNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));
      return baseNodes.map((node) => {
        const existing = currentById.get(node.id);
        if (!existing) {
          return node;
        }
        return {
          ...node,
          position: existing.position,
          selected: existing.selected,
          dragging: existing.dragging,
        };
      });
    });

    setEdges(
      baseEdges.map((edge) =>
        edge.data?.manual && edge.data.relationshipId
          ? {
              ...edge,
              data: {
                ...edge.data,
                onDelete: handleDeleteManualRelationship,
              },
            }
          : edge
      )
    );
  }, [baseEdges, baseNodes, handleDeleteManualRelationship, setEdges, setNodes]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (!rf) {
        return;
      }
      rf.fitView({ nodes: [node], padding: 0.8, duration: 320 });
      const entryId = (node.data as GraphNodeData | undefined)?.entryId;
      if (entryId) {
        setSelectedEntryId(entryId);
      }
    },
    [rf]
  );

  const selectedEntry = useMemo(
    () => (selectedEntryId === null ? null : entries.find((entry) => entry.id === selectedEntryId) ?? null),
    [entries, selectedEntryId]
  );

  useEffect(() => {
    if (!rf || nodes.length === 0) {
      return;
    }
    rf.fitView({ padding: 0.24, duration: 320 });
  }, [nodes.length, rf]);

  const onConnect = useCallback<OnConnect>(
    async (connection: Connection) => {
      const source = connection.source ? Number(connection.source) : null;
      const target = connection.target ? Number(connection.target) : null;
      if (!source || !target || source === target) {
        return;
      }

      const existing = manualRelationships.find(
        (relationship) => relationship.sourceEntryId === source && relationship.targetEntryId === target
      );
      if (existing) {
        return;
      }

      try {
        const created = await createEntryRelationship(
          source,
          target,
          connection.sourceHandle ?? null,
          connection.targetHandle ?? null
        );
        setManualRelationships((current) => [...current, created]);
      } catch (error) {
        console.error("Failed to create manual relationship", error);
      }
    },
    [manualRelationships]
  );

  const handleEdgesDelete = useCallback(
    async (edgesToDelete: Edge<GraphEdgeData>[]) => {
      const manualEdges = edgesToDelete.filter((edge) => edge.data?.manual && edge.data.relationshipId);
      if (manualEdges.length === 0) {
        return;
      }

      const idsToDelete = new Set(manualEdges.map((edge) => edge.data!.relationshipId!));
      try {
        await Promise.all([...idsToDelete].map((relationshipId) => deleteEntryRelationship(relationshipId)));
        setManualRelationships((current) =>
          current.filter((relationship) => !idsToDelete.has(relationship.id))
        );
      } catch (error) {
        console.error("Failed to delete manual relationships", error);
      }
    },
    []
  );

  return (
    <div className="relative h-[calc(100vh-220px)] w-full overflow-hidden rounded-2xl border border-white/40 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.16),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.9),_rgba(248,250,252,0.92))] backdrop-blur">
      {loading ? (
        <div className="grid h-full place-items-center">
          <p className="text-sm font-semibold text-ink-700">Cargando grafo...</p>
        </div>
      ) : loadError ? (
        <div className="grid h-full place-items-center">
          <p className="text-sm font-semibold text-rose-700">{loadError}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="grid h-full place-items-center">
          <p className="text-sm font-semibold text-ink-700">Aun no tienes notas.</p>
        </div>
      ) : (
        <ReactFlow<Node<GraphNodeData>, Edge<GraphEdgeData>>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={setRf}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onConnect={onConnect}
          onEdgesDelete={(deletedEdges) => void handleEdgesDelete(deletedEdges)}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{ stroke: "#0f766e", strokeWidth: 2.5 }}
          deleteKeyCode={["Backspace", "Delete"]}
          nodesConnectable
          elementsSelectable
          fitView
          panOnScroll
          zoomOnScroll
          defaultEdgeOptions={{
            animated: false,
            style: { strokeLinecap: "round" },
          }}
        >
          <Background color="#cbd5e1" gap={24} size={1.2} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => ((node.data as GraphNodeData).strength ?? 0) >= 1.2 ? "#0f766e" : "#94a3b8"}
          />
        </ReactFlow>
      )}

      {selectedEntry ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/28 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedEntryId(null);
            }
          }}
        >
          <section className="w-full max-w-[560px] rounded-[28px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,249,243,0.96)_0%,rgba(238,244,250,0.92)_100%)] p-5 shadow-[0_28px_64px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Detalle de nota</p>
                <h3 className="mt-2 break-words text-xl font-extrabold text-slate-900">{selectedEntry.title}</h3>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {selectedEntry.processingCategory || (selectedEntry.flag ? selectedEntry.flag.toLowerCase() : "nota")}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm transition hover:bg-slate-100"
                aria-label="Cerrar detalle"
                onClick={() => setSelectedEntryId(null)}
              >
                ×
              </button>
            </div>
            <div className="scrollbar-brand mt-5 max-h-[calc(100vh-11rem)] overflow-y-auto pr-1">
              <EntryDetailContent
                entry={selectedEntry}
                onEntriesUpdated={refreshEntries}
                onUnauthorized={() => {
                  window.location.reload();
                }}
              />
            </div>

            {/*
            {selectedEntry.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedEntry.tags.map((tag) => (
                  <span
                    key={`detail-tag-${tag.id}`}
                    className="inline-flex rounded-full border border-slate-200 bg-white/78 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-5 rounded-[22px] border border-white/85 bg-[linear-gradient(180deg,rgba(252,250,246,0.94)_0%,rgba(239,244,249,0.9)_100%)] p-4 shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                {buildRelationshipEntryText(selectedEntry)}
              </p>
            </div>
            */}
          </section>
        </div>
      ) : null}
    </div>
  );
}
