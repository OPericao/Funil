import { useEffect, useMemo, useState } from "react";
import { askExplore, fetchEntryById, fetchExploreCollections, fetchExploreRecommendationsRefresh } from "../../../api/resources";
import { isApiError } from "../../../api/client";
import type { EntryItem, ExploreAnswer, ExploreCollectionItem, ExploreRecommendationItem } from "../../../types/resource";
import { readErrorMessage } from "../../../utils/error";
import { BoltIcon, BookIcon, ChecklistIcon, LinkIcon, ListBulletIcon, MagnifyingGlassIcon, MusicalNoteIcon, RelationshipGraphIcon, TableIcon, TwitchIcon, YoutubeIcon } from "../../ui/icons";

type ExploreAssistantSectionProps = {
  onUnauthorized: () => void;
};

const FALLBACK_RECOMMENDATIONS: ExploreRecommendationItem[] = [
  {
    type: "EXPLORE",
    title: "Consolida tu tema principal",
    description: "Agrupa lo que ya tienes sobre el tema mas repetido y saca una sintesis util.",
    suggestedQuestion: "Resume lo mas importante de lo que tengo guardado",
    sources: [],
  },
  {
    type: "EXPLORE",
    title: "Busca una conexion potente",
    description: "Cruza dos ideas que aparecen a menudo para detectar relaciones que aun no has explicado bien.",
    suggestedQuestion: "Que conexiones interesantes hay entre mis notas",
    sources: [],
  },
  {
    type: "OPTIMIZE",
    title: "Prioriza el siguiente paso",
    description: "Usa tu contenido mas reciente como punto de partida para decidir que merece seguimiento.",
    suggestedQuestion: "Que deberia revisar a continuacion",
    sources: [],
  },
];

const RECOMMENDATIONS_CACHE_KEY = "explore-recommendations-cache";
const COLLECTIONS_CACHE_KEY = "explore-collections-cache";

type AnswerBlock =
  | { type: "paragraph"; content: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; label: string; content: string };

export function ExploreAssistantSection({ onUnauthorized }: ExploreAssistantSectionProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExploreAnswer | null>(null);
  const [selectedSourceEntry, setSelectedSourceEntry] = useState<EntryItem | null>(null);
  const [selectedSourceLoading, setSelectedSourceLoading] = useState(false);
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

  const canAsk = question.trim().length > 0 && !loading;

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

  async function handleAsk(nextQuestion?: string) {
    const resolvedQuestion = (nextQuestion ?? question).trim();
    if (!resolvedQuestion) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await askExplore(resolvedQuestion);
      setQuestion(resolvedQuestion);
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

  const emptyState = useMemo(
    () => (
      <section className="rounded-card border border-[#F0F0F0] bg-white/80 p-5 shadow-card">
        <p className="text-sm font-medium text-ink-700">
          Haz una pregunta sobre tus notas y el asistente intentara responder usando tu base personal.
        </p>
      </section>
    ),
    []
  );

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

  function getRecommendationStyle(type: ExploreRecommendationItem["type"]) {
    if (type === "OPTIMIZE") {
      return {
        cardClassName: "border-rose-200 bg-rose-50/70",
        sourceClassName:
          "rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800",
        buttonClassName:
          "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100",
        icon: BoltIcon,
      };
    }

    return {
      cardClassName: "border-violet-200 bg-violet-50/70",
      sourceClassName:
        "rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 hover:text-violet-800",
      buttonClassName:
        "mt-4 inline-flex h-10 items-center justify-center rounded-control border border-violet-200 bg-white px-4 text-sm font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100",
      icon: MagnifyingGlassIcon,
    };
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
  const answerBlocks = useMemo(() => parseAnswerBlocks(result?.answer ?? ""), [result?.answer]);
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

        <div className="mt-4 grid gap-3">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="min-h-32 w-full rounded-card border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            placeholder="Ejemplo: que tengo guardado sobre embeddings locales y Ollama"
          />

          <div className="flex flex-wrap gap-2">
            {visibleRecommendations.map((recommendation) => {
              const style = getRecommendationStyle(recommendation.type);
              return (
                <button
                  key={`chip-${recommendation.title}-${recommendation.suggestedQuestion}`}
                  type="button"
                  className={style.sourceClassName}
                  onClick={() => void handleAsk(recommendation.suggestedQuestion)}
                  disabled={loading}
                >
                  {recommendation.title}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {flagExploreChips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.key}
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  onClick={() => void handleAsk(chip.prompt)}
                  disabled={loading}
                >
                  <Icon className="h-4 w-4" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          <section className="grid gap-3 rounded-card border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-control border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
                onClick={() => setRecommendationsExpanded((current) => !current)}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Recomendaciones del asistente
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
                {recommendationsLoading ? "Cargando..." : "Nuevas recomendaciones"}
              </button>
            </div>

            {recommendationsExpanded ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visibleRecommendations.map((recommendation) => (
                (() => {
                  const style = getRecommendationStyle(recommendation.type);
                  const Icon = style.icon;
                  return (
                    <article
                      key={`${recommendation.title}-${recommendation.suggestedQuestion}`}
                      className={`relative flex h-full flex-col rounded-card border p-4 shadow-sm ${style.cardClassName}`}
                    >
                      <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-current shadow-sm">
                        <Icon className={`h-4 w-4 ${recommendation.type === "OPTIMIZE" ? "text-rose-600" : "text-violet-600"}`} />
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                          recommendation.type === "OPTIMIZE"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {recommendation.type === "OPTIMIZE" ? "Optimizar" : "Explorar"}
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
                            onClick={() => void handleAsk(recommendation.suggestedQuestion)}
                            disabled={loading}
                          >
                            {recommendation.type === "OPTIMIZE" ? "Optimizar esto" : "Explorar esto"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })()
              ))}
            </div>
              ) : null}
          </section>

          {collections.length > 0 || collectionsLoading ? (
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
                            onClick={() => void handleAsk(collection.suggestedQuestion)}
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
              {loading ? "Consultando..." : "Preguntar"}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-card border border-rose-200 bg-rose-50 p-4 shadow-card">
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </section>
      ) : null}

      {result ? (
        <>
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

          <section className="rounded-card border border-[#F0F0F0] bg-white/85 p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Respuesta</p>
            <div className="mt-4 grid gap-3">
              {answerBlocks.map((block, index) => {
                if (block.type === "list") {
                  return (
                    <article key={`answer-list-${index}`} className="rounded-card border border-slate-200 bg-slate-50 p-4">
                      <ul className="grid gap-2">
                        {block.items.map((item) => (
                          <li key={`${index}-${item}`} className="flex gap-3 text-sm leading-6 text-slate-800">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                }

                if (block.type === "callout") {
                  return (
                    <article key={`answer-callout-${index}`} className="rounded-card border border-teal-200 bg-teal-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">{block.label}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-800">{block.content}</p>
                    </article>
                  );
                }

                return (
                  <article key={`answer-paragraph-${index}`} className="rounded-card border border-slate-200 bg-white p-4">
                    <p className="text-sm leading-7 text-slate-800">{block.content}</p>
                  </article>
                );
              })}
            </div>
          </section>

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
                  <p className="mt-2 text-sm leading-6 text-slate-700">{source.snippet}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        emptyState
      )}
    </div>
  );
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
        content: lines.slice(1).join(" "),
      };
    }

    return {
      type: "paragraph",
      content: lines.join(" "),
    };
  });
}
