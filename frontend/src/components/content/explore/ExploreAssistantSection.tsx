import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { askExplore, fetchEntryById, fetchEntryMentions, fetchExploreCollections, fetchExploreRecommendationsRefresh } from "../../../api/resources";
import { isApiError } from "../../../api/client";
import type {
  EntryItem,
  EntryMentionItem,
  ExploreActiveChip,
  ExploreAnswer,
  ExploreCollectionItem,
  ExploreConversationTurn,
  ExploreRecommendationItem,
  ExploreSourceItem
} from "../../../types/resource";
import { readErrorMessage } from "../../../utils/error";
import { BoltIcon, BookIcon, ChecklistIcon, LinkIcon, ListBulletIcon, MagnifyingGlassIcon, MusicalNoteIcon, RelationshipGraphIcon, TableIcon, TwitchIcon, YoutubeIcon } from "../../ui/icons";

type ExploreAssistantSectionProps = {
  onUnauthorized: () => void;
};

const FALLBACK_RECOMMENDATIONS: ExploreRecommendationItem[] = [
  {
    type: "EXPLORE",
    kind: "DEEPEN",
    title: "Profundiza una nota",
    description: "Cuando carguen tus notas, aqui saldran chips ligados a contenidos concretos, no ideas genericas.",
    suggestedQuestion: "Ayudame a profundizar en una nota concreta de mi base",
    sources: [],
  },
  {
    type: "EXPLORE",
    kind: "VARIANT",
    title: "Variante concreta",
    description: "Cuando carguen tus notas, aqui saldran variantes concretas a partir de una nota real.",
    suggestedQuestion: "Enseñame una variante concreta a partir de una nota",
    sources: [],
  },
  {
    type: "EXPLORE",
    kind: "COMPLEMENT",
    title: "Complementa una nota",
    description: "Tambien pueden aparecer complementos externos utiles ligados a una nota concreta.",
    suggestedQuestion: "Enseñame una variante concreta a partir de una nota",
    sources: [],
  },
  {
    type: "EXPLORE",
    kind: "NEXT",
    title: "Despues de una nota",
    description: "Tambien pueden salir siguientes pasos o descubrimientos concretos a partir de una nota.",
    suggestedQuestion: "Despues de una nota concreta, que deberia explorar",
    sources: [],
  },
];

const RECOMMENDATIONS_CACHE_KEY = "explore-recommendations-cache-v2";
const COLLECTIONS_CACHE_KEY = "explore-collections-cache";
const THREAD_CACHE_KEY = "explore-thread-cache";

type AnswerBlock =
  | { type: "paragraph"; content: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; label: string; content: string };

type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; content: string }
  | { type: "paragraph"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "blockquote"; lines: string[] }
  | { type: "code"; language: string; content: string };

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  sources: ExploreSourceItem[];
};

type ManualSourceEntry = Pick<EntryItem, "id" | "title" | "flag">;

type ExploreThreadCache = {
  question: string;
  result: ExploreAnswer | null;
  activeChip: ExploreRecommendationItem | null;
  conversation: ConversationMessage[];
  manualSourceEntries: ManualSourceEntry[];
};

export function ExploreAssistantSection({ onUnauthorized }: ExploreAssistantSectionProps) {
  const initialThreadCache = readThreadCache();
  const [question, setQuestion] = useState(() => initialThreadCache.question);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExploreAnswer | null>(() => initialThreadCache.result);
  const [activeChip, setActiveChip] = useState<ExploreRecommendationItem | null>(() => initialThreadCache.activeChip);
  const [conversation, setConversation] = useState<ConversationMessage[]>(() => initialThreadCache.conversation);
  const [manualSourceEntries, setManualSourceEntries] = useState<ManualSourceEntry[]>(() => initialThreadCache.manualSourceEntries);
  const [selectedSourceEntry, setSelectedSourceEntry] = useState<EntryItem | null>(null);
  const [selectedSourceLoading, setSelectedSourceLoading] = useState(false);
  const [questionCaret, setQuestionCaret] = useState(() => initialThreadCache.question.length);
  const [sourcePickerIndex, setSourcePickerIndex] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<EntryMentionItem[]>([]);
  const [mentionCatalogLoaded, setMentionCatalogLoaded] = useState(false);
  const [recommendations, setRecommendations] = useState<ExploreRecommendationItem[]>(() => {
    if (typeof window === "undefined") {
      return FALLBACK_RECOMMENDATIONS;
    }

    try {
      const rawCache = window.sessionStorage.getItem(RECOMMENDATIONS_CACHE_KEY);
      if (!rawCache) {
        return FALLBACK_RECOMMENDATIONS;
      }
      const parsed = JSON.parse(rawCache) as ExploreRecommendationItem[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : FALLBACK_RECOMMENDATIONS;
    } catch {
      return FALLBACK_RECOMMENDATIONS;
    }
  });
  const [recommendationsLoading, setRecommendationsLoading] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return !window.sessionStorage.getItem(RECOMMENDATIONS_CACHE_KEY);
  });
  const [recommendationsExpanded, setRecommendationsExpanded] = useState(false);
  const [collections, setCollections] = useState<ExploreCollectionItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const rawCache = window.sessionStorage.getItem(COLLECTIONS_CACHE_KEY);
      if (!rawCache) {
        return [];
      }
      const parsed = JSON.parse(rawCache) as ExploreCollectionItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [collectionsLoading, setCollectionsLoading] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return !window.sessionStorage.getItem(COLLECTIONS_CACHE_KEY);
  });
  const [collectionsExpanded, setCollectionsExpanded] = useState(false);
  const recommendationPalettes = useMemo(
    () => [
      {
        cardClassName: "border-sky-200 bg-sky-50/80",
        sourceClassName:
          "rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100",
        iconClassName: "text-sky-600",
        badgeClassName: "bg-sky-100 text-sky-700",
      },
      {
        cardClassName: "border-amber-200 bg-amber-50/80",
        sourceClassName:
          "rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 hover:text-amber-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100",
        iconClassName: "text-amber-600",
        badgeClassName: "bg-amber-100 text-amber-700",
      },
      {
        cardClassName: "border-emerald-200 bg-emerald-50/80",
        sourceClassName:
          "rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100",
        iconClassName: "text-emerald-600",
        badgeClassName: "bg-emerald-100 text-emerald-700",
      },
    ],
    []
  );
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const sourcePickerQuery = useMemo(() => getSourcePickerQuery(question, questionCaret), [question, questionCaret]);
  const visibleSourceOptions = useMemo(
    () => {
      const normalizedQuery = normalizeForMentionFilter(sourcePickerQuery?.query ?? "");

      return mentionSuggestions
        .filter((entry) => !manualSourceEntries.some((selectedEntry) => selectedEntry.id === entry.id))
        .filter((entry) => {
          if (!normalizedQuery) {
            return true;
          }
          return normalizeForMentionFilter(entry.title).includes(normalizedQuery);
        })
        .slice(0, 8);
    },
    [manualSourceEntries, mentionSuggestions, sourcePickerQuery?.query]
  );

  const canAsk = question.trim().length > 0 && !loading && !sourcePickerQuery;

  useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined" && window.sessionStorage.getItem(RECOMMENDATIONS_CACHE_KEY)) {
      setRecommendationsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadRecommendations(refreshToken?: string) {
      try {
        setRecommendationsLoading(true);
        const response = await fetchExploreRecommendationsRefresh(refreshToken ?? "initial");
        if (!cancelled && response.recommendations.length > 0) {
          setRecommendations(response.recommendations);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(RECOMMENDATIONS_CACHE_KEY, JSON.stringify(response.recommendations));
          }
        }
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return;
        }
        if (!cancelled) {
          setRecommendations(FALLBACK_RECOMMENDATIONS);
        }
      } finally {
        if (!cancelled) {
          setRecommendationsLoading(false);
        }
      }
    }

    void loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasThreadState =
      conversation.length > 0 ||
      activeChip !== null ||
      result !== null ||
      question.trim().length > 0;

    if (!hasThreadState) {
      window.sessionStorage.removeItem(THREAD_CACHE_KEY);
      return;
    }

    const nextCache: ExploreThreadCache = {
      question,
      result,
      activeChip,
      conversation,
      manualSourceEntries
    };

    window.sessionStorage.setItem(THREAD_CACHE_KEY, JSON.stringify(nextCache));
  }, [activeChip, conversation, manualSourceEntries, question, result]);

  useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined" && window.sessionStorage.getItem(COLLECTIONS_CACHE_KEY)) {
      setCollectionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadCollections() {
      try {
        setCollectionsLoading(true);
        const response = await fetchExploreCollections();
        if (!cancelled) {
          setCollections(response.collections);
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(COLLECTIONS_CACHE_KEY, JSON.stringify(response.collections));
          }
        }
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return;
        }
        if (!cancelled) {
          setCollections([]);
        }
      } finally {
        if (!cancelled) {
          setCollectionsLoading(false);
        }
      }
    }

    void loadCollections();

    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  useEffect(() => {
    if (!sourcePickerQuery || mentionCatalogLoaded) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const entries = await fetchEntryMentions();
        if (!cancelled) {
          setMentionSuggestions(entries);
          setMentionCatalogLoaded(true);
        }
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return;
        }
        if (!cancelled) {
          setMentionSuggestions([]);
          setMentionCatalogLoaded(true);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [mentionCatalogLoaded, onUnauthorized, sourcePickerQuery]);

  useEffect(() => {
    setSourcePickerIndex(0);
  }, [sourcePickerQuery?.start, sourcePickerQuery?.query]);

  async function handleAsk(options?: {
    nextQuestion?: string;
    nextChip?: ExploreRecommendationItem | null;
    resetThread?: boolean;
  }) {
    const resolvedQuestion = (options?.nextQuestion ?? question).trim();
    if (!resolvedQuestion) {
      return;
    }

    const nextActiveChip = options?.nextChip === undefined ? activeChip : options.nextChip;
    const resetThread = options?.resetThread ?? false;
    const history: ExploreConversationTurn[] = resetThread
      ? []
      : conversation.map((message) => ({ role: message.role, content: message.content }));

    try {
      setLoading(true);
      setError(null);
      const response = await askExplore({
        question: resolvedQuestion,
        sourceEntryIds: collectSourceEntryIds(manualSourceEntries, nextActiveChip, resetThread ? null : result),
        activeChip: toActiveChip(nextActiveChip),
        history
      });
      setConversation([
        ...(resetThread ? [] : conversation),
        { role: "user", content: resolvedQuestion, sources: [] },
        { role: "assistant", content: response.answer, sources: response.sources }
      ]);
      setActiveChip(nextActiveChip);
      setQuestion("");
      setQuestionCaret(0);
      setResult(response);
      setSelectedSourceEntry(null);
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      setError(readErrorMessage(requestError, "No se pudo consultar el asistente."));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenSource(entryId: number) {
    try {
      setSelectedSourceLoading(true);
      const entry = await fetchEntryById(entryId);
      setSelectedSourceEntry(entry);
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      setError(readErrorMessage(requestError, "No se pudo cargar la nota."));
    } finally {
      setSelectedSourceLoading(false);
    }
  }

  async function handleRefreshRecommendations() {
    try {
      setRecommendationsLoading(true);
      const response = await fetchExploreRecommendationsRefresh(String(Date.now()));
      if (response.recommendations.length > 0) {
        setRecommendations(response.recommendations);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(RECOMMENDATIONS_CACHE_KEY, JSON.stringify(response.recommendations));
        }
      }
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }
      setError(readErrorMessage(requestError, "No se pudieron cargar nuevas recomendaciones."));
    } finally {
      setRecommendationsLoading(false);
    }
  }

  function getRecommendationStyle(
    type: ExploreRecommendationItem["type"],
    kind: ExploreRecommendationItem["kind"] | undefined,
    index: number
  ) {
    if (type === "OPTIMIZE" || kind === "OPTIMIZE") {
      return {
        cardClassName: "border-rose-200 bg-rose-50/70",
        sourceClassName:
          "rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100",
        icon: BoltIcon,
        iconClassName: "text-rose-600",
        badgeClassName: "bg-rose-100 text-rose-700",
        badgeLabel: "Optimizar",
      };
    }

    if (kind === "VARIANT") {
      return {
        cardClassName: "border-amber-200 bg-amber-50/80",
        sourceClassName:
          "rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 hover:text-amber-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100",
        icon: MagnifyingGlassIcon,
        iconClassName: "text-amber-600",
        badgeClassName: "bg-amber-100 text-amber-700",
        badgeLabel: "Variante",
      };
    }

    if (kind === "COMPLEMENT") {
      return {
        cardClassName: "border-emerald-200 bg-emerald-50/80",
        sourceClassName:
          "rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100",
        icon: BookIcon,
        iconClassName: "text-emerald-600",
        badgeClassName: "bg-emerald-100 text-emerald-700",
        badgeLabel: "Complemento",
      };
    }

    if (kind === "NEXT") {
      return {
        cardClassName: "border-fuchsia-200 bg-fuchsia-50/80",
        sourceClassName:
          "rounded-full border border-fuchsia-200 bg-white px-2.5 py-1 text-xs font-semibold text-fuchsia-700 transition hover:border-fuchsia-300 hover:bg-fuchsia-100 hover:text-fuchsia-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-fuchsia-200 bg-white px-4 text-sm font-semibold text-fuchsia-800 transition hover:border-fuchsia-300 hover:bg-fuchsia-100",
        icon: RelationshipGraphIcon,
        iconClassName: "text-fuchsia-600",
        badgeClassName: "bg-fuchsia-100 text-fuchsia-700",
        badgeLabel: "Siguiente",
      };
    }

    return {
      cardClassName: "border-sky-200 bg-sky-50/80",
      sourceClassName:
        "rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800",
      buttonClassName:
        "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100",
      icon: MagnifyingGlassIcon,
      iconClassName: "text-sky-600",
      badgeClassName: "bg-sky-100 text-sky-700",
      badgeLabel: "Profundizar",
    };
  }

  function handleSelectManualSource(entry: EntryMentionItem) {
    const replacement = replaceSourcePickerToken(question, questionCaret);
    setManualSourceEntries((current) => {
      if (current.some((selectedEntry) => selectedEntry.id === entry.id)) {
        return current;
      }

      return [...current, { id: entry.id, title: entry.title, flag: null }].slice(0, 8);
    });
    setQuestion(replacement.question);
    setQuestionCaret(replacement.caret);
    setSourcePickerIndex(0);
    setError(null);

    requestAnimationFrame(() => {
      questionInputRef.current?.focus();
      questionInputRef.current?.setSelectionRange(replacement.caret, replacement.caret);
    });
  }

  function handleRemoveManualSource(entryId: number) {
    setManualSourceEntries((current) => current.filter((entry) => entry.id !== entryId));
  }

  function handleOpenManualSourcePicker() {
    const replacement = insertSourcePickerTrigger(question, questionCaret);
    setQuestion(replacement.question);
    setQuestionCaret(replacement.caret);
    setSourcePickerIndex(0);
    setError(null);

    requestAnimationFrame(() => {
      questionInputRef.current?.focus();
      questionInputRef.current?.setSelectionRange(replacement.caret, replacement.caret);
    });
  }

  function getCollectionStyle(kind: ExploreCollectionItem["kind"]) {
    if (kind === "RECENT") {
      return {
        cardClassName: "border-teal-200 bg-teal-50/70",
        badgeClassName: "bg-teal-100 text-teal-700",
        sourceClassName:
          "rounded-full border border-teal-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100",
        icon: BookIcon,
        badgeLabel: "Reciente",
      };
    }

    if (kind === "BRIDGE") {
      return {
        cardClassName: "border-amber-200 bg-amber-50/70",
        badgeClassName: "bg-amber-100 text-amber-700",
        sourceClassName:
          "rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 hover:text-amber-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100",
        icon: RelationshipGraphIcon,
        badgeLabel: "Puente",
      };
    }

    return {
      cardClassName: "border-sky-200 bg-sky-50/80",
      badgeClassName: "bg-sky-100 text-sky-700",
      sourceClassName:
        "rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800",
      buttonClassName:
        "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100",
      icon: MagnifyingGlassIcon,
      badgeLabel: "Tema",
    };
  }

  const visibleRecommendations = recommendationsLoading ? FALLBACK_RECOMMENDATIONS : recommendations;
  const hasThread = conversation.length > 0;
  const flagExploreChips = useMemo(
    () => [
      { key: "YOUTUBE", label: "YouTube", prompt: "Que videos de YouTube tengo guardados y por cual deberia empezar", icon: YoutubeIcon },
      { key: "TWITCH", label: "Twitch", prompt: "Que contenido de Twitch tengo guardado y que merece la pena revisar", icon: TwitchIcon },
      { key: "SPOTIFY", label: "Spotify", prompt: "Que tengo guardado de Spotify y como se relaciona con mis otras notas", icon: MusicalNoteIcon },
      { key: "CHECKLIST", label: "Checklist", prompt: "Que checklists o tareas tengo guardadas ahora mismo", icon: ChecklistIcon },
      { key: "TABLE", label: "Tablas", prompt: "Que tablas tengo guardadas y cual me conviene revisar primero", icon: TableIcon },
      { key: "LINK", label: "Links", prompt: "Que enlaces tengo guardados sobre mis temas principales", icon: LinkIcon },
      { key: "ENUMERATION", label: "Listas", prompt: "Que listas o enumeraciones tengo guardadas y que ideas salen de ellas", icon: ListBulletIcon }
    ],
    []
  );

  return (
    <div className="grid gap-4">
      <section className="rounded-card border border-[#F0F0F0] bg-white/85 p-5 shadow-card">
        <h2 className="text-xl font-extrabold text-slate-900">Explorar con asistente</h2>
        <p className="mt-2 text-sm font-medium text-slate-600">
          Pregunta, resume, pide recomendaciones o explora conexiones dentro de tus notas.
        </p>

        {activeChip || hasThread ? (
          <section className="mt-4 rounded-card border border-teal-200 bg-teal-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                  {activeChip ? "Chip activa" : "Conversacion activa"}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {activeChip ? activeChip.title : "Exploracion en curso"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {activeChip
                    ? activeChip.description
                    : "Las siguientes preguntas seguiran en el mismo hilo hasta que lo cierres."}
                </p>

                {activeChip && activeChip.sources.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeChip.sources.map((source) => (
                      <button
                        key={`active-chip-source-${source.entryId}`}
                        type="button"
                        className="rounded-full border border-teal-300 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 transition hover:border-teal-400 hover:bg-teal-100"
                        onClick={() => void handleOpenSource(source.entryId)}
                      >
                        {source.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-control border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"
                onClick={() => {
                  setActiveChip(null);
                  setConversation([]);
                  setResult(null);
                  setSelectedSourceEntry(null);
                  setManualSourceEntries([]);
                  setQuestion("");
                  setQuestionCaret(0);
                }}
              >
                Cerrar hilo
              </button>
            </div>
          </section>
        ) : null}

        {hasThread ? (
          <section className="mt-4 rounded-card border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Conversacion</p>
            <div className="mt-4 grid gap-3">
              {conversation.map((message, messageIndex) =>
                message.role === "user" ? (
                  <article
                    key={`conversation-user-${messageIndex}`}
                    className="ml-auto max-w-3xl rounded-card border border-slate-200 bg-slate-900 p-4 text-white shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Tu pregunta</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white">{message.content}</p>
                  </article>
                ) : (
                  <div key={`conversation-assistant-${messageIndex}`} className="grid gap-3">
                    <article className="max-w-4xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Asistente</p>
                      <div className="mt-4 grid gap-4 text-sm leading-7 text-slate-800">
                        {renderAnswerMarkdown(message.content, message.sources, handleOpenSource)}
                      </div>
                    </article>
                  </div>
                )
              )}
            </div>
          </section>
        ) : null}

        <div className="mt-4 grid gap-3">
          <div className="relative">
            <textarea
              ref={questionInputRef}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                setQuestionCaret(event.target.selectionStart ?? event.target.value.length);
              }}
              onClick={(event) => setQuestionCaret(event.currentTarget.selectionStart ?? question.length)}
              onKeyUp={(event) => setQuestionCaret(event.currentTarget.selectionStart ?? question.length)}
              onKeyDown={(event) => {
                if (sourcePickerQuery && event.key === "ArrowDown") {
                    event.preventDefault();
                    setSourcePickerIndex((current) => (visibleSourceOptions.length === 0 ? 0 : Math.min(current + 1, visibleSourceOptions.length - 1)));
                    return;
                }

                if (sourcePickerQuery && event.key === "ArrowUp") {
                    event.preventDefault();
                    setSourcePickerIndex((current) => Math.max(current - 1, 0));
                    return;
                }

                if (sourcePickerQuery && event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (visibleSourceOptions.length > 0) {
                      handleSelectManualSource(visibleSourceOptions[Math.min(sourcePickerIndex, visibleSourceOptions.length - 1)]);
                    }
                    return;
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleAsk();
                }
              }}
              className="min-h-28 w-full rounded-card border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              placeholder={
                hasThread
                  ? "Sigue preguntando dentro de este hilo. Usa # para añadir una nota al contexto"
                  : "Ejemplo: con que ingredientes puedo complementar una tortilla de patatas. Usa # para añadir una nota al contexto"
              }
            />

            {sourcePickerQuery && visibleSourceOptions.length > 0 ? (
              <section className="absolute left-3 top-full z-20 mt-2 w-[20rem] max-w-[calc(100%-1.5rem)] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
                <div className="grid gap-1">
                  {visibleSourceOptions.map((entry, entryIndex) => (
                    <button
                      key={`source-picker-${entry.id}`}
                      type="button"
                      className={`rounded-xl px-3 py-2 text-left text-sm transition ${
                        entryIndex === sourcePickerIndex
                          ? "bg-teal-50 text-teal-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectManualSource(entry)}
                    >
                      <span className="block truncate font-medium">{entry.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                sourcePickerQuery
                  ? "border-teal-300 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
              }`}
              onClick={handleOpenManualSourcePicker}
            >
              <BookIcon className="h-4 w-4" />
              <span>Añadir contexto</span>
            </button>
            <p className="text-xs text-slate-500">Tambien puedes escribir <span className="font-semibold text-slate-700">#</span> dentro del mensaje.</p>
          </div>

          {manualSourceEntries.length > 0 ? (
            <div className="rounded-card border border-teal-200 bg-teal-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Contexto manual</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {manualSourceEntries.map((entry) => (
                  <button
                    key={`manual-source-${entry.id}`}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"
                    onClick={() => handleRemoveManualSource(entry.id)}
                    title="Quitar nota del contexto"
                  >
                    <span>#{entry.title}</span>
                    <span aria-hidden="true" className="text-[11px] text-teal-600">x</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!hasThread ? <div className="flex flex-wrap gap-2">
                {visibleRecommendations.map((recommendation) => {
                  const style = getRecommendationStyle(
                    recommendation.type,
                    recommendation.kind,
                    visibleRecommendations.indexOf(recommendation)
                  );
              return (
                <button
                  key={`chip-${recommendation.title}-${recommendation.suggestedQuestion}`}
                  type="button"
                  className={style.sourceClassName}
                  onClick={() =>
                    void handleAsk({
                      nextQuestion: recommendation.suggestedQuestion,
                      nextChip: recommendation,
                      resetThread: true
                    })}
                  disabled={loading}
                >
                  {recommendation.title}
                </button>
              );
            })}
          </div> : null}

          {!hasThread ? <div className="flex flex-wrap gap-2">
            {flagExploreChips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.key}
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  onClick={() => void handleAsk({ nextQuestion: chip.prompt, nextChip: null, resetThread: true })}
                  disabled={loading}
                >
                  <Icon className="h-4 w-4" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div> : null}

          {!hasThread ? <section className="grid gap-3 rounded-card border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-control border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
                onClick={() => setRecommendationsExpanded((current) => !current)}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Chips del asistente
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  {recommendationsExpanded ? "Ocultar" : "Ver detalle"}
                </span>
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-control border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void handleRefreshRecommendations()}
                disabled={recommendationsLoading}
              >
                {recommendationsLoading ? "Cargando..." : "Nuevos chips"}
              </button>
            </div>

            {recommendationsExpanded ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visibleRecommendations.map((recommendation) => (
                      (() => {
                        const style = getRecommendationStyle(
                          recommendation.type,
                          recommendation.kind,
                          visibleRecommendations.indexOf(recommendation)
                        );
                        const Icon = style.icon;
                  return (
                    <article
                      key={`${recommendation.title}-${recommendation.suggestedQuestion}`}
                      className={`relative flex h-full flex-col rounded-card border p-4 shadow-sm ${style.cardClassName}`}
                    >
                      <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-current shadow-sm">
                        <Icon className={`h-4 w-4 ${style.iconClassName}`} />
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${style.badgeClassName}`}
                      >
                              {style.badgeLabel}
                      </span>
                      <div className="flex flex-1 flex-col">
                        <p className="mt-3 text-sm font-bold text-slate-900">{recommendation.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{recommendation.description}</p>

                        {recommendation.sources.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {recommendation.sources.map((source) => (
                              <button
                                key={`${recommendation.title}-${source.entryId}`}
                                type="button"
                                className={style.sourceClassName}
                                onClick={() => void handleOpenSource(source.entryId)}
                              >
                                {source.title}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-auto pt-4">
                          <button
                            type="button"
                            className={`${style.buttonClassName} w-full`}
                            onClick={() =>
                              void handleAsk({
                                nextQuestion: recommendation.suggestedQuestion,
                                nextChip: recommendation,
                                resetThread: true
                              })}
                            disabled={loading}
                          >
                            Abrir chip
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })()
              ))}
            </div>
              ) : null}
          </section> : null}

          {!hasThread && (collections.length > 0 || collectionsLoading) ? (
            <section className="grid gap-4 rounded-card border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-control border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
                  onClick={() => setCollectionsExpanded((current) => !current)}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Colecciones inteligentes
                  </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {collectionsExpanded ? "Ocultar" : "Ver detalle"}
                  </span>
                </button>
              </div>

              {collectionsExpanded ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {(collectionsLoading ? [] : collections).map((collection) => {
                    const style = getCollectionStyle(collection.kind);
                    const Icon = style.icon;
                    return (
                      <article
                        key={`${collection.kind}-${collection.title}`}
                        className={`relative flex h-full flex-col rounded-card border p-4 shadow-sm ${style.cardClassName}`}
                      >
                        <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-current shadow-sm">
                          <Icon className="h-4 w-4 text-slate-700" />
                        </span>
                        <span
                          className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${style.badgeClassName}`}
                        >
                          {style.badgeLabel}
                        </span>
                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span>{collection.entryCount} notas</span>
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-900">{collection.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{collection.description}</p>

                        {collection.sources.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {collection.sources.map((source) => (
                              <button
                                key={`${collection.title}-${source.entryId}`}
                                type="button"
                                className={style.sourceClassName}
                                onClick={() => void handleOpenSource(source.entryId)}
                              >
                                {source.title}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-auto pt-4">
                          <button
                            type="button"
                            className={`${style.buttonClassName} w-full`}
                            onClick={() =>
                              void handleAsk({
                                nextQuestion: collection.suggestedQuestion,
                                nextChip: null,
                                resetThread: true
                              })}
                            disabled={loading}
                          >
                            Abrir bloque
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-control border border-teal-600 bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
              onClick={() => void handleAsk()}
              disabled={!canAsk}
            >
              {loading ? "Consultando..." : hasThread ? "Enviar al hilo" : "Preguntar"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-card border border-rose-200 bg-rose-50 p-4 shadow-card">
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </section>
      ) : null}

      {selectedSourceLoading ? (
        <section className="rounded-card border border-[#F0F0F0] bg-white/85 p-5 shadow-card">
          <p className="text-sm font-medium text-slate-700">Cargando nota citada...</p>
        </section>
      ) : selectedSourceEntry ? (
        <section className="rounded-card border border-teal-200 bg-white/90 p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nota citada</p>
              <h3 className="mt-2 text-lg font-extrabold text-slate-900">{selectedSourceEntry.title}</h3>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-control border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => setSelectedSourceEntry(null)}
            >
              Cerrar
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {selectedSourceEntry.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedSourceEntry.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}

            {selectedSourceEntry.resources.map((resource) => (
              <article key={resource.id} className="rounded-card border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{resource.type}</p>
                {resource.title ? (
                  <p className="mt-2 text-sm font-bold text-slate-900">{resource.title}</p>
                ) : null}
                {resource.textContent ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{resource.textContent}</p>
                ) : null}
                {resource.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-700">{resource.description}</p>
                ) : null}
                {resource.contentPreview ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{resource.contentPreview}</p>
                ) : null}
                {resource.url ? (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block break-all text-sm font-semibold text-teal-700 underline decoration-teal-300 underline-offset-4"
                  >
                    {resource.url}
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-card border border-[#F0F0F0] bg-white/85 p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fuentes</p>
          <div className="mt-3 grid gap-3">
            {result.sources.map((source) => (
              <article key={source.entryId} className="rounded-card border border-slate-200 bg-slate-50 p-4">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => void handleOpenSource(source.entryId)}
                >
                  <p className="text-sm font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-teal-800 hover:decoration-teal-500">
                    {source.title}
                  </p>
                </button>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{source.snippet}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function toActiveChip(chip: ExploreRecommendationItem | null): ExploreActiveChip | undefined {
  if (!chip) {
    return undefined;
  }

  return {
    type: chip.type,
    title: chip.title,
    description: chip.description,
    suggestedQuestion: chip.suggestedQuestion
  };
}

function collectSourceEntryIds(
  manualSourceEntries: ManualSourceEntry[],
  activeChip: ExploreRecommendationItem | null,
  result: ExploreAnswer | null
): number[] {
  if (manualSourceEntries.length > 0) {
    return manualSourceEntries.slice(0, 8).map((entry) => entry.id);
  }

  const ids = new Set<number>();

  activeChip?.sources?.forEach((source) => {
    if (ids.size < 8) {
      ids.add(source.entryId);
    }
  });
  result?.sources?.forEach((source) => {
    if (ids.size < 8) {
      ids.add(source.entryId);
    }
  });

  return Array.from(ids);
}

function readThreadCache(): ExploreThreadCache {
  if (typeof window === "undefined") {
    return {
      question: "",
      result: null,
      activeChip: null,
      conversation: [],
      manualSourceEntries: []
    };
  }

  try {
    const rawCache = window.sessionStorage.getItem(THREAD_CACHE_KEY);
    if (!rawCache) {
      return {
        question: "",
        result: null,
        activeChip: null,
        conversation: [],
        manualSourceEntries: []
      };
    }

    const parsed = JSON.parse(rawCache) as Partial<ExploreThreadCache>;
    return {
      question: typeof parsed.question === "string" ? parsed.question : "",
      result: parsed.result ?? null,
      activeChip: parsed.activeChip ?? null,
      conversation: Array.isArray(parsed.conversation) ? parsed.conversation : [],
      manualSourceEntries: Array.isArray(parsed.manualSourceEntries) ? parsed.manualSourceEntries.filter(isManualSourceEntry) : []
    };
  } catch {
    return {
      question: "",
      result: null,
      activeChip: null,
      conversation: [],
      manualSourceEntries: []
    };
  }
}

function getSourcePickerQuery(question: string, caretPosition: number): { start: number; end: number; query: string } | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, question.length));
  const beforeCaret = question.slice(0, safeCaret);
  const lineStart = beforeCaret.lastIndexOf("\n") + 1;
  const lineContent = beforeCaret.slice(lineStart);
  const hashIndex = lineContent.lastIndexOf("#");

  if (hashIndex < 0) {
    return null;
  }

  const absoluteHashIndex = lineStart + hashIndex;
  const previousCharacter = absoluteHashIndex > 0 ? question.charAt(absoluteHashIndex - 1) : "";
  if (previousCharacter && !/\s|[([{]/.test(previousCharacter)) {
    return null;
  }

  return {
    start: absoluteHashIndex,
    end: safeCaret,
    query: beforeCaret.slice(absoluteHashIndex + 1)
  };
}

function replaceSourcePickerToken(question: string, caretPosition: number): { question: string; caret: number } {
  const sourcePickerQuery = getSourcePickerQuery(question, caretPosition);
  if (!sourcePickerQuery) {
    return { question, caret: caretPosition };
  }

  const left = question.slice(0, sourcePickerQuery.start);
  const right = question.slice(sourcePickerQuery.end).replace(/^\s+/, "");
  const needsBridgeSpace = left.length > 0 && !/\s$/.test(left) && right.length > 0 && !/^\s/.test(right);
  const nextQuestion = `${left}${needsBridgeSpace ? " " : ""}${right}`;

  return {
    question: nextQuestion,
    caret: left.length + (needsBridgeSpace ? 1 : 0)
  };
}

function insertSourcePickerTrigger(question: string, caretPosition: number): { question: string; caret: number } {
  const sourcePickerQuery = getSourcePickerQuery(question, caretPosition);
  if (sourcePickerQuery) {
    return { question, caret: caretPosition };
  }

  const safeCaret = Math.max(0, Math.min(caretPosition, question.length));
  const left = question.slice(0, safeCaret);
  const right = question.slice(safeCaret);
  const prefix = left.length > 0 && !/\s$/.test(left) ? " #" : "#";
  return {
    question: `${left}${prefix}${right}`,
    caret: left.length + prefix.length
  };
}

function normalizeForMentionFilter(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isManualSourceEntry(value: unknown): value is ManualSourceEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ManualSourceEntry>;
  return typeof candidate.id === "number" && typeof candidate.title === "string";
}

function parseAnswerBlocks(answer: string): AnswerBlock[] {
  const trimmed = answer.trim();
  if (!trimmed) {
    return [];
  }

  const chunks = trimmed.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    const listItems = lines
      .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
      .filter(Boolean);

    const isList = lines.length >= 2 && lines.every((line) => /^([-*•]\s+|\d+[.)]\s+)/.test(line));
    if (isList) {
      return { type: "list", items: listItems };
    }

    if (lines.length >= 2 && /:$/.test(lines[0])) {
      return {
        type: "callout",
        label: lines[0].replace(/:$/, ""),
        content: lines.slice(1).join("\n"),
      };
    }

    return {
      type: "paragraph",
      content: lines.join("\n"),
    };
  });
}

function renderAnswerWithSources(
  text: string,
  sources: ExploreSourceItem[],
  onOpenSource: (entryId: number) => Promise<void>
): ReactNode {
  if (!text.trim() || sources.length === 0) {
    return text;
  }

  const normalizedSources = sources
    .map((source) => ({
      ...source,
      markers: [`«${source.title}»`, `[${source.title}]`]
    }))
    .sort((left, right) => right.markers[0].length - left.markers[0].length);

  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let matchedSource: ((typeof normalizedSources)[number] & { marker: string }) | null = null;
    let matchedIndex = -1;

    for (const source of normalizedSources) {
      for (const marker of source.markers) {
        const candidateIndex = text.indexOf(marker, cursor);
        if (candidateIndex >= 0 && (matchedIndex === -1 || candidateIndex < matchedIndex)) {
          matchedIndex = candidateIndex;
          matchedSource = { ...source, marker };
        }
      }
    }

    if (!matchedSource || matchedIndex < 0) {
      parts.push(text.slice(cursor));
      break;
    }

    if (matchedIndex > cursor) {
      parts.push(text.slice(cursor, matchedIndex));
    }

    parts.push(
      <button
        key={`${matchedSource.entryId}-${matchedIndex}`}
        type="button"
        className="mx-0.5 inline-flex items-center rounded-full border border-teal-500 bg-teal-50 px-2.5 py-1 align-middle text-xs font-bold tracking-[0.01em] text-teal-900 shadow-sm transition hover:-translate-y-[1px] hover:border-teal-600 hover:bg-teal-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-200"
        onClick={() => void onOpenSource(matchedSource.entryId)}
        title={`Abrir ${matchedSource.title}`}
      >
        {matchedSource.title}
      </button>
    );

    cursor = matchedIndex + matchedSource.marker.length;
  }

  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

function renderAnswerMarkdown(
  answer: string,
  sources: ExploreSourceItem[],
  onOpenSource: (entryId: number) => Promise<void>
): ReactNode {
  const blocks = parseMarkdownBlocks(answer);
  if (blocks.length === 0) {
    return null;
  }

  return blocks.map((block, blockIndex) => {
    if (block.type === "heading") {
      const className =
        block.level === 2
          ? "text-base font-extrabold text-slate-900"
          : "text-sm font-bold uppercase tracking-[0.12em] text-slate-600";
      const Tag = block.level === 2 ? "h3" : "h4";
      return (
        <Tag key={`answer-heading-${blockIndex}`} className={className}>
          {renderMarkdownInlineWithSources(block.content, sources, onOpenSource)}
        </Tag>
      );
    }

    if (block.type === "unordered-list") {
      return (
        <ul key={`answer-ul-${blockIndex}`} className="grid gap-2">
          {block.items.map((item, itemIndex) => (
            <li key={`answer-ul-${blockIndex}-${itemIndex}`} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              <span>{renderMarkdownInlineWithSources(item, sources, onOpenSource)}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (block.type === "ordered-list") {
      return (
        <ol key={`answer-ol-${blockIndex}`} className="grid gap-3">
          {block.items.map((item, itemIndex) => (
            <li key={`answer-ol-${blockIndex}-${itemIndex}`} className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {itemIndex + 1}
              </span>
              <span>{renderMarkdownInlineWithSources(item, sources, onOpenSource)}</span>
            </li>
          ))}
        </ol>
      );
    }

    if (block.type === "blockquote") {
      return (
        <article key={`answer-quote-${blockIndex}`} className="rounded-card border border-teal-200 bg-teal-50/70 px-4 py-3">
          <div className="grid gap-2">
            {block.lines.map((quoteLine, quoteIndex) => (
              <p key={`answer-quote-${blockIndex}-${quoteIndex}`} className="text-sm leading-7 text-slate-800">
                {renderMarkdownInlineWithSources(quoteLine, sources, onOpenSource)}
              </p>
            ))}
          </div>
        </article>
      );
    }

    if (block.type === "code") {
      return (
        <div key={`answer-code-${blockIndex}`} className="overflow-x-auto rounded-card border border-slate-200 bg-slate-950 p-4">
          {block.language ? (
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{block.language}</p>
          ) : null}
          <pre className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-100">
            <code>{block.content}</code>
          </pre>
        </div>
      );
    }

    return (
      <p key={`answer-paragraph-${blockIndex}`} className="text-sm leading-7 text-slate-800">
        {renderMarkdownInlineWithSources(block.content, sources, onOpenSource)}
      </p>
    );
  });
}

function parseMarkdownBlocks(answer: string): MarkdownBlock[] {
  const trimmed = answer.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const codeFenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (codeFenceMatch) {
      const codeLines: string[] = [];
      const language = codeFenceMatch[1] ?? "";
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", language, content: codeLines.join("\n").trimEnd() });
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, Math.max(2, headingMatch[1].length)) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, content: headingMatch[2].trim() });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, "").trim());
        index += 1;
      }
      blocks.push({ type: "blockquote", lines: quoteLines.filter(Boolean) });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "unordered-list", items: items.filter(Boolean) });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "ordered-list", items: items.filter(Boolean) });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (
        !candidate ||
        /^```/.test(candidate) ||
        /^(#{1,4})\s+/.test(candidate) ||
        /^>\s?/.test(candidate) ||
        /^[-*]\s+/.test(candidate) ||
        /^\d+[.)]\s+/.test(candidate)
      ) {
        break;
      }
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", content: paragraphLines.join(" ") });
      continue;
    }

    index += 1;
  }

  return blocks;
}

function renderMarkdownInlineWithSources(
  text: string,
  sources: ExploreSourceItem[],
  onOpenSource: (entryId: number) => Promise<void>
): ReactNode {
  if (!text.trim()) {
    return text;
  }

  const normalizedSources = sources
    .map((source) => ({
      ...source,
      markers: [`Â«${source.title}Â»`, `[${source.title}]`]
    }))
    .sort((left, right) => right.markers[0].length - left.markers[0].length);

  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let matchedSource: ((typeof normalizedSources)[number] & { marker: string }) | null = null;
    let matchedIndex = -1;

    for (const source of normalizedSources) {
      for (const marker of source.markers) {
        const candidateIndex = text.indexOf(marker, cursor);
        if (candidateIndex >= 0 && (matchedIndex === -1 || candidateIndex < matchedIndex)) {
          matchedIndex = candidateIndex;
          matchedSource = { ...source, marker };
        }
      }
    }

    if (!matchedSource || matchedIndex < 0) {
      parts.push(...renderInlineMarkdown(text.slice(cursor), `inline-${cursor}`));
      break;
    }

    if (matchedIndex > cursor) {
      parts.push(...renderInlineMarkdown(text.slice(cursor, matchedIndex), `inline-${cursor}`));
    }

    parts.push(
      <button
        key={`${matchedSource.entryId}-${matchedIndex}`}
        type="button"
        className="mx-0.5 inline-flex items-center rounded-full border border-teal-500 bg-teal-50 px-2.5 py-1 align-middle text-xs font-bold tracking-[0.01em] text-teal-900 shadow-sm transition hover:-translate-y-[1px] hover:border-teal-600 hover:bg-teal-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-200"
        onClick={() => void onOpenSource(matchedSource.entryId)}
        title={`Abrir ${matchedSource.title}`}
      >
        {matchedSource.title}
      </button>
    );

    cursor = matchedIndex + matchedSource.marker.length;
  }

  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  if (!text) {
    return [];
  }

  const parts: ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    const token = match[0];
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      parts.push(
        <strong key={`${keyPrefix}-bold-${index}`} className="font-bold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      parts.push(
        <em key={`${keyPrefix}-italic-${index}`} className="italic text-slate-700">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={`${keyPrefix}-code-${index}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-900"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
