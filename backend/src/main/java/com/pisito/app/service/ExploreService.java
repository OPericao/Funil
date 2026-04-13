package com.pisito.app.service;

import com.pisito.app.controller.dto.entry.EntryResponse;
import com.pisito.app.controller.dto.explore.ExploreAnswerResponse;
import com.pisito.app.controller.dto.explore.ExploreCollectionItemResponse;
import com.pisito.app.controller.dto.explore.ExploreCollectionsResponse;
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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
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

    private final EntryService entryService;
    private final OllamaService ollamaService;

    public ExploreService(EntryService entryService, OllamaService ollamaService) {
        this.entryService = entryService;
        this.ollamaService = ollamaService;
    }

    @Transactional(readOnly = true)
    public ExploreAnswerResponse ask(Long userId, String rawQuestion) {
        String question = trimRequired(rawQuestion, "question is required");
        List<EntryResponse> relevantEntries = entryService.search(userId, question).stream()
            .limit(5)
            .toList();

        if (relevantEntries.isEmpty()) {
            return new ExploreAnswerResponse(
                question,
                "No encontre notas suficientemente relacionadas en tu base para responder con confianza.",
                List.of()
            );
        }

        List<ExploreSourceResponse> sources = relevantEntries.stream()
            .map(entry -> new ExploreSourceResponse(entry.id(), entry.title(), buildSnippet(entry)))
            .toList();

        String prompt = buildPrompt(question, sources);
        String answer;
        try {
            answer = sanitizePlainText(ollamaService.generate(prompt));
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() == HttpStatus.BAD_GATEWAY.value()) {
                answer = "No pude consultar Ollama ahora mismo. Estas son las notas mas relevantes que encontre.";
            } else {
                throw ex;
            }
        }

        return new ExploreAnswerResponse(question, answer, sources);
    }

    @Transactional(readOnly = true)
    public ExploreSuggestionsResponse suggestions(Long userId) {
        List<EntryResponse> recentEntries = entryService.findAll(userId).stream()
            .limit(10)
            .toList();

        if (recentEntries.isEmpty()) {
            return new ExploreSuggestionsResponse(List.of(
                "Que temas estoy guardando ultimamente",
                "Que notas relacionadas deberia revisar ahora",
                "Resume lo mas importante de mi base personal",
                "Que ideas estan menos conectadas en mis notas"
            ));
        }

        try {
            String response = ollamaService.generate(buildSuggestionsPrompt(recentEntries));
            List<String> parsedSuggestions = parseSuggestions(response);
            if (!parsedSuggestions.isEmpty()) {
                return new ExploreSuggestionsResponse(parsedSuggestions);
            }
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() != HttpStatus.BAD_GATEWAY.value()) {
                throw ex;
            }
        }

        return new ExploreSuggestionsResponse(buildFallbackSuggestions(recentEntries));
    }

    @Transactional(readOnly = true)
    public ExploreRecommendationsResponse recommendations(Long userId, String refreshToken) {
        List<EntryResponse> recentEntries = entryService.findAll(userId).stream()
            .limit(10)
            .toList();

        if (recentEntries.isEmpty()) {
            return new ExploreRecommendationsResponse(List.of());
        }

        List<ExploreRecommendationItemResponse> fallbackRecommendations = buildFallbackRecommendations(recentEntries);
        RecommendationMix mix = resolveRecommendationMix(refreshToken);

        try {
            String response = ollamaService.generate(buildRecommendationsPrompt(recentEntries, mix, refreshToken));
            List<ExploreRecommendationItemResponse> parsed = parseRecommendations(response, recentEntries);
            if (!parsed.isEmpty()) {
                return new ExploreRecommendationsResponse(parsed);
            }
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() != HttpStatus.BAD_GATEWAY.value()) {
                throw ex;
            }
        }

        return new ExploreRecommendationsResponse(fallbackRecommendations);
    }

    @Transactional(readOnly = true)
    public ExploreCollectionsResponse collections(Long userId) {
        List<EntryResponse> entries = entryService.findAll(userId);
        if (entries.isEmpty()) {
            return new ExploreCollectionsResponse(List.of());
        }

        List<ExploreCollectionItemResponse> collections = new ArrayList<>();
        List<String> topics = extractTopics(entries);

        for (String topic : topics) {
            List<ExploreSourceResponse> sources = findSourcesForTopic(entries, topic);
            if (sources.size() < 2) {
                continue;
            }

            collections.add(new ExploreCollectionItemResponse(
                "THEME",
                topic,
                "Bloque tematico con notas que apuntan a la misma idea y sirven para entrar rapido en este tema.",
                "Ayudame a explorar lo mas importante sobre " + topic + " y por donde empezar",
                sources.size(),
                sources
            ));

            if (collections.size() == 2) {
                break;
            }
        }

        List<ExploreSourceResponse> recentSources = entries.stream()
            .limit(3)
            .map(entry -> new ExploreSourceResponse(entry.id(), entry.title(), buildSnippet(entry)))
            .toList();
        if (!recentSources.isEmpty()) {
            collections.add(new ExploreCollectionItemResponse(
                "RECENT",
                "Lo ultimo que has guardado",
                "Un bloque corto para retomar rapido tus notas mas recientes y seguir desde ahi.",
                "Que merece la pena explorar primero de lo ultimo que he guardado",
                recentSources.size(),
                recentSources
            ));
        }

        if (topics.size() >= 2) {
            String leftTopic = topics.get(0);
            String rightTopic = topics.get(1);
            List<ExploreSourceResponse> bridgeSources = new ArrayList<>();
            bridgeSources.addAll(findSourcesForTopic(entries, leftTopic).stream().limit(2).toList());
            bridgeSources.addAll(findSourcesForTopic(entries, rightTopic).stream().limit(2).toList());
            List<ExploreSourceResponse> distinctBridgeSources = bridgeSources.stream()
                .collect(Collectors.toMap(
                    ExploreSourceResponse::entryId,
                    Function.identity(),
                    (left, _right) -> left,
                    LinkedHashMap::new
                ))
                .values()
                .stream()
                .limit(4)
                .toList();

            if (distinctBridgeSources.size() >= 2) {
                collections.add(new ExploreCollectionItemResponse(
                    "BRIDGE",
                    leftTopic + " y " + rightTopic,
                    "Un cruce de dos focos de tu base para comparar ideas y descubrir relaciones utiles.",
                    "Como se conectan " + leftTopic + " y " + rightTopic + " en mis notas",
                    distinctBridgeSources.size(),
                    distinctBridgeSources
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
            .sorted(Comparator
                .comparingInt(ExploreCollectionItemResponse::entryCount)
                .reversed()
                .thenComparing(ExploreCollectionItemResponse::title))
            .limit(4)
            .toList();

        if (!uniqueCollections.isEmpty()) {
            return new ExploreCollectionsResponse(uniqueCollections);
        }

        EntryResponse latestEntry = entries.getFirst();
        return new ExploreCollectionsResponse(List.of(
            new ExploreCollectionItemResponse(
                "RECENT",
                "Punto de partida",
                "Un bloque simple para volver a entrar en tu base desde una nota reciente.",
                "Que merece la pena explorar a partir de " + latestEntry.title(),
                1,
                List.of(new ExploreSourceResponse(latestEntry.id(), latestEntry.title(), buildSnippet(latestEntry)))
            )
        ));
    }

    private String buildPrompt(String question, List<ExploreSourceResponse> sources) {
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un asistente que responde usando unicamente las notas proporcionadas.
            Responde en espanol de forma clara y breve.
            Si la evidencia es limitada, dilo explicitamente.
            Cita las notas por su titulo entre corchetes cuando apoyes una afirmacion.
            Usa solo texto plano.
            No uses markdown.
            No pongas titulos ni palabras entre ** **, __ __, * * o formatos similares.

            Pregunta:
            """);
        builder.append(question).append("\n\n");
        builder.append("Notas relevantes:\n");

        for (int index = 0; index < sources.size(); index += 1) {
            ExploreSourceResponse source = sources.get(index);
            builder.append(index + 1)
                .append(". [")
                .append(source.title())
                .append("] ")
                .append(source.snippet())
                .append("\n");
        }

        builder.append("\nRespuesta:");
        return builder.toString();
    }

    private String buildRecommendationsPrompt(List<EntryResponse> entries, RecommendationMix mix, String refreshToken) {
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un asistente que recomienda que explorar dentro de una base personal de conocimiento.
            Devuelve exactamente 4 recomendaciones en espanol.
            Cada recomendacion debe tener este formato exacto:
            TYPE: EXPLORE o OPTIMIZE
            TITLE: ...
            DESCRIPTION: ...
            QUESTION: ...
            SOURCES: titulo 1 | titulo 2
            END

            Reglas:
            - TYPE debe ser EXPLORE para recomendaciones de busqueda, descubrimiento o profundizacion.
            - TYPE debe ser OPTIMIZE para recomendaciones de mejora, claridad o enriquecimiento de notas.
            - TITLE debe ser corto y accionable.
            - DESCRIPTION debe explicar por que merece la pena revisarlo.
            - QUESTION debe ser una consulta natural que el usuario pueda lanzar al asistente.
            - SOURCES debe usar solo titulos exactos de la lista proporcionada.
            - Debe haber exactamente %d recomendaciones EXPLORE.
            - Debe haber exactamente %d recomendaciones OPTIMIZE.
            - Mezcla ambos tipos sin agruparlos siempre igual.
            - Prioriza descubrimiento, proximidad tematica, utilidad practica y huecos interesantes.
            - No inventes titulos.
            - La variacion de esta tanda viene marcada por la semilla: %s.

            Notas disponibles:
            """.formatted(mix.exploreCount(), mix.optimizeCount(), refreshToken == null ? "base" : refreshToken));

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

            String snippet = buildSnippet(entry);
            if (StringUtils.hasText(snippet)) {
                builder.append(" | Contenido: ").append(snippet);
            }
            builder.append("\n");
        }

        builder.append("\nRecomendaciones:");
        return builder.toString();
    }

    private String buildSuggestionsPrompt(List<EntryResponse> entries) {
        List<String> topics = extractTopics(entries);
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un asistente que propone preguntas breves y utiles para explorar una base personal de notas.
            Devuelve exactamente 4 sugerencias en espanol.
            Reglas:
            - Cada sugerencia debe ser una sola pregunta corta.
            - No repitas ideas.
            - Basate en los temas reales de las notas.
            - Usa nombres concretos de temas, herramientas o conceptos presentes en las notas.
            - Evita preguntas genericas como "que temas tengo" o "que conexiones hay".
            - Evita mencionar "notas", "base personal" o "contenido" salvo que sea imprescindible.
            - Haz que cada sugerencia tenga una intencion distinta: resumir, conectar, recomendar, priorizar.
            - No uses numeracion adicional fuera de una lista simple.
            - No expliques nada mas.

            Temas detectados:
            """);

        if (topics.isEmpty()) {
            builder.append("- sin temas claros\n");
        } else {
            for (String topic : topics) {
                builder.append("- ").append(topic).append("\n");
            }
        }

        builder.append("""

            Notas recientes:
            """);

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

            String snippet = buildSnippet(entry);
            if (StringUtils.hasText(snippet)) {
                builder.append(" | Contenido: ").append(snippet);
            }
            builder.append("\n");
        }

        builder.append("\nSugerencias:");
        return builder.toString();
    }

    private String buildSnippet(EntryResponse entry) {
        List<String> pieces = new ArrayList<>();
        for (ResourceResponse resource : entry.resources()) {
            appendIfPresent(pieces, resource.title());
            appendIfPresent(pieces, resource.textContent());
            appendIfPresent(pieces, resource.description());
            appendIfPresent(pieces, resource.contentPreview());
            appendIfPresent(pieces, resource.siteName());
            appendIfPresent(pieces, resource.url());
        }
        String snippet = String.join(" ", pieces).replaceAll("\\s+", " ").trim();
        if (!StringUtils.hasText(snippet)) {
            snippet = entry.title();
        }
        if (!StringUtils.hasText(snippet)) {
            return "Sin contenido adicional.";
        }
        return snippet.length() > 320 ? snippet.substring(0, 320).trim() + "..." : snippet;
    }

    private void appendIfPresent(List<String> pieces, String value) {
        if (StringUtils.hasText(value)) {
            pieces.add(value.trim());
        }
    }

    private List<String> parseSuggestions(String rawResponse) {
        if (!StringUtils.hasText(rawResponse)) {
            return List.of();
        }

        Set<String> uniqueSuggestions = new LinkedHashSet<>();
        for (String line : rawResponse.split("\\R")) {
            String cleaned = line
                .replaceFirst("^\\s*[-*•]+\\s*", "")
                .replaceFirst("^\\s*\\d+[.)-]?\\s*", "")
                .trim();
            if (!StringUtils.hasText(cleaned)) {
                continue;
            }
            cleaned = cleaned.replaceAll("^\"|\"$", "").trim();
            if (!StringUtils.hasText(cleaned)) {
                continue;
            }
            uniqueSuggestions.add(cleaned);
            if (uniqueSuggestions.size() == 4) {
                break;
            }
        }
        return uniqueSuggestions.stream().toList();
    }

    private List<ExploreRecommendationItemResponse> parseRecommendations(String rawResponse, List<EntryResponse> entries) {
        if (!StringUtils.hasText(rawResponse)) {
            return List.of();
        }

        Map<String, EntryResponse> entriesByNormalizedTitle = entries.stream()
            .collect(Collectors.toMap(
                entry -> normalizeForLookup(entry.title()),
                Function.identity(),
                (left, _right) -> left
            ));

        List<ExploreRecommendationItemResponse> recommendations = new ArrayList<>();
        String[] blocks = rawResponse.split("(?m)^END\\s*$");
        for (String block : blocks) {
            String type = extractRecommendationField(block, "TYPE:");
            String title = extractRecommendationField(block, "TITLE:");
            String description = extractRecommendationField(block, "DESCRIPTION:");
            String question = extractRecommendationField(block, "QUESTION:");
            String sourcesRaw = extractRecommendationField(block, "SOURCES:");

            String normalizedType = normalizeRecommendationType(type);
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
                .map(entriesByNormalizedTitle::get)
                .filter(entry -> entry != null)
                .distinct()
                .limit(3)
                .map(entry -> new ExploreSourceResponse(entry.id(), entry.title(), buildSnippet(entry)))
                .toList();

            if (sources.isEmpty()) {
                continue;
            }

            recommendations.add(new ExploreRecommendationItemResponse(
                normalizedType,
                title,
                description,
                question,
                sources
            ));
            if (recommendations.size() == 4) {
                break;
            }
        }

        return recommendations;
    }

    private List<String> buildFallbackSuggestions(List<EntryResponse> entries) {
        List<String> topics = extractTopics(entries);
        Set<String> suggestions = new LinkedHashSet<>();

        if (!topics.isEmpty()) {
            suggestions.add("Resume lo mas importante sobre " + topics.get(0));
        }
        if (topics.size() >= 2) {
            suggestions.add("Como se relacionan " + topics.get(0) + " y " + topics.get(1));
        }
        if (!topics.isEmpty()) {
            suggestions.add("Recomiendame que revisar despues sobre " + topics.get(0));
        }

        String latestTitle = trimTopic(entries.getFirst().title());
        if (StringUtils.hasText(latestTitle)) {
            suggestions.add("Que deberia hacer a partir de " + latestTitle);
        }

        suggestions.add("Que idea de mis apuntes merece mas atencion ahora");

        return suggestions.stream().limit(4).toList();
    }

    private List<ExploreRecommendationItemResponse> buildFallbackRecommendations(List<EntryResponse> entries) {
        List<String> topics = extractTopics(entries);
        List<ExploreRecommendationItemResponse> recommendations = new ArrayList<>();

        if (!topics.isEmpty()) {
            List<ExploreSourceResponse> topicSources = findSourcesForTopic(entries, topics.getFirst());
            if (!topicSources.isEmpty()) {
                recommendations.add(new ExploreRecommendationItemResponse(
                    "EXPLORE",
                    "Consolida " + topics.getFirst(),
                    "Tienes varias piezas que apuntan al mismo tema y merece una sintesis unica.",
                    "Resume lo mas importante sobre " + topics.getFirst(),
                    topicSources
                ));
            }
        }

        if (topics.size() >= 2) {
            String leftTopic = topics.get(0);
            String rightTopic = topics.get(1);
            List<ExploreSourceResponse> leftSources = findSourcesForTopic(entries, leftTopic);
            List<ExploreSourceResponse> rightSources = findSourcesForTopic(entries, rightTopic);
            List<ExploreSourceResponse> combinedSources = new ArrayList<>();
            combinedSources.addAll(leftSources.stream().limit(1).toList());
            combinedSources.addAll(rightSources.stream().limit(2).toList());
            if (!combinedSources.isEmpty()) {
                recommendations.add(new ExploreRecommendationItemResponse(
                    "EXPLORE",
                    "Conecta " + leftTopic + " con " + rightTopic,
                    "Hay material cercano entre estos temas y puede salir una relacion util o una idea nueva.",
                    "Como se relacionan " + leftTopic + " y " + rightTopic,
                    combinedSources.stream().distinct().limit(3).toList()
                ));
            }
        }

        EntryResponse latestEntry = entries.getFirst();
        recommendations.add(new ExploreRecommendationItemResponse(
            "EXPLORE",
            "Empieza por lo ultimo",
            "Tu nota mas reciente es una buena puerta de entrada para seguir tirando del hilo.",
            "Que deberia revisar a partir de " + latestEntry.title(),
            List.of(new ExploreSourceResponse(latestEntry.id(), latestEntry.title(), buildSnippet(latestEntry)))
        ));

        List<ExploreSourceResponse> improvementSources;
        if (!topics.isEmpty()) {
            improvementSources = findSourcesForTopic(entries, topics.getFirst());
        } else {
            improvementSources = List.of(new ExploreSourceResponse(latestEntry.id(), latestEntry.title(), buildSnippet(latestEntry)));
        }
        if (!improvementSources.isEmpty()) {
            String improvementTopic = !topics.isEmpty() ? topics.getFirst() : latestEntry.title();
            recommendations.add(new ExploreRecommendationItemResponse(
                "OPTIMIZE",
                "Mejora una nota clave",
                "Aqui puede faltarte contexto, resumen o una relacion mas clara para que luego sea mas facil encontrarla.",
                "Que le falta a mis notas sobre " + improvementTopic + " para quedar mejor explicadas",
                improvementSources
            ));
        }

        List<ExploreRecommendationItemResponse> fallback = recommendations.stream().limit(4).toList();
        if (fallback.size() == 4) {
            return fallback;
        }

        List<ExploreRecommendationItemResponse> completed = new ArrayList<>(fallback);
        while (completed.size() < 4) {
            completed.add(new ExploreRecommendationItemResponse(
                completed.size() == 3 ? "OPTIMIZE" : "EXPLORE",
                completed.size() == 3 ? "Mejora una nota reciente" : "Sigue explorando",
                completed.size() == 3
                    ? "Puede haber una nota importante que necesite mas contexto para ser mas util despues."
                    : "Hay margen para descubrir conexiones utiles sin tocar lo que ya tienes.",
                completed.size() == 3
                    ? "Que nota reciente deberia mejorar para entenderla mejor mas adelante"
                    : "Que deberia explorar a continuacion en mis apuntes",
                List.of(new ExploreSourceResponse(latestEntry.id(), latestEntry.title(), buildSnippet(latestEntry)))
            ));
        }
        return completed;
    }

    private List<String> extractTopics(List<EntryResponse> entries) {
        Map<String, Integer> scores = new HashMap<>();

        for (EntryResponse entry : entries) {
            for (String tagName : entry.tags().stream().map(tag -> tag.name()).toList()) {
                addTopicScore(scores, tagName, 4);
            }

            Arrays.stream(entry.title().split("[,|:/\\-]"))
                .map(this::trimTopic)
                .forEach(topic -> addTopicScore(scores, topic, 3));

            for (ResourceResponse resource : entry.resources()) {
                addTopicScore(scores, resource.title(), 2);
                addTopicScore(scores, resource.siteName(), 1);
            }
        }

        return scores.entrySet().stream()
            .sorted((left, right) -> Integer.compare(right.getValue(), left.getValue()))
            .map(Map.Entry::getKey)
            .limit(5)
            .toList();
    }

    private void addTopicScore(Map<String, Integer> scores, String rawTopic, int weight) {
        String topic = trimTopic(rawTopic);
        if (!StringUtils.hasText(topic)) {
            return;
        }
        scores.merge(topic, weight, Integer::sum);
    }

    private String trimTopic(String rawTopic) {
        if (!StringUtils.hasText(rawTopic)) {
            return null;
        }

        String cleaned = rawTopic
            .replaceAll("\\s+", " ")
            .replaceAll("^[#\\-•\\s]+", "")
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
            || normalized.equals("todo list")
            || normalized.equals("youtube")
            || normalized.equals("twitch")) {
            return null;
        }

        return cleaned;
    }

    private List<ExploreSourceResponse> findSourcesForTopic(List<EntryResponse> entries, String topic) {
        String normalizedTopic = normalizeForLookup(topic);
        return entries.stream()
            .filter(entry -> normalizeForLookup(entry.title()).contains(normalizedTopic)
                || buildSnippet(entry).toLowerCase(Locale.ROOT).contains(normalizedTopic)
                || entry.tags().stream().anyMatch(tag -> normalizeForLookup(tag.name()).contains(normalizedTopic)))
            .limit(3)
            .map(entry -> new ExploreSourceResponse(entry.id(), entry.title(), buildSnippet(entry)))
            .toList();
    }

    private String extractRecommendationField(String block, String prefix) {
        return Arrays.stream(block.split("\\R"))
            .map(String::trim)
            .filter(line -> line.startsWith(prefix))
            .map(line -> line.substring(prefix.length()).trim())
            .filter(StringUtils::hasText)
            .findFirst()
            .orElse(null);
    }

    private String normalizeForLookup(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeRecommendationType(String value) {
        String normalized = normalizeForLookup(value).toUpperCase(Locale.ROOT);
        if ("EXPLORE".equals(normalized) || "OPTIMIZE".equals(normalized)) {
            return normalized;
        }
        return null;
    }

    private RecommendationMix resolveRecommendationMix(String refreshToken) {
        int variant = Math.abs((refreshToken == null ? "base" : refreshToken).hashCode()) % 2;
        return variant == 0 ? new RecommendationMix(3, 1) : new RecommendationMix(2, 2);
    }

    private String sanitizePlainText(String value) {
        if (!StringUtils.hasText(value)) {
            return value;
        }

        String sanitized = value
            .replaceAll("\\*\\*(.*?)\\*\\*", "$1")
            .replaceAll("__(.*?)__", "$1")
            .replaceAll("(?m)^#{1,6}\\s*", "")
            .trim();

        String[] promptMarkers = {
            "Respuesta:",
            "Pregunta:",
            "Notas relevantes:",
            "Notas disponibles:",
            "Nota:",
            "Sugerencias:",
            "Recomendaciones:"
        };

        for (String marker : promptMarkers) {
            int markerIndex = sanitized.lastIndexOf(marker);
            if (markerIndex >= 0 && "Respuesta:".equals(marker)) {
                sanitized = sanitized.substring(markerIndex + marker.length()).trim();
            }
        }

        sanitized = Arrays.stream(sanitized.split("\\R"))
            .map(String::trim)
            .filter(StringUtils::hasText)
            .filter(line -> !line.startsWith("Pregunta:"))
            .filter(line -> !line.startsWith("Notas relevantes:"))
            .filter(line -> !line.startsWith("Notas disponibles:"))
            .filter(line -> !line.startsWith("Nota:"))
            .filter(line -> !line.startsWith("Sugerencias:"))
            .filter(line -> !line.startsWith("Recomendaciones:"))
            .collect(Collectors.joining("\n"))
            .trim();

        return sanitized;
    }


    private String trimRequired(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return value.trim();
    }

    private record RecommendationMix(int exploreCount, int optimizeCount) {
    }
}
