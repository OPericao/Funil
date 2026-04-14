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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
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
            String answer = sanitizePlainText(ollamaService.generate(buildAnswerPrompt(question, relevantEntries, request)));
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

    @Transactional(readOnly = true)
    public ExploreRecommendationsResponse recommendations(Long userId, String refreshToken) {
        List<EntryResponse> entries = entryService.findAll(userId).stream()
            .limit(18)
            .toList();

        if (entries.isEmpty()) {
            return new ExploreRecommendationsResponse(List.of());
        }

        List<ExploreRecommendationItemResponse> fallbackRecommendations = buildFallbackRecommendations(entries);

        try {
            String rawResponse = ollamaService.generate(buildRecommendationsPrompt(entries, refreshToken));
            List<ExploreRecommendationItemResponse> parsedRecommendations = parseRecommendations(rawResponse, entries);
            if (!parsedRecommendations.isEmpty()) {
                return new ExploreRecommendationsResponse(parsedRecommendations);
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

        addEntries(entriesById, entryService.search(userId, question), 5);

        ExploreActiveChipRequest activeChip = request.getActiveChip();
        if (activeChip != null) {
            if (StringUtils.hasText(activeChip.getTitle())) {
                addEntries(entriesById, entryService.search(userId, activeChip.getTitle()), 3);
            }
            if (StringUtils.hasText(activeChip.getSuggestedQuestion())) {
                addEntries(entriesById, entryService.search(userId, activeChip.getSuggestedQuestion()), 3);
            }
        }

        if (entriesById.isEmpty()) {
            addEntries(entriesById, entryService.findAll(userId), 4);
        }

        return entriesById.values().stream().limit(6).toList();
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
            - Apoyate primero en las notas proporcionadas.
            - Si hay un chip activo, tratalo como la direccion principal de la conversacion.
            - Si hay historial, continua el hilo con naturalidad y sin reiniciar el tema.
            - Si la pregunta pide resumen, conexion o explicacion, usa solo lo que se desprende de las notas.
            - Si la pregunta pide descubrir cosas nuevas, recomendar libros, recetas, canciones, autores, animales,
              herramientas, ideas o variantes, puedes usar las notas como perfil de intereses y anadir sugerencias nuevas.
            - Intenta aportar conocimiento nuevo, complementos, tecnica, variantes o siguientes pasos cuando tenga sentido.
            - Si el usuario pregunta por un detalle derivado de una recomendacion anterior, respondelo como continuacion natural.
            - Cuando una sugerencia nueva no salga literalmente de las notas, dilo claramente.
            - No inventes que una nota contiene algo que no contiene.
            - Cita las notas por su titulo exacto entre corchetes cuando una afirmacion salga de ellas.
            - Usa solo texto plano.
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

    private String buildRecommendationsPrompt(List<EntryResponse> entries, String refreshToken) {
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Eres un motor de chips para explorar una base personal de conocimiento.
            Tu trabajo es detectar oportunidades interesantes aunque el tema sea aleatorio.

            Devuelve exactamente 4 chips en espanol usando este formato exacto:
            TYPE: EXPLORE o OPTIMIZE
            TITLE: maximo 3 palabras
            DESCRIPTION: una explicacion concreta de por que este chip aporta valor
            QUESTION: una pregunta o peticion lista para lanzar al asistente
            SOURCES: titulo 1 | titulo 2
            END

            Mezcla intenciones cuando tenga sentido:
            - descubrir algo nuevo relacionado
            - profundizar en una variante o enfoque mas especifico
            - complementar una nota con algo que le falta
            - conectar ideas entre notas
            - convertir algo en siguiente paso practico

            Reglas:
            - No te encierres en dominios faciles. Si las notas hablan de animales, ciencia, cocina, historia,
              software o cualquier otro tema, adapta los chips a ese dominio.
            - Los 4 chips deben priorizar expansion, descubrimiento o profundizacion.
            - Intenta que al menos 3 chips aporten informacion nueva o direcciones nuevas, no solo reorganicen lo ya guardado.
            - Si detectas una nota muy concreta, puedes proponer un chip de complemento y otro de variante.
            - TITLE debe sonar a chip corto y accionable.
            - QUESTION debe ser especifica y util.
            - SOURCES debe usar solo titulos exactos de la lista.
            - Usa TYPE=EXPLORE por defecto. Solo usa TYPE=OPTIMIZE si no encuentras una expansion interesante mejor.
            - Usa la semilla %s solo para variar el enfoque y evitar repeticiones.

            Notas disponibles:
            """.formatted(refreshToken == null ? "base" : refreshToken));

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
        List<String> topics = extractTopics(entries);
        List<ExploreRecommendationItemResponse> recommendations = new ArrayList<>();

        if (!topics.isEmpty()) {
            String mainTopic = topics.getFirst();
            List<ExploreSourceResponse> sources = findSourcesForTopic(entries, mainTopic);
            recommendations.add(new ExploreRecommendationItemResponse(
                "EXPLORE",
                "Mapa del tema",
                "Agrupa lo mas importante de este foco para convertirlo en una vision mas clara.",
                "Hazme un mapa claro de lo mas importante que tengo sobre " + mainTopic,
                sources
            ));
            recommendations.add(new ExploreRecommendationItemResponse(
                "EXPLORE",
                "Descubre mas",
                "Busca informacion nueva, ejemplos o referencias relacionadas con este foco.",
                "Basandote en mis notas sobre " + mainTopic + ", que deberia descubrir o mirar despues",
                sources
            ));
            recommendations.add(new ExploreRecommendationItemResponse(
                "EXPLORE",
                "Variante posible",
                "Explora una version distinta, un caso especial o un enfoque menos obvio de este mismo tema.",
                "A partir de mis notas sobre " + mainTopic + ", ensename variantes interesantes o enfoques relacionados",
                sources
            ));
        }

        EntryResponse firstEntry = entries.getFirst();
        recommendations.add(new ExploreRecommendationItemResponse(
            "EXPLORE",
            "Completa esto",
            "Usa esta nota como base para sugerir algo que la complemente o la lleve un paso mas alla.",
            "A partir de " + firstEntry.title() + ", dime con que ideas, ejemplos o contenidos la complementaria",
            List.of(toSource(firstEntry))
        ));
        recommendations.add(new ExploreRecommendationItemResponse(
            "EXPLORE",
            "Profundiza aqui",
            "Convierte una nota concreta en una puerta de entrada para aprender algo mas especifico o avanzado.",
            "A partir de " + firstEntry.title() + ", que deberia aprender o explorar para profundizar mas",
            List.of(toSource(firstEntry))
        ));

        return recommendations.stream().limit(4).toList();
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
            String title = extractField(block, "TITLE:");
            String description = extractField(block, "DESCRIPTION:");
            String question = extractField(block, "QUESTION:");
            String sourcesRaw = extractField(block, "SOURCES:");

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
                .map(sourcesByTitle::get)
                .filter(item -> item != null)
                .distinct()
                .limit(3)
                .toList();

            if (sources.isEmpty()) {
                continue;
            }

            recommendations.add(new ExploreRecommendationItemResponse(
                normalizedType,
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
        if (words.length <= 3) {
            return title.trim();
        }
        return String.join(" ", Arrays.copyOfRange(words, 0, 3));
    }

    private String sanitizePlainText(String value) {
        if (!StringUtils.hasText(value)) {
            return value;
        }

        return Arrays.stream(value
                .replace("```", "")
                .replaceAll("\\*\\*(.*?)\\*\\*", "$1")
                .replaceAll("__(.*?)__", "$1")
                .split("\\R"))
            .map(String::trim)
            .filter(StringUtils::hasText)
            .filter(line -> !line.startsWith("Pregunta:"))
            .filter(line -> !line.startsWith("Notas relevantes:"))
            .filter(line -> !line.startsWith("Notas disponibles:"))
            .filter(line -> !line.startsWith("Notas:"))
            .filter(line -> !line.startsWith("Chips:"))
            .filter(line -> !line.startsWith("Sugerencias:"))
            .collect(Collectors.joining("\n"))
            .trim();
    }

    private String trimRequired(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return value.trim();
    }
}
