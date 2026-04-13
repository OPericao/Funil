package com.pisito.app.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pisito.app.model.Entry;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@Service
public class EntryProcessingService {

    private final OllamaService ollamaService;
    private final EntrySemanticIndexService entrySemanticIndexService;
    private final ObjectMapper objectMapper;

    public EntryProcessingService(
        OllamaService ollamaService,
        EntrySemanticIndexService entrySemanticIndexService,
        ObjectMapper objectMapper
    ) {
        this.ollamaService = ollamaService;
        this.entrySemanticIndexService = entrySemanticIndexService;
        this.objectMapper = objectMapper;
    }

    public EntryProcessingResult analyze(Entry entry) {
        String document = entrySemanticIndexService.buildSearchDocument(entry);
        if (!StringUtils.hasText(document)) {
            return EntryProcessingResult.empty();
        }

        try {
            String rawResponse = ollamaService.generate(buildPrompt(document));
            return parseResponse(rawResponse);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() == HttpStatus.BAD_GATEWAY.value()) {
                return EntryProcessingResult.empty();
            }
            throw ex;
        } catch (Exception ex) {
            return EntryProcessingResult.empty();
        }
    }

    private String buildPrompt(String document) {
        return """
            Analiza esta nota y devuelve solo JSON valido.
            No uses markdown ni explicaciones.

            Formato exacto:
            {
              "category": "aprendizaje|referencia|idea|tarea|inspiracion|archivo",
              "keyIdeas": ["idea 1", "idea 2", "idea 3"],
              "actions": ["accion 1", "accion 2"]
            }

            Reglas:
            - category debe ser una sola palabra en minusculas.
            - keyIdeas debe tener de 0 a 4 ideas cortas y concretas.
            - actions debe tener de 0 a 3 acciones concretas.
            - Si no aplica algo, devuelve un array vacio.

            Nota:
            """ + document;
    }

    private EntryProcessingResult parseResponse(String rawResponse) {
        if (!StringUtils.hasText(rawResponse)) {
            return EntryProcessingResult.empty();
        }

        String cleaned = rawResponse
            .replace("```json", "")
            .replace("```", "")
            .trim();

        int firstBrace = cleaned.indexOf('{');
        int lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        try {
            JsonNode root = objectMapper.readTree(cleaned);
            String category = trimOrNull(root.path("category").asText(null));
            if (category != null) {
                category = category.toLowerCase();
            }

            List<String> keyIdeas = readStringArray(root.path("keyIdeas"), 4);
            List<String> actions = readStringArray(root.path("actions"), 3);
            return new EntryProcessingResult(category, keyIdeas, actions);
        } catch (Exception ex) {
            return EntryProcessingResult.empty();
        }
    }

    private List<String> readStringArray(JsonNode node, int limit) {
        if (node == null || !node.isArray()) {
            return List.of();
        }

        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            String value = trimOrNull(item.asText(null));
            if (!StringUtils.hasText(value)) {
                continue;
            }
            values.add(value);
            if (values.size() == limit) {
                break;
            }
        }
        return values.stream().distinct().toList();
    }

    private String trimOrNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    public record EntryProcessingResult(
        String category,
        List<String> keyIdeas,
        List<String> actions
    ) {
        public static EntryProcessingResult empty() {
            return new EntryProcessingResult(null, List.of(), List.of());
        }
    }
}
