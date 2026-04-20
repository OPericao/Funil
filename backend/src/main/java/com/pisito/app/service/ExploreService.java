package com.pisito.app.service;

import com.pisito.app.controller.dto.entry.EntryResponse;
import com.pisito.app.controller.dto.explore.ExploreActiveChipRequest;
import com.pisito.app.controller.dto.explore.ExploreAskRequest;
import com.pisito.app.controller.dto.explore.ExploreAnswerResponse;
import com.pisito.app.controller.dto.explore.ExploreCollectionItemResponse;
import com.pisito.app.controller.dto.explore.ExploreCollectionsResponse;
import com.pisito.app.controller.dto.explore.ExploreConversationTurnRequest;
import com.pisito.app.controller.dto.explore.ExploreRecommendationItemResponse;
import com.pisito.app.controller.dto.explore.ExploreRecommendationsResponse;
import com.pisito.app.controller.dto.explore.ExploreSourceResponse;
import com.pisito.app.controller.dto.explore.ExploreSuggestionsResponse;
import com.pisito.app.controller.dto.resource.ResourceResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ExploreService {

    private static final int RECOMMENDATION_SEED_LIMIT = 4;
    private static final int RECOMMENDATION_CONTEXT_LIMIT = 6;
    private static final int RECOMMENDATION_NEIGHBORS_PER_SEED = 2;
    private static final int RECOMMENDATION_CACHE_MAX_ENTRIES = 256;
    private static final Duration RECOMMENDATION_CACHE_TTL = Duration.ofMinutes(20);

    private final EntryService entryService;
    private final OllamaService ollamaService;
    private final ConcurrentHashMap<String, CachedRecommendations> recommendationCache = new ConcurrentHashMap<>();

    public ExploreService(EntryService entryService, OllamaService ollamaService) {
        this.entryService = entryService;
        this.ollamaService = ollamaService;
    }

    @Transactional(readOnly = true)
    public ExploreAnswerResponse ask(Long userId, ExploreAskRequest request) {
        String question = trimRequired(request.getQuestion(), "question is required");
        List<EntryResponse> relevantEntries = resolveContextEntries(userId, question, request);

        if (relevantEntries.isEmpty()) {
            return new ExploreAnswerResponse(
                question,
                "No encontre notas suficientemente relacionadas en tu base para responder con confianza.",
                List.of()
            );
        }

        List<ExploreSourceResponse> sources = relevantEntries.stream()
            .map(this::toSource)
            .toList();

        try {
            String answer = sanitizeAnswerMarkdown(ollamaService.generate(buildAnswerPrompt(question, relevantEntries, request)));
            return new ExploreAnswerResponse(question, answer, sources);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() == HttpStatus.BAD_GATEWAY.value()) {
                return new ExploreAnswerResponse(
                    question,
                    "No pude consultar Ollama ahora mismo. Estas son las notas mas relevantes que encontre.",
                    sources
                );
            }
            throw ex;
        }
    }

    @Transactional(readOnly = true)
    public ExploreSuggestionsResponse suggestions(Long userId) {
        List<EntryResponse> entries = entryService.findAll(userId).stream()
            .limit(10)
            .toList();

        if (entries.isEmpty()) {
            return new ExploreSuggestionsResponse(List.of(
                "Que temas estoy guardando ultimamente",
                "Que conexiones interesantes hay en mis notas",
                "Que deberia descubrir despues",
                "Que merece la pena profundizar primero"
            ));
        }

        try {
            String rawResponse = ollamaService.generate(buildSuggestionsPrompt(entries));
            List<String> parsedSuggestions = parseSuggestions(rawResponse);
            if (!parsedSuggestions.isEmpty()) {
                return new ExploreSuggestionsResponse(parsedSuggestions);
            }
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() != HttpStatus.BAD_GATEWAY.value()) {
                throw ex;
            }
        }

        return new ExploreSuggestionsResponse(buildFallbackSuggestions(entries));
    }

    @Transactional
    public ExploreRecommendationsResponse recommendations(Long userId, String refreshToken) {
        List<EntryResponse> allEntries = entryService.findAll(userId);
        List<EntryResponse> entries = buildRecommendationContext(userId, allEntries, refreshToken);

        if (entries.isEmpty()) {
            return new ExploreRecommendationsResponse(List.of());
        }
        boolean refreshRequest = isRefreshRequest(refreshToken);
        String cacheKey = buildRecommendationCacheKey(userId, entries);
        CachedRecommendations cached = refreshRequest ? null : readRecommendationCache(cacheKey);
        if (cached != null) {
            return new ExploreRecommendationsResponse(cached.recommendations());
        }

        try {
            List<ExploreRecommendationItemResponse> generated = generateRecommendations(entries, refreshToken);
            if (!generated.isEmpty()) {
                if (!refreshRequest && generated.size() == 4) {
                    writeRecommendationCache(cacheKey, generated);
                }
                return new ExploreRecommendationsResponse(generated);
            }
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() != HttpStatus.BAD_GATEWAY.value()) {
                throw ex;
            }
        }

        if (cached != null) {
            return new ExploreRecommendationsResponse(cached.recommendations());
        }

        return new ExploreRecommendationsResponse(List.of());
    }

    private List<ExploreRecommendationItemResponse> generateRecommendations(List<EntryResponse> entries, String refreshToken) {
        List<ExploreRecommendationItemResponse> collected = new ArrayList<>();

        for (int attempt = 0; attempt < 3 && collected.size() < 4; attempt += 1) {
            int missing = 4 - collected.size();
            String rawResponse = ollamaService.generate(
                buildRecommendationsPrompt(entries, appendRecommendationAttemptSeed(refreshToken, attempt), collected, missing)
            );
            List<ExploreRecommendationItemResponse> parsedRecommendations = parseRecommendations(rawResponse, entries);
            if (parsedRecommendations.isEmpty()) {
                continue;
            }
            collected = rebalanceRecommendations(mergeRecommendations(collected, parsedRecommendations), List.of(), refreshToken);
        }

        return collected.stream().limit(4).toList();
    }

    @Transactional(readOnly = true)
    public ExploreCollectionsResponse collections(Long userId) {
        List<EntryResponse> entries = entryService.findAll(userId);
        if (entries.isEmpty()) {
            return new ExploreCollectionsResponse(List.of());
        }

        List<String> topics = extractTopics(entries);
        List<ExploreCollectionItemResponse> collections = new ArrayList<>();

        for (String topic : topics.stream().limit(2).toList()) {
            List<ExploreSourceResponse> sources = findSourcesForTopic(entries, topic);
            if (sources.size() >= 2) {
                collections.add(new ExploreCollectionItemResponse(
                    "THEME",
                    topic,
                    "Bloque tematico para entrar rapido en un foco repetido de tu base.",
                    "Ayudame a explorar lo mas importante sobre " + topic,
                    sources.size(),
                    sources
                ));
            }
        }

        List<ExploreSourceResponse> recentSources = entries.stream().limit(3).map(this::toSource).toList();
        if (!recentSources.isEmpty()) {
            collections.add(new ExploreCollectionItemResponse(
                "RECENT",
                "Lo ultimo que guardaste",
                "Un bloque corto para retomar rapido tus notas mas recientes.",
                "Que merece la pena explorar primero de lo ultimo que he guardado",
                recentSources.size(),
                recentSources
            ));
        }

        if (topics.size() >= 2) {
            String leftTopic = topics.get(0);
            String rightTopic = topics.get(1);
            List<ExploreSourceResponse> sources = new ArrayList<>();
            sources.addAll(findSourcesForTopic(entries, leftTopic).stream().limit(2).toList());
            sources.addAll(findSourcesForTopic(entries, rightTopic).stream().limit(2).toList());
            List<ExploreSourceResponse> distinctSources = dedupeSources(sources).stream().limit(4).toList();

            if (distinctSources.size() >= 2) {
                collections.add(new ExploreCollectionItemResponse(
                    "BRIDGE",
                    leftTopic + " y " + rightTopic,
                    "Cruce entre dos zonas de tu base para encontrar relaciones utiles.",
                    "Como se conectan " + leftTopic + " y " + rightTopic + " en mis notas",
                    distinctSources.size(),
                    distinctSources
                ));
            }
        }

        List<ExploreCollectionItemResponse> uniqueCollections = collections.stream()
            .collect(Collectors.toMap(
                item -> normalizeForLookup(item.kind() + "-" + item.title()),
                Function.identity(),
                (left, _right) -> left,
                LinkedHashMap::new
            ))
            .values()
            .stream()
            .limit(4)
            .toList();

        return new ExploreCollectionsResponse(uniqueCollections);
    }

    private List<EntryResponse> resolveContextEntries(Long userId, String question, ExploreAskRequest request) {
        Map<Long, EntryResponse> entriesById = new LinkedHashMap<>();
        boolean hasExplicitSources = request.getSourceEntryIds() != null && !request.getSourceEntryIds().isEmpty();

        for (Long sourceEntryId : request.getSourceEntryIds()) {
            if (sourceEntryId == null) {
                continue;
            }
            try {
                EntryResponse entry = entryService.findById(userId, sourceEntryId);
                entriesById.put(entry.id(), entry);
            } catch (ResponseStatusException ex) {
                if (ex.getStatusCode().value() != HttpStatus.NOT_FOUND.value()) {
                    throw ex;
                }
            }
        }

        if (!entriesById.isEmpty()) {
            return entriesById.values().stream().limit(8).toList();
        }

        if (hasExplicitSources) {
            return List.of();
        }

        List<EntryResponse> focusedSearch = rankForSingleTopic(entryService.search(userId, question), question);
        addEntries(entriesById, focusedSearch, 1);

        ExploreActiveChipRequest activeChip = request.getActiveChip();
        if (entriesById.isEmpty() && activeChip != null) {
            if (StringUtils.hasText(activeChip.getTitle())) {
                addEntries(entriesById, rankForSingleTopic(entryService.search(userId, activeChip.getTitle()), activeChip.getTitle()), 1);
            }
            if (entriesById.isEmpty() && StringUtils.hasText(activeChip.getSuggestedQuestion())) {
                addEntries(
                    entriesById,
                    rankForSingleTopic(entryService.search(userId, activeChip.getSuggestedQuestion()), activeChip.getSuggestedQuestion()),
                    1
                );
            }
        }

        return entriesById.values().stream().limit(1).toList();
    }

    private void addEntries(Map<Long, EntryResponse> entriesById, List<EntryResponse> candidates, int limit) {
        if (candidates == null || candidates.isEmpty()) {
            return;
        }

        candidates.stream()
            .limit(limit)
            .forEach(entry -> entriesById.putIfAbsent(entry.id(), entry));
    }

    private String buildAnswerPrompt(String question, List<EntryResponse> entries, ExploreAskRequest request) {
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un asistente de exploracion para una base personal de notas.

            Reglas:
            - Usa las notas proporcionadas como punto de partida, no como limite.
            - Si el usuario ha elegido notas manualmente como contexto, usa solo esas notas como base de la respuesta.
            - Trata esta respuesta como un hilo centrado en una sola nota o un solo foco tematico.
            - Si hay historial, continua el mismo tema; no abras temas nuevos ni saltes a otras notas no relacionadas.
            - Puedes aportar informacion externa, variantes, contexto, ejemplos, ideas y conocimiento general aunque no aparezcan en la nota.
            - Si una parte sale claramente de la nota, citala por su titulo exacto entre comillas angulares, por ejemplo «Titulo de la nota».
            - Si una parte es aporte externo, propuesta o conocimiento general, presentala como ampliacion util y natural, no como una disculpa.
            - No digas que no puedes responder solo porque la nota sea breve. Si la nota marca un tema claro, desarrolla ese tema con conocimiento externo.
            - No inventes que una nota contiene algo que no contiene, pero si puedes expandirla con ideas de fuera.
            - No uses las notas como excusa para hablar de otra cosa remotamente relacionada.
            - Cuando encaje, no te limites a responder de forma plana: propone complementos concretos dentro del mismo tema.
            - Ejemplos de complementos validos: que escuchar despues, que leer despues, que cocinar al lado, como equilibrar nutrientes, variantes cercanas, siguiente paso practico.
            - Esos complementos deben ser especificos y utiles, no una lista vacia de posibilidades.
            - Responde en markdown simple y legible.
            - Usa titulos breves con ## o ### solo cuando ayuden a ordenar la respuesta.
            - Usa listas con - cuando enumeres ideas, pasos, opciones o ejemplos.
            - Mantén los parrafos cortos y evita bloques enormes de texto.
            - Si incluyes codigo, usa bloques ``` solo para codigo real.
            - No envuelvas toda la respuesta en un unico bloque ```markdown.
            - No uses tablas salvo que el usuario las pida de forma clara.
            - No añadas una introduccion vacia ni frases de relleno.
            """);

        ExploreActiveChipRequest activeChip = request.getActiveChip();
        if (activeChip != null) {
            builder.append("\nChip activo:\n");
            if (StringUtils.hasText(activeChip.getType())) {
                builder.append("- Tipo: ").append(activeChip.getType().trim()).append("\n");
            }
            if (StringUtils.hasText(activeChip.getTitle())) {
                builder.append("- Titulo: ").append(activeChip.getTitle().trim()).append("\n");
            }
            if (StringUtils.hasText(activeChip.getDescription())) {
                builder.append("- Enfoque: ").append(activeChip.getDescription().trim()).append("\n");
            }
            if (StringUtils.hasText(activeChip.getSuggestedQuestion())) {
                builder.append("- Pregunta inicial: ").append(activeChip.getSuggestedQuestion().trim()).append("\n");
            }
        }

        List<ExploreConversationTurnRequest> history = sanitizeHistory(request.getHistory());
        if (!history.isEmpty()) {
            builder.append("\nHistorial reciente:\n");
            for (ExploreConversationTurnRequest turn : history) {
                builder.append("- ")
                    .append(normalizeConversationRole(turn.getRole()))
                    .append(": ")
                    .append(turn.getContent().trim())
                    .append("\n");
            }
        }

        builder.append("\nPregunta actual:\n");
        builder.append(question).append("\n\n");
        builder.append("Notas relevantes:\n");

        for (int index = 0; index < entries.size(); index += 1) {
            EntryResponse entry = entries.get(index);
            builder.append(index + 1)
                .append(". [")
                .append(entry.title())
                .append("] ")
                .append(buildDetailedSnippet(entry))
                .append("\n");
        }

        builder.append("\nRespuesta:");
        return builder.toString();
    }

    private String buildRecommendationsPrompt(
        List<EntryResponse> entries,
        String refreshToken,
        List<ExploreRecommendationItemResponse> existingRecommendations,
        int requestedCount
    ) {
        int safeRequestedCount = Math.max(1, Math.min(4, requestedCount));
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un motor de chips para explorar una base personal de conocimiento.
            Tu trabajo es detectar oportunidades interesantes a partir de notas concretas.

            Devuelve exactamente %d chips NUEVOS en espanol usando este formato exacto:
            TYPE: EXPLORE o OPTIMIZE
            KIND: DEEPEN, VARIANT, COMPLEMENT, NEXT o OPTIMIZE
            TITLE: maximo 6 palabras
            DESCRIPTION: una explicacion concreta de por que este chip aporta valor
            QUESTION: una pregunta o peticion lista para lanzar al asistente
            SOURCES: titulo exacto de una sola nota
            END

            Mezcla intenciones cuando tenga sentido:
            - descubrir algo nuevo relacionado
            - profundizar en una variante o enfoque mas especifico
            - complementar una nota con algo que le falta
            - conectar ideas entre notas
            - convertir algo en siguiente paso practico

            Reglas:
            - Cada chip debe estar anclado a una sola nota concreta de la lista.
            - No mezcles ni relaciones dos notas dentro de la misma chip.
            - No intentes cubrir todas las notas ni todos los temas a la vez.
            - Piensa en una bolsa desordenada y util de opciones: puedes concentrarte en 1 o 2 notas prometedoras y sacar varios angulos distintos.
            - Pero no dejes que una sola nota monopolice toda la tanda si hay otras notas interesantes disponibles.
            - No hagas chips genericos como "Profundiza aqui", "Variante posible", "Descubre mas" o similares.
            - El TITLE debe insinuar la nota o el foco concreto, no sonar a plantilla abstracta.
            - El KIND debe reflejar la naturaleza principal de la chip.
            - La QUESTION debe mencionar el tema concreto de esa nota o su titulo si hace falta.
            - No te encierres en dominios faciles. Si las notas hablan de animales, ciencia, cocina, historia,
              software o cualquier otro tema, adapta los chips a ese dominio.
            - Los 4 chips deben priorizar expansion, descubrimiento o profundizacion.
            - Intenta que al menos 3 chips aporten informacion nueva o direcciones nuevas, no solo reorganicen lo ya guardado.
            - Si detectas una nota muy concreta, puedes proponer un chip de complemento y otro de variante.
            - Intenta que la tanda no salga monotona: mezcla profundizacion, variante, complemento y siguiente paso si encaja.
            - Siempre que sea razonable, incluye al menos una chip de complemento y una de siguiente paso o actividad.
            - Para musica, piensa en escucha siguiente, artista cercano, album complementario o contexto.
            - Para comida, piensa en acompaniamientos, equilibrio nutricional, tecnica, variaciones o ingredientes.
            - Para viajes, piensa en actividades, barrios, ritmos, planes y lugares que complementen el viaje.
            - TITLE debe sonar a chip corto y accionable, pero ligado a un contenido concreto.
            - QUESTION debe ser especifica y util.
            - SOURCES debe usar solo titulos exactos de la lista.
            - Usa TYPE=EXPLORE por defecto. Solo usa TYPE=OPTIMIZE si no encuentras una expansion interesante mejor.
            - Usa la semilla %s solo para variar el enfoque y evitar repeticiones.
            - Debes devolver exactamente %d bloques END validos.
            - No repitas chips ya generadas antes.
            - No repitas ni el mismo TITLE ni la misma QUESTION ya usada.
            - Si una nota ya tiene una chip valida, intenta sacar otro angulo distinto antes de repetirla.

            Notas disponibles:
            """.formatted(safeRequestedCount, refreshToken == null ? "base" : refreshToken, safeRequestedCount));

        if (!existingRecommendations.isEmpty()) {
            builder.append("\nChips ya generadas que NO puedes repetir:\n");
            for (int index = 0; index < existingRecommendations.size(); index += 1) {
                ExploreRecommendationItemResponse recommendation = existingRecommendations.get(index);
                String sourceTitle = recommendation.sources().isEmpty()
                    ? "sin fuente"
                    : recommendation.sources().getFirst().title();
                builder.append(index + 1)
                    .append(". KIND: ")
                    .append(recommendation.kind())
                    .append(" | TITLE: ")
                    .append(recommendation.title())
                    .append(" | QUESTION: ")
                    .append(recommendation.suggestedQuestion())
                    .append(" | SOURCE: ")
                    .append(sourceTitle)
                    .append("\n");
            }
        }

        for (int index = 0; index < entries.size(); index += 1) {
            EntryResponse entry = entries.get(index);
            builder.append(index + 1)
                .append(". Titulo: ")
                .append(entry.title());

            String tags = entry.tags().stream()
                .map(tag -> tag.name())
                .filter(StringUtils::hasText)
                .collect(Collectors.joining(", "));
            if (StringUtils.hasText(tags)) {
                builder.append(" | Tags: ").append(tags);
            }

            builder.append(" | Contenido: ").append(buildDetailedSnippet(entry)).append("\n");
        }

        builder.append("\nChips:");
        return builder.toString();
    }

    private String appendRecommendationAttemptSeed(String refreshToken, int attempt) {
        String baseSeed = StringUtils.hasText(refreshToken) ? refreshToken.trim() : "base";
        if (attempt <= 0) {
            return baseSeed;
        }
        return baseSeed + "-retry-" + attempt;
    }

    private String buildSuggestionsPrompt(List<EntryResponse> entries) {
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un asistente que propone preguntas breves y utiles para explorar una base personal de notas.
            Devuelve exactamente 4 sugerencias en espanol.
            Reglas:
            - Cada sugerencia debe ser una sola pregunta corta.
            - No repitas ideas.
            - Mezcla resumir, conectar, descubrir y profundizar.
            - Usa temas reales de las notas.
            - No expliques nada mas.

            Notas:
            """);

        for (int index = 0; index < entries.size(); index += 1) {
            EntryResponse entry = entries.get(index);
            builder.append(index + 1)
                .append(". ")
                .append(entry.title())
                .append(" | ")
                .append(buildSnippet(entry))
                .append("\n");
        }

        builder.append("\nSugerencias:");
        return builder.toString();
    }

    private List<ExploreRecommendationItemResponse> buildFallbackRecommendations(List<EntryResponse> entries) {
        List<ExploreRecommendationItemResponse> recommendations = new ArrayList<>();
        List<EntryResponse> focusEntries = entries.stream().limit(4).toList();

        if (focusEntries.isEmpty()) {
            return List.of();
        }

        EntryResponse firstEntry = focusEntries.getFirst();
        recommendations.add(buildFallbackRecommendation(firstEntry, buildConcreteChipTitle(firstEntry.title()), "DEEPEN"));
        EntryResponse secondEntry = focusEntries.size() >= 2 ? focusEntries.get(1) : firstEntry;
        EntryResponse thirdEntry = focusEntries.size() >= 3 ? focusEntries.get(2) : secondEntry;
        EntryResponse fourthEntry = focusEntries.size() >= 4 ? focusEntries.get(3) : secondEntry;

        recommendations.add(buildFallbackRecommendation(secondEntry, buildConcreteChipTitle(secondEntry.title()), "COMPLEMENT"));
        recommendations.add(buildFallbackRecommendation(thirdEntry, buildConcreteChipTitle(thirdEntry.title()), "NEXT"));
        recommendations.add(buildFallbackRecommendation(fourthEntry, buildConcreteChipTitle(fourthEntry.title()), "VARIANT"));

        return recommendations.stream().limit(4).toList();
    }

    private ExploreRecommendationItemResponse buildFallbackRecommendation(EntryResponse entry, String shortTitle, String flavor) {
        return switch (flavor) {
            case "VARIANT" -> new ExploreRecommendationItemResponse(
                "EXPLORE",
                "VARIANT",
                "Variante " + shortTitle,
                "Abre una variante cercana de esta nota sin perder el foco principal.",
                "A partir de [" + entry.title() + "], dame una variante cercana y util dentro del mismo tema",
                List.of(toSource(entry))
            );
            case "COMPLEMENT" -> new ExploreRecommendationItemResponse(
                "EXPLORE",
                "COMPLEMENT",
                "Complementa " + shortTitle,
                "Busca una pieza externa que complemente bien lo que ya aparece en esta nota.",
                buildComplementQuestion(entry),
                List.of(toSource(entry))
            );
            case "NEXT" -> new ExploreRecommendationItemResponse(
                "EXPLORE",
                "NEXT",
                "Despues de " + shortTitle,
                "Convierte esta nota en una siguiente accion, consumo o descubrimiento concreto.",
                buildNextQuestion(entry),
                List.of(toSource(entry))
            );
            default -> new ExploreRecommendationItemResponse(
                "EXPLORE",
                "DEEPEN",
                "Profundiza " + shortTitle,
                "Usa esta nota como puerta de entrada para sacar una linea mas concreta de exploracion.",
                "A partir de [" + entry.title() + "], ayudame a profundizar en esa nota sin salir de su tema",
                List.of(toSource(entry))
            );
        };
    }

    private List<ExploreRecommendationItemResponse> completeRecommendations(
        List<ExploreRecommendationItemResponse> parsedRecommendations,
        List<ExploreRecommendationItemResponse> fallbackRecommendations
    ) {
        Map<String, ExploreRecommendationItemResponse> merged = new LinkedHashMap<>();

        for (ExploreRecommendationItemResponse recommendation : parsedRecommendations) {
            merged.putIfAbsent(normalizeRecommendationKey(recommendation), recommendation);
            if (merged.size() == 4) {
                return new ArrayList<>(merged.values());
            }
        }

        for (ExploreRecommendationItemResponse recommendation : fallbackRecommendations) {
            merged.putIfAbsent(normalizeRecommendationKey(recommendation), recommendation);
            if (merged.size() == 4) {
                break;
            }
        }

        List<ExploreRecommendationItemResponse> completed = new ArrayList<>(merged.values());
        ensureFlavorPresence(completed, fallbackRecommendations, "COMPLEMENT");
        ensureFlavorPresence(completed, fallbackRecommendations, "NEXT");

        return completed.stream().limit(4).toList();
    }

    private List<ExploreRecommendationItemResponse> mergeRecommendations(
        List<ExploreRecommendationItemResponse> currentRecommendations,
        List<ExploreRecommendationItemResponse> newRecommendations
    ) {
        Map<String, ExploreRecommendationItemResponse> merged = new LinkedHashMap<>();

        for (ExploreRecommendationItemResponse recommendation : currentRecommendations) {
            merged.putIfAbsent(normalizeRecommendationKey(recommendation), recommendation);
        }

        for (ExploreRecommendationItemResponse recommendation : newRecommendations) {
            merged.putIfAbsent(normalizeRecommendationKey(recommendation), recommendation);
            if (merged.size() == 4) {
                break;
            }
        }

        return new ArrayList<>(merged.values());
    }

    private List<ExploreRecommendationItemResponse> rebalanceRecommendations(
        List<ExploreRecommendationItemResponse> recommendations,
        List<ExploreRecommendationItemResponse> fallbackRecommendations,
        String refreshToken
    ) {
        List<ExploreRecommendationItemResponse> balanced = new ArrayList<>();
        Map<Long, Integer> sourceUsage = new LinkedHashMap<>();
        int maxUsagePerSource = isRefreshRequest(refreshToken) ? 2 : 3;

        for (ExploreRecommendationItemResponse recommendation : recommendations) {
            Long sourceEntryId = recommendation.sources().isEmpty() ? null : recommendation.sources().getFirst().entryId();
            int currentUsage = sourceEntryId == null ? 0 : sourceUsage.getOrDefault(sourceEntryId, 0);
            if (sourceEntryId != null && currentUsage >= maxUsagePerSource) {
                continue;
            }
            balanced.add(recommendation);
            if (sourceEntryId != null) {
                sourceUsage.put(sourceEntryId, currentUsage + 1);
            }
            if (balanced.size() == 4) {
                return balanced;
            }
        }

        for (ExploreRecommendationItemResponse recommendation : fallbackRecommendations) {
            if (balanced.stream().anyMatch(item -> normalizeRecommendationKey(item).equals(normalizeRecommendationKey(recommendation)))) {
                continue;
            }
            Long sourceEntryId = recommendation.sources().isEmpty() ? null : recommendation.sources().getFirst().entryId();
            int currentUsage = sourceEntryId == null ? 0 : sourceUsage.getOrDefault(sourceEntryId, 0);
            if (sourceEntryId != null && currentUsage >= maxUsagePerSource) {
                continue;
            }
            balanced.add(recommendation);
            if (sourceEntryId != null) {
                sourceUsage.put(sourceEntryId, currentUsage + 1);
            }
            if (balanced.size() == 4) {
                break;
            }
        }

        return balanced;
    }

    private List<ExploreRecommendationItemResponse> parseRecommendations(String rawResponse, List<EntryResponse> entries) {
        if (!StringUtils.hasText(rawResponse)) {
            return List.of();
        }

        Map<String, ExploreSourceResponse> sourcesByTitle = entries.stream()
            .map(this::toSource)
            .collect(Collectors.toMap(
                source -> normalizeForLookup(source.title()),
                Function.identity(),
                (left, _right) -> left
            ));

        List<ExploreRecommendationItemResponse> recommendations = new ArrayList<>();
        String[] blocks = rawResponse.split("(?m)^END\\s*$");

        for (String block : blocks) {
            String type = extractField(block, "TYPE:");
            String kind = extractField(block, "KIND:");
            String title = extractField(block, "TITLE:");
            String description = extractField(block, "DESCRIPTION:");
            String question = extractField(block, "QUESTION:");
            String sourcesRaw = extractField(block, "SOURCES:");

            String normalizedType = normalizeRecommendationType(type);
            String normalizedKind = normalizeRecommendationKind(kind);
            if (!StringUtils.hasText(normalizedType)
                || !StringUtils.hasText(title)
                || !StringUtils.hasText(description)
                || !StringUtils.hasText(question)) {
                continue;
            }

            List<ExploreSourceResponse> sources = Arrays.stream((sourcesRaw == null ? "" : sourcesRaw).split("\\|"))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(this::normalizeForLookup)
                .map(sourcesByTitle::get)
                .filter(item -> item != null)
                .distinct()
                .limit(1)
                .toList();

            if (sources.isEmpty()) {
                continue;
            }

            recommendations.add(new ExploreRecommendationItemResponse(
                normalizedType,
                StringUtils.hasText(normalizedKind)
                    ? normalizedKind
                    : inferRecommendationKind(normalizedType, title, description, question),
                truncateChipTitle(title),
                description.trim(),
                question.trim(),
                sources
            ));

            if (recommendations.size() == 4) {
                break;
            }
        }

        return recommendations;
    }

    private List<String> parseSuggestions(String rawResponse) {
        if (!StringUtils.hasText(rawResponse)) {
            return List.of();
        }

        Set<String> suggestions = new LinkedHashSet<>();
        for (String line : rawResponse.split("\\R")) {
            String cleaned = line
                .replaceFirst("^\\s*[-*]+\\s*", "")
                .replaceFirst("^\\s*\\d+[.)-]?\\s*", "")
                .trim();
            if (!StringUtils.hasText(cleaned)) {
                continue;
            }
            suggestions.add(cleaned);
            if (suggestions.size() == 4) {
                break;
            }
        }

        return suggestions.stream().toList();
    }

    private List<String> buildFallbackSuggestions(List<EntryResponse> entries) {
        List<String> topics = extractTopics(entries);
        Set<String> suggestions = new LinkedHashSet<>();

        if (!topics.isEmpty()) {
            suggestions.add("Resume lo mas importante sobre " + topics.getFirst());
            suggestions.add("Que deberia descubrir despues sobre " + topics.getFirst());
        }
        if (topics.size() >= 2) {
            suggestions.add("Como se relacionan " + topics.get(0) + " y " + topics.get(1));
        }

        suggestions.add("Que merece la pena profundizar ahora");
        return suggestions.stream().limit(4).toList();
    }

    private List<ExploreConversationTurnRequest> sanitizeHistory(List<ExploreConversationTurnRequest> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }

        int skip = Math.max(0, history.size() - 10);

        return history.stream()
            .skip(skip)
            .filter(item -> item != null && StringUtils.hasText(item.getRole()) && StringUtils.hasText(item.getContent()))
            .map(item -> {
                ExploreConversationTurnRequest sanitized = new ExploreConversationTurnRequest();
                sanitized.setRole(normalizeConversationRole(item.getRole()));
                sanitized.setContent(item.getContent().trim());
                return sanitized;
            })
            .toList();
    }

    private String normalizeConversationRole(String role) {
        String normalized = normalizeForLookup(role);
        if ("assistant".equals(normalized) || "asistente".equals(normalized)) {
            return "assistant";
        }
        return "user";
    }

    private List<String> extractTopics(List<EntryResponse> entries) {
        Map<String, Integer> scores = new LinkedHashMap<>();
        Map<String, String> labels = new LinkedHashMap<>();

        for (EntryResponse entry : entries) {
            for (String tagName : entry.tags().stream().map(tag -> tag.name()).toList()) {
                addTopicScore(scores, labels, tagName, 5);
            }

            Arrays.stream(entry.title().split("[,|:/\\-]"))
                .map(this::trimTopic)
                .forEach(topic -> addTopicScore(scores, labels, topic, 3));

            for (ResourceResponse resource : entry.resources()) {
                addTopicScore(scores, labels, resource.title(), 2);
                addTopicScore(scores, labels, resource.siteName(), 1);
            }
        }

        return scores.entrySet().stream()
            .sorted((left, right) -> Integer.compare(right.getValue(), left.getValue()))
            .map(entry -> labels.getOrDefault(entry.getKey(), entry.getKey()))
            .limit(5)
            .toList();
    }

    private List<ExploreSourceResponse> findSourcesForTopic(List<EntryResponse> entries, String topic) {
        String normalizedTopic = normalizeForLookup(topic);
        return entries.stream()
            .filter(entry -> entryMatchesTopic(entry, normalizedTopic))
            .limit(3)
            .map(this::toSource)
            .toList();
    }

    private List<EntryResponse> selectBalancedRecommendationEntries(List<EntryResponse> entries, String refreshToken, int limit) {
        if (entries == null || entries.isEmpty()) {
            return List.of();
        }

        int safeLimit = Math.max(1, limit);
        List<EntryResponse> candidates = rotateEntriesForRefresh(entries, refreshToken);
        List<EntryResponse> selected = new ArrayList<>();
        Map<String, Integer> topicUsage = new LinkedHashMap<>();

        for (EntryResponse entry : candidates) {
            String topicKey = deriveRecommendationTopicKey(entry);
            if (topicUsage.getOrDefault(topicKey, 0) >= 1) {
                continue;
            }
            selected.add(entry);
            topicUsage.merge(topicKey, 1, Integer::sum);
            if (selected.size() == safeLimit) {
                return selected;
            }
        }

        for (EntryResponse entry : candidates) {
            if (selected.stream().anyMatch(item -> item.id().equals(entry.id()))) {
                continue;
            }
            String topicKey = deriveRecommendationTopicKey(entry);
            if (topicUsage.getOrDefault(topicKey, 0) >= 2) {
                continue;
            }
            selected.add(entry);
            topicUsage.merge(topicKey, 1, Integer::sum);
            if (selected.size() == safeLimit) {
                break;
            }
        }

        return selected;
    }

    private List<EntryResponse> buildRecommendationContext(Long userId, List<EntryResponse> allEntries, String refreshToken) {
        List<EntryResponse> seeds = selectBalancedRecommendationEntries(allEntries, refreshToken, RECOMMENDATION_SEED_LIMIT);
        if (seeds.isEmpty()) {
            return List.of();
        }

        Map<Long, EntryResponse> byId = allEntries.stream()
            .collect(Collectors.toMap(
                EntryResponse::id,
                Function.identity(),
                (left, _right) -> left,
                LinkedHashMap::new
            ));

        Map<Long, EntryResponse> context = new LinkedHashMap<>();
        seeds.forEach(entry -> context.put(entry.id(), entry));

        for (EntryResponse seed : seeds) {
            List<EntryResponse> neighbors = entryService.findSemanticNeighbors(userId, seed.id(), RECOMMENDATION_NEIGHBORS_PER_SEED);
            for (EntryResponse neighbor : neighbors) {
                EntryResponse resolved = byId.getOrDefault(neighbor.id(), neighbor);
                context.putIfAbsent(resolved.id(), resolved);
                if (context.size() >= RECOMMENDATION_CONTEXT_LIMIT * 2) {
                    return selectBalancedRecommendationEntries(new ArrayList<>(context.values()), refreshToken, RECOMMENDATION_CONTEXT_LIMIT);
                }
            }
        }

        return selectBalancedRecommendationEntries(new ArrayList<>(context.values()), refreshToken, RECOMMENDATION_CONTEXT_LIMIT);
    }

    private List<EntryResponse> rotateEntriesForRefresh(List<EntryResponse> entries, String refreshToken) {
        if (entries.isEmpty() || !isRefreshRequest(refreshToken)) {
            return entries;
        }

        int offset = Math.floorMod(refreshToken.hashCode(), entries.size());
        List<EntryResponse> rotated = new ArrayList<>(entries.size());
        for (int index = 0; index < entries.size(); index += 1) {
            rotated.add(entries.get((index + offset) % entries.size()));
        }
        return rotated;
    }

    private boolean isRefreshRequest(String refreshToken) {
        return StringUtils.hasText(refreshToken) && !"initial".equalsIgnoreCase(refreshToken.trim());
    }

    private String buildRecommendationCacheKey(Long userId, List<EntryResponse> entries) {
        String contextSignature = entries.stream()
            .map(entry -> entry.id() + ":" + String.valueOf(entry.updatedAt()))
            .collect(Collectors.joining("|"));
        return userId + "|" + contextSignature;
    }

    private CachedRecommendations readRecommendationCache(String cacheKey) {
        CachedRecommendations cached = recommendationCache.get(cacheKey);
        if (cached == null) {
            return null;
        }
        if (cached.createdAt().plus(RECOMMENDATION_CACHE_TTL).isBefore(Instant.now())) {
            recommendationCache.remove(cacheKey);
            return null;
        }
        return cached;
    }

    private void writeRecommendationCache(String cacheKey, List<ExploreRecommendationItemResponse> recommendations) {
        if (recommendations == null || recommendations.isEmpty()) {
            return;
        }

        if (recommendationCache.size() >= RECOMMENDATION_CACHE_MAX_ENTRIES) {
            pruneRecommendationCache();
        }
        recommendationCache.put(cacheKey, new CachedRecommendations(List.copyOf(recommendations), Instant.now()));
    }

    private void pruneRecommendationCache() {
        Instant now = Instant.now();
        recommendationCache.entrySet().removeIf(entry -> entry.getValue().createdAt().plus(RECOMMENDATION_CACHE_TTL).isBefore(now));

        if (recommendationCache.size() < RECOMMENDATION_CACHE_MAX_ENTRIES) {
            return;
        }

        recommendationCache.entrySet().stream()
            .sorted(Comparator.comparing(entry -> entry.getValue().createdAt()))
            .limit(Math.max(1, recommendationCache.size() - RECOMMENDATION_CACHE_MAX_ENTRIES + 1L))
            .map(Map.Entry::getKey)
            .toList()
            .forEach(recommendationCache::remove);
    }

    private String deriveRecommendationTopicKey(EntryResponse entry) {
        if (StringUtils.hasText(entry.processingCategory())) {
            return "category:" + normalizeForLookup(entry.processingCategory());
        }

        String firstTag = entry.tags().stream()
            .map(tag -> normalizeForLookup(tag.name()))
            .filter(StringUtils::hasText)
            .findFirst()
            .orElse(null);
        if (StringUtils.hasText(firstTag)) {
            return "tag:" + firstTag;
        }

        String[] tokens = normalizeForLookup(entry.title()).split("[^\\p{L}\\p{Nd}]+");
        for (String token : tokens) {
            if (token.length() >= 4 && !endsWithWeakTitleWord(token)) {
                return "title:" + token;
            }
        }

        return "entry:" + entry.id();
    }

    private boolean entryMatchesTopic(EntryResponse entry, String normalizedTopic) {
        return normalizeForLookup(entry.title()).contains(normalizedTopic)
            || normalizeForLookup(buildDetailedSnippet(entry)).contains(normalizedTopic)
            || entry.tags().stream().anyMatch(tag -> normalizeForLookup(tag.name()).contains(normalizedTopic));
    }

    private void addTopicScore(Map<String, Integer> scores, Map<String, String> labels, String rawTopic, int weight) {
        String topic = trimTopic(rawTopic);
        if (!StringUtils.hasText(topic)) {
            return;
        }
        String normalizedTopic = normalizeForLookup(topic);
        scores.merge(normalizedTopic, weight, Integer::sum);
        labels.putIfAbsent(normalizedTopic, topic);
    }

    private String buildSnippet(EntryResponse entry) {
        String snippet = buildDetailedSnippet(entry);
        return snippet.length() > 320 ? snippet.substring(0, 320).trim() + "..." : snippet;
    }

    private String buildDetailedSnippet(EntryResponse entry) {
        List<String> parts = new ArrayList<>();
        appendIfPresent(parts, entry.title());
        appendIfPresent(parts, entry.processingCategory());
        entry.tags().forEach(tag -> appendIfPresent(parts, tag.name()));
        entry.keyIdeas().forEach(value -> appendIfPresent(parts, value));
        entry.actions().forEach(value -> appendIfPresent(parts, value));

        for (ResourceResponse resource : entry.resources()) {
            appendIfPresent(parts, resource.title());
            appendIfPresent(parts, resource.textContent());
            appendIfPresent(parts, resource.description());
            appendIfPresent(parts, resource.contentPreview());
            appendIfPresent(parts, resource.siteName());
            appendIfPresent(parts, resource.url());
            appendIfPresent(parts, resource.fileName());
        }

        String snippet = parts.stream()
            .filter(StringUtils::hasText)
            .collect(Collectors.joining(" "))
            .replaceAll("\\s+", " ")
            .trim();

        return StringUtils.hasText(snippet) ? snippet : "Sin contenido adicional.";
    }

    private void appendIfPresent(List<String> parts, String value) {
        if (StringUtils.hasText(value)) {
            parts.add(value.trim());
        }
    }

    private ExploreSourceResponse toSource(EntryResponse entry) {
        return new ExploreSourceResponse(entry.id(), entry.title(), buildSnippet(entry));
    }

    private List<ExploreSourceResponse> dedupeSources(List<ExploreSourceResponse> sources) {
        return new ArrayList<>(sources.stream()
            .collect(Collectors.toMap(
                ExploreSourceResponse::entryId,
                Function.identity(),
                (left, _right) -> left,
                LinkedHashMap::new
            ))
            .values());
    }

    private String extractField(String block, String prefix) {
        return Arrays.stream(block.split("\\R"))
            .map(String::trim)
            .filter(line -> line.startsWith(prefix))
            .map(line -> line.substring(prefix.length()).trim())
            .filter(StringUtils::hasText)
            .findFirst()
            .orElse(null);
    }

    private String normalizeRecommendationType(String value) {
        String normalized = normalizeForLookup(value).toUpperCase(Locale.ROOT);
        if ("EXPLORE".equals(normalized) || "OPTIMIZE".equals(normalized)) {
            return normalized;
        }
        return null;
    }

    private String normalizeRecommendationKind(String value) {
        String normalized = normalizeForLookup(value).toUpperCase(Locale.ROOT);
        if (Set.of("DEEPEN", "VARIANT", "COMPLEMENT", "NEXT", "OPTIMIZE").contains(normalized)) {
            return normalized;
        }
        return null;
    }

    private String normalizeRecommendationKey(ExploreRecommendationItemResponse recommendation) {
        return normalizeForLookup(
            recommendation.type() + "|" + recommendation.kind() + "|" + recommendation.title() + "|" + recommendation.suggestedQuestion()
        );
    }

    private record CachedRecommendations(
        List<ExploreRecommendationItemResponse> recommendations,
        Instant createdAt
    ) {
    }

    private String inferRecommendationKind(String type, String title, String description, String question) {
        if ("OPTIMIZE".equals(type)) {
            return "OPTIMIZE";
        }

        String normalized = normalizeForLookup(title + " " + description + " " + question);
        if (normalized.contains("complement")) {
            return "COMPLEMENT";
        }
        if (normalized.contains("despues") || normalized.contains("continuacion") || normalized.contains("actividad")) {
            return "NEXT";
        }
        if (normalized.contains("variante")) {
            return "VARIANT";
        }
        return "DEEPEN";
    }

    private void ensureFlavorPresence(
        List<ExploreRecommendationItemResponse> recommendations,
        List<ExploreRecommendationItemResponse> fallbackRecommendations,
        String requiredFlavor
    ) {
        if (recommendations.stream().anyMatch(item -> classifyRecommendationFlavor(item).equals(requiredFlavor))) {
            return;
        }

        ExploreRecommendationItemResponse candidate = fallbackRecommendations.stream()
            .filter(item -> classifyRecommendationFlavor(item).equals(requiredFlavor))
            .findFirst()
            .orElse(null);

        if (candidate == null) {
            return;
        }

        int replaceIndex = -1;
        for (int index = recommendations.size() - 1; index >= 0; index -= 1) {
            if (!classifyRecommendationFlavor(recommendations.get(index)).equals(requiredFlavor)) {
                replaceIndex = index;
                break;
            }
        }

        if (replaceIndex >= 0) {
            recommendations.set(replaceIndex, candidate);
        } else if (recommendations.size() < 4) {
            recommendations.add(candidate);
        }
    }

    private String classifyRecommendationFlavor(ExploreRecommendationItemResponse recommendation) {
        return recommendation.kind();
    }

    private String normalizeForLookup(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String normalized = Normalizer.normalize(value.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        return normalized.replaceAll("\\p{M}+", "");
    }

    private String trimTopic(String rawTopic) {
        if (!StringUtils.hasText(rawTopic)) {
            return null;
        }

        String cleaned = rawTopic
            .replaceAll("\\s+", " ")
            .replaceAll("^[#\\-\\s]+", "")
            .trim();
        String normalized = cleaned.toLowerCase(Locale.ROOT);

        if (normalized.length() < 4) {
            return null;
        }
        if (normalized.startsWith("que ") || normalized.startsWith("como ") || normalized.startsWith("para ")) {
            return null;
        }
        if (normalized.equals("nueva entrada")
            || normalized.equals("archivos")
            || normalized.equals("checklist")
            || normalized.equals("youtube")
            || normalized.equals("twitch")) {
            return null;
        }

        return cleaned;
    }

    private String truncateChipTitle(String title) {
        if (!StringUtils.hasText(title)) {
            return title;
        }
        String[] words = title.trim().split("\\s+");
        if (words.length <= 6) {
            return title.trim();
        }
        List<String> keptWords = new ArrayList<>(Arrays.asList(Arrays.copyOfRange(words, 0, 6)));
        while (keptWords.size() > 3 && endsWithWeakTitleWord(keptWords.getLast())) {
            keptWords.removeLast();
        }
        return String.join(" ", keptWords);
    }

    private boolean endsWithWeakTitleWord(String word) {
        return Set.of("de", "del", "la", "el", "y", "o", "para", "con", "en").contains(normalizeForLookup(word));
    }

    private String buildConcreteChipTitle(String title) {
        String truncated = truncateChipTitle(title);
        return StringUtils.hasText(truncated) ? truncated : "esta nota";
    }

    private String buildComplementQuestion(EntryResponse entry) {
        String domain = inferEntryDomain(entry);
        return switch (domain) {
            case "MUSIC" -> "A partir de [" + entry.title() + "], que deberia escuchar despues o junto a esto para ampliar bien la experiencia";
            case "FOOD" -> "A partir de [" + entry.title() + "], con que alimentos, guarniciones o bebidas puedo complementarlo mejor";
            case "TRAVEL" -> "A partir de [" + entry.title() + "], que plan, barrio o actividad complementaria encaja mejor con ese viaje";
            default -> "A partir de [" + entry.title() + "], dame un complemento util relacionado con esta nota";
        };
    }

    private String buildNextQuestion(EntryResponse entry) {
        String domain = inferEntryDomain(entry);
        return switch (domain) {
            case "MUSIC" -> "Despues de [" + entry.title() + "], que cancion, artista, album o contexto deberia explorar a continuacion";
            case "FOOD" -> "Despues de [" + entry.title() + "], que deberia probar, cocinar o ajustar para seguir explorando ese tema";
            case "TRAVEL" -> "Si estoy con [" + entry.title() + "], que actividad o siguiente paso practico tiene mas sentido";
            default -> "Despues de [" + entry.title() + "], que deberia ver, escuchar, probar o explorar a continuacion";
        };
    }

    private String inferEntryDomain(EntryResponse entry) {
        String normalized = normalizeForLookup(entry.title() + " " + buildDetailedSnippet(entry));

        if (containsAny(normalized, "tortilla", "receta", "cocina", "comida", "alimento", "ingrediente", "patata")) {
            return "FOOD";
        }
        if (containsAny(normalized, "flaca", "cancion", "musica", "album", "spotify", "artista", "escuchar")) {
            return "MUSIC";
        }
        if (containsAny(normalized, "lisboa", "viaje", "viajar", "ruta", "barrio", "hotel", "turismo")) {
            return "TRAVEL";
        }
        return "GENERIC";
    }

    private boolean containsAny(String normalizedValue, String... candidates) {
        for (String candidate : candidates) {
            if (normalizedValue.contains(candidate)) {
                return true;
            }
        }
        return false;
    }

    private String sanitizeAnswerMarkdown(String value) {
        if (!StringUtils.hasText(value)) {
            return value;
        }

        String normalized = value.replace("\r\n", "\n").trim();
        if (normalized.matches("^```(?:markdown|md)?\\s*[\\s\\S]*\\n```$")) {
            normalized = normalized
                .replaceFirst("^```(?:markdown|md)?\\s*\\n?", "")
                .replaceFirst("\\n```$", "")
                .trim();
        }

        List<String> cleanedLines = new ArrayList<>();
        for (String line : normalized.split("\\n", -1)) {
            String trimmed = line.trim();
            if (trimmed.startsWith("Pregunta:")
                || trimmed.startsWith("Notas relevantes:")
                || trimmed.startsWith("Notas disponibles:")
                || trimmed.startsWith("Notas:")
                || trimmed.startsWith("Chips:")
                || trimmed.startsWith("Sugerencias:")
                || trimmed.equalsIgnoreCase("Respuesta:")) {
                continue;
            }
            cleanedLines.add(line.replaceFirst("\\s+$", ""));
        }

        return String.join("\n", cleanedLines)
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
    }

    private List<EntryResponse> rankForSingleTopic(List<EntryResponse> candidates, String question) {
        if (candidates == null || candidates.isEmpty() || !StringUtils.hasText(question)) {
            return List.of();
        }

        return candidates.stream()
            .map(entry -> new FocusMatch(entry, computeQuestionFocusScore(entry, question)))
            .filter(match -> match.score() >= 0.34d)
            .sorted(Comparator.comparingDouble(FocusMatch::score).reversed())
            .map(FocusMatch::entry)
            .limit(1)
            .toList();
    }

    private double computeQuestionFocusScore(EntryResponse entry, String question) {
        String normalizedQuestion = normalizeForLookup(question);
        if (!StringUtils.hasText(normalizedQuestion)) {
            return 0.0d;
        }

        String normalizedTitle = normalizeForLookup(entry.title());
        String normalizedSnippet = normalizeForLookup(buildDetailedSnippet(entry));
        Set<String> questionTokens = Arrays.stream(normalizedQuestion.split("[^\\p{L}\\p{Nd}]+"))
            .filter(token -> token.length() >= 3)
            .collect(Collectors.toSet());

        if (questionTokens.isEmpty()) {
            return 0.0d;
        }

        long titleMatches = questionTokens.stream().filter(normalizedTitle::contains).count();
        long snippetMatches = questionTokens.stream().filter(normalizedSnippet::contains).count();
        double score = 0.0d;

        if (normalizedTitle.contains(normalizedQuestion)) {
            score += 0.65d;
        }
        if (normalizedSnippet.contains(normalizedQuestion)) {
            score += 0.25d;
        }

        score += Math.min(0.45d, (double) titleMatches / questionTokens.size() * 0.45d);
        score += Math.min(0.30d, (double) snippetMatches / questionTokens.size() * 0.30d);

        return Math.min(1.0d, score);
    }

    private record FocusMatch(EntryResponse entry, double score) {
    }

    private String trimRequired(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return value.trim();
    }
}
