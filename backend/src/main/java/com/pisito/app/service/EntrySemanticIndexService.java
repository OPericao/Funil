package com.pisito.app.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pisito.app.model.Entry;
import com.pisito.app.model.EntryEmbedding;
import com.pisito.app.model.LinkResource;
import com.pisito.app.model.MediaResource;
import com.pisito.app.model.Resource;
import com.pisito.app.model.TextResource;
import com.pisito.app.util.RichTextContentUtils;
import com.pisito.app.repository.EntryEmbeddingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class EntrySemanticIndexService {

    private static final Logger log = LoggerFactory.getLogger(EntrySemanticIndexService.class);
    private static final Map<String, List<String>> CANONICAL_TOPIC_ALIASES = Map.of(
        "technology", List.of("tecnologia", "informática", "informatica", "technology", "tech", "software", "hardware", "computacion", "computing", "programacion", "programming", "code", "codigo", "development", "desarrollo", "digital"),
        "web", List.of("web", "website", "html", "css", "javascript", "typescript", "react", "vue", "angular", "nextjs", "tailwind", "ui", "ux"),
        "frontend", List.of("frontend", "front-end", "front end", "ui", "ux", "react", "vue", "angular", "css", "html", "tailwind"),
        "backend", List.of("backend", "back-end", "back end", "server", "api", "database", "sql", "postgres", "spring", "java", "node", "express", "supabase"),
        "food", List.of("comida", "food", "foods", "meal", "meals", "dish", "dishes", "alimento", "alimentos", "ingrediente", "ingredientes", "ingredient", "ingredients", "cocina", "cooking", "gastronomia", "gastronomy", "restaurante", "restaurant", "receta", "recipe", "recipes", "tortilla", "milanesa", "pollo", "ensalada"),
        "vegetable", List.of("verdura", "verduras", "vegetal", "vegetales", "vegetable", "vegetables"),
        "fruit", List.of("fruta", "frutas", "fruit", "fruits"),
        "music", List.of("musica", "music", "song", "songs", "cancion", "canciones", "album", "albums", "artist", "artista", "playlist", "concierto", "concert"),
        "travel", List.of("viaje", "viajes", "viajar", "viajero", "viajera", "travel", "trip", "trips", "journey", "turismo", "tourism", "destino", "destination", "hotel", "flight", "vuelo", "ruta", "route")
    );
    private static final Map<String, List<String>> CANONICAL_TOPIC_PARENTS = Map.of(
        "web", List.of("technology"),
        "frontend", List.of("web", "technology"),
        "backend", List.of("web", "technology"),
        "vegetable", List.of("food"),
        "fruit", List.of("food")
    );
    private static final Map<String, List<String>> PHRASE_TOPIC_RULES = Map.ofEntries(
        Map.entry("coles de bruselas", List.of("vegetable")),
        Map.entry("frutas y vegetales", List.of("fruit", "vegetable")),
        Map.entry("web para frontend", List.of("frontend")),
        Map.entry("front end", List.of("frontend")),
        Map.entry("front-end", List.of("frontend")),
        Map.entry("base de datos", List.of("backend")),
        Map.entry("machine learning", List.of("technology")),
        Map.entry("inteligencia artificial", List.of("technology")),
        Map.entry("vuelo y hotel", List.of("travel")),
        Map.entry("guia de viaje", List.of("travel"))
    );

    private final EntryEmbeddingRepository entryEmbeddingRepository;
    private final OllamaEmbeddingService ollamaEmbeddingService;
    private final EntryVectorStoreService entryVectorStoreService;
    private final ObjectMapper objectMapper;

    public EntrySemanticIndexService(
        EntryEmbeddingRepository entryEmbeddingRepository,
        OllamaEmbeddingService ollamaEmbeddingService,
        EntryVectorStoreService entryVectorStoreService,
        ObjectMapper objectMapper
    ) {
        this.entryEmbeddingRepository = entryEmbeddingRepository;
        this.ollamaEmbeddingService = ollamaEmbeddingService;
        this.entryVectorStoreService = entryVectorStoreService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void indexEntry(Entry entry) {
        try {
            ensureEmbedding(entry);
        } catch (Exception ex) {
            log.warn("Failed to refresh semantic index for entryId={}", entry == null ? null : entry.getId(), ex);
        }
    }

    @Transactional
    public Optional<double[]> ensureEmbedding(Entry entry) {
        entryVectorStoreService.initializeSchemaIfSupported();
        String embeddingDocument = buildEmbeddingDocument(entry);
        String focusEmbeddingDocument = buildFocusEmbeddingDocument(entry);
        if (!StringUtils.hasText(embeddingDocument)) {
            entryEmbeddingRepository.deleteByEntryId(entry.getId());
            return Optional.empty();
        }

        String contentHash = sha256(embeddingDocument + "\n---\n" + focusEmbeddingDocument);
        Optional<EntryEmbedding> existingEmbedding = entryEmbeddingRepository.findByEntryId(entry.getId());
        if (existingEmbedding.isPresent()) {
            EntryEmbedding current = existingEmbedding.get();
            if (contentHash.equals(current.getContentHash())
                && ollamaEmbeddingService.getModel().equals(current.getEmbeddingModel())) {
                Optional<double[]> storedVector = readEmbeddingVector(current.getEmbeddingJson());
                Optional<double[]> storedFocusVector = readEmbeddingVector(current.getFocusEmbeddingJson());
                storedVector.ifPresent(vector -> entryVectorStoreService.upsertEntryEmbedding(entry.getId(), vector));
                storedFocusVector.ifPresent(vector -> entryVectorStoreService.upsertFocusEmbedding(entry.getId(), vector));
                return storedVector;
            }
        }

        try {
            double[] vector = ollamaEmbeddingService.embed(embeddingDocument);
            double[] focusVector = StringUtils.hasText(focusEmbeddingDocument)
                ? ollamaEmbeddingService.embed(focusEmbeddingDocument)
                : vector;
            EntryEmbedding entryEmbedding = existingEmbedding.orElseGet(EntryEmbedding::new);
            entryEmbedding.setEntry(entry);
            entryEmbedding.setContentHash(contentHash);
            entryEmbedding.setEmbeddingModel(ollamaEmbeddingService.getModel());
            entryEmbedding.setEmbeddingJson(writeEmbeddingVector(vector));
            entryEmbedding.setFocusEmbeddingJson(writeEmbeddingVector(focusVector));
            entryEmbeddingRepository.save(entryEmbedding);
            entryVectorStoreService.upsertEntryEmbedding(entry.getId(), vector);
            entryVectorStoreService.upsertFocusEmbedding(entry.getId(), focusVector);
            return Optional.of(vector);
        } catch (Exception ex) {
            log.warn("Failed to index semantic embedding for entryId={}", entry.getId(), ex);
            return existingEmbedding.flatMap(embedding -> readEmbeddingVector(embedding.getEmbeddingJson()));
        }
    }

    public double[] ensureEmbeddingForQuery(String query) {
        try {
            return ollamaEmbeddingService.embed(query);
        } catch (Exception ex) {
            log.warn("Failed to generate query embedding", ex);
            throw ex;
        }
    }

    @Transactional
    public void deleteEmbedding(Long entryId) {
        entryEmbeddingRepository.deleteByEntryId(entryId);
    }

    public String buildSearchDocument(Entry entry) {
        List<String> lines = new ArrayList<>();
        appendLine(lines, "Titulo", entry.getTitle());
        appendLine(lines, "Flag", entry.getFlag() == null ? null : entry.getFlag().name());

        String tagLine = entry.getTags().stream()
            .map(tag -> tag.getName() == null ? "" : tag.getName().trim())
            .filter(StringUtils::hasText)
            .reduce((left, right) -> left + ", " + right)
            .orElse(null);
        appendLine(lines, "Tags", tagLine);
        appendLine(lines, "Categoria", entry.getProcessingCategory());
        appendLine(lines, "Ideas clave", joinJsonStringArray(entry.getProcessingKeyIdeasJson()));
        appendLine(lines, "Acciones", joinJsonStringArray(entry.getProcessingActionsJson()));

        for (Resource resource : entry.getResources()) {
            appendLine(lines, "Recurso", resource.getType() == null ? null : resource.getType().name());
            appendLine(lines, "Titulo recurso", resource.getTitle());

            if (resource instanceof TextResource textResource) {
                appendLine(lines, "Texto", RichTextContentUtils.extractPlainText(textResource.getTextContent()));
            } else if (resource instanceof LinkResource linkResource) {
                appendLine(lines, "URL", linkResource.getUrl());
                appendLine(lines, "Sitio", linkResource.getSiteName());
                appendLine(lines, "Descripcion", linkResource.getDescription());
                appendLine(lines, "Contenido", linkResource.getContentPreview());
            } else if (resource instanceof MediaResource mediaResource) {
                appendLine(lines, "Archivo", mediaResource.getFileName());
                appendLine(lines, "Mime", mediaResource.getMimeType());
                appendLine(lines, "Ruta", mediaResource.getStorageKey());
                appendLine(lines, "Texto extraido", mediaResource.getExtractedText());
            }
        }

        return String.join("\n", lines).trim();
    }

    public String buildEmbeddingDocument(Entry entry) {
        List<String> lines = new ArrayList<>();
        String tagLine = entry.getTags().stream()
            .map(tag -> tag.getName() == null ? "" : tag.getName().trim())
            .filter(StringUtils::hasText)
            .reduce((left, right) -> left + ", " + right)
            .orElse(null);

        appendEmbeddingLine(lines, "Tema", entry.getTitle(), 3);
        appendEmbeddingLine(lines, "Tags", tagLine, 3);
        appendEmbeddingLine(lines, "Categoria", entry.getProcessingCategory(), 2);
        appendEmbeddingLine(lines, "Conceptos", String.join(", ", extractCanonicalTopics(entry)), 3);
        appendEmbeddingLine(lines, "Ideas clave", joinJsonStringArray(entry.getProcessingKeyIdeasJson()), 2);
        appendEmbeddingLine(lines, "Acciones", joinJsonStringArray(entry.getProcessingActionsJson()), 1);

        for (Resource resource : entry.getResources()) {
            appendEmbeddingLine(lines, "Titulo recurso", resource.getTitle(), 1);

            if (resource instanceof TextResource textResource) {
                appendEmbeddingLine(lines, "Contenido", truncateForEmbedding(RichTextContentUtils.extractPlainText(textResource.getTextContent()), 900), 1);
            } else if (resource instanceof LinkResource linkResource) {
                appendEmbeddingLine(lines, "Contenido", truncateForEmbedding(linkResource.getDescription(), 320), 1);
                appendEmbeddingLine(lines, "Contenido", truncateForEmbedding(linkResource.getContentPreview(), 700), 1);
            } else if (resource instanceof MediaResource mediaResource) {
                appendEmbeddingLine(lines, "Archivo", truncateForEmbedding(mediaResource.getFileName(), 220), 1);
                appendEmbeddingLine(lines, "Contenido", truncateForEmbedding(mediaResource.getExtractedText(), 900), 1);
            }
        }

        return String.join("\n", lines).trim();
    }

    public String buildFocusEmbeddingDocument(Entry entry) {
        List<String> lines = new ArrayList<>();
        String tagLine = entry.getTags().stream()
            .map(tag -> tag.getName() == null ? "" : tag.getName().trim())
            .filter(StringUtils::hasText)
            .reduce((left, right) -> left + ", " + right)
            .orElse(null);

        appendEmbeddingLine(lines, "Tema", entry.getTitle(), 4);
        appendEmbeddingLine(lines, "Tags", tagLine, 4);
        appendEmbeddingLine(lines, "Categoria", entry.getProcessingCategory(), 3);
        appendEmbeddingLine(lines, "Conceptos", String.join(", ", extractCanonicalTopics(entry)), 4);
        appendEmbeddingLine(lines, "Ideas clave", joinJsonStringArray(entry.getProcessingKeyIdeasJson()), 3);
        appendEmbeddingLine(lines, "Acciones", joinJsonStringArray(entry.getProcessingActionsJson()), 1);

        return String.join("\n", lines).trim();
    }

    public Set<String> extractCanonicalTopics(Entry entry) {
        if (entry == null) {
            return Set.of();
        }

        List<String> parts = new ArrayList<>();
        parts.add(entry.getTitle());
        parts.add(entry.getProcessingCategory());
        parts.add(joinJsonStringArray(entry.getProcessingKeyIdeasJson()));
        parts.add(joinJsonStringArray(entry.getProcessingActionsJson()));
        entry.getTags().stream()
            .map(tag -> tag.getName() == null ? null : tag.getName().trim())
            .forEach(parts::add);

        for (Resource resource : entry.getResources()) {
            parts.add(resource.getTitle());
            if (resource instanceof TextResource textResource) {
                parts.add(truncateForEmbedding(RichTextContentUtils.extractPlainText(textResource.getTextContent()), 400));
            } else if (resource instanceof LinkResource linkResource) {
                parts.add(truncateForEmbedding(linkResource.getDescription(), 220));
                parts.add(truncateForEmbedding(linkResource.getContentPreview(), 400));
            } else if (resource instanceof MediaResource mediaResource) {
                parts.add(truncateForEmbedding(mediaResource.getFileName(), 120));
                parts.add(truncateForEmbedding(mediaResource.getExtractedText(), 400));
            }
        }

        return extractCanonicalTopics(String.join("\n", parts.stream().filter(StringUtils::hasText).toList()));
    }

    public Set<String> extractCanonicalTopics(String rawText) {
        String normalized = normalizeForTopics(rawText);
        if (!StringUtils.hasText(normalized)) {
            return Set.of();
        }

        Set<String> tokens = tokenizeForTopics(normalized);
        LinkedHashSet<String> topics = new LinkedHashSet<>();
        for (Map.Entry<String, List<String>> phraseRule : PHRASE_TOPIC_RULES.entrySet()) {
            String normalizedPhrase = normalizeForTopics(phraseRule.getKey());
            if (!StringUtils.hasText(normalizedPhrase) || !normalized.contains(normalizedPhrase)) {
                continue;
            }
            phraseRule.getValue().forEach(topic -> addTopicWithParents(topics, topic));
        }
        for (Map.Entry<String, List<String>> rule : CANONICAL_TOPIC_ALIASES.entrySet()) {
            boolean matched = rule.getValue().stream()
                .map(this::normalizeForTopics)
                .filter(StringUtils::hasText)
                .anyMatch(alias -> alias.contains(" ")
                    ? normalized.contains(alias)
                    : tokens.contains(alias));
            if (matched) {
                addTopicWithParents(topics, rule.getKey());
            }
        }
        return topics;
    }

    private void appendLine(List<String> lines, String label, String value) {
        if (!StringUtils.hasText(value)) {
            return;
        }
        lines.add(label + ": " + value.trim());
    }

    private void appendEmbeddingLine(List<String> lines, String label, String value, int repeats) {
        if (!StringUtils.hasText(value)) {
            return;
        }

        String trimmed = value.trim();
        for (int index = 0; index < Math.max(1, repeats); index += 1) {
            lines.add(label + ": " + trimmed);
        }
    }

    private void addTopicWithParents(Set<String> topics, String topic) {
        if (!StringUtils.hasText(topic) || !topics.add(topic)) {
            return;
        }
        for (String parent : CANONICAL_TOPIC_PARENTS.getOrDefault(topic, List.of())) {
            addTopicWithParents(topics, parent);
        }
    }

    private Set<String> tokenizeForTopics(String value) {
        return new LinkedHashSet<>(java.util.Arrays.stream(value.split("[^\\p{L}\\p{Nd}]+"))
            .map(String::trim)
            .filter(token -> token.length() >= 2)
            .toList());
    }

    private String normalizeForTopics(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String normalized = Normalizer.normalize(value.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        return normalized.replaceAll("\\p{M}+", "");
    }

    private String truncateForEmbedding(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return null;
        }

        String trimmed = value.trim();
        if (trimmed.length() <= maxLength) {
            return trimmed;
        }
        return trimmed.substring(0, maxLength);
    }

    private String joinJsonStringArray(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return null;
        }
        try {
            List<String> values = objectMapper.readValue(rawJson, new TypeReference<List<String>>() { });
            return values.stream().filter(StringUtils::hasText).map(String::trim).reduce((left, right) -> left + ", " + right).orElse(null);
        } catch (Exception ex) {
            return null;
        }
    }

    private Optional<double[]> readEmbeddingVector(String embeddingJson) {
        if (!StringUtils.hasText(embeddingJson)) {
            return Optional.empty();
        }

        try {
            List<Double> values = objectMapper.readValue(embeddingJson, new TypeReference<List<Double>>() { });
            double[] vector = new double[values.size()];
            for (int index = 0; index < values.size(); index += 1) {
                vector[index] = values.get(index);
            }
            return Optional.of(vector);
        } catch (Exception ex) {
            log.warn("Failed to read stored embedding JSON", ex);
            return Optional.empty();
        }
    }

    private String writeEmbeddingVector(double[] vector) {
        try {
            return objectMapper.writeValueAsString(vector);
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo serializar el embedding", ex);
        }
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible", ex);
        }
    }
}
