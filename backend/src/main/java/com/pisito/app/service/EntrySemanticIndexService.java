package com.pisito.app.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pisito.app.model.Entry;
import com.pisito.app.model.EntryEmbedding;
import com.pisito.app.model.LinkResource;
import com.pisito.app.model.MediaResource;
import com.pisito.app.model.Resource;
import com.pisito.app.model.TextResource;
import com.pisito.app.repository.EntryEmbeddingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

@Service
public class EntrySemanticIndexService {

    private static final Logger log = LoggerFactory.getLogger(EntrySemanticIndexService.class);

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
        String searchDocument = buildSearchDocument(entry);
        if (!StringUtils.hasText(searchDocument)) {
            entryEmbeddingRepository.deleteByEntryId(entry.getId());
            return Optional.empty();
        }

        String contentHash = sha256(searchDocument);
        Optional<EntryEmbedding> existingEmbedding = entryEmbeddingRepository.findByEntryId(entry.getId());
        if (existingEmbedding.isPresent()) {
            EntryEmbedding current = existingEmbedding.get();
            if (contentHash.equals(current.getContentHash())
                && ollamaEmbeddingService.getModel().equals(current.getEmbeddingModel())) {
                Optional<double[]> storedVector = readEmbeddingVector(current.getEmbeddingJson());
                storedVector.ifPresent(vector -> entryVectorStoreService.upsertEntryEmbedding(entry.getId(), vector));
                return storedVector;
            }
        }

        try {
            double[] vector = ollamaEmbeddingService.embed(searchDocument);
            EntryEmbedding entryEmbedding = existingEmbedding.orElseGet(EntryEmbedding::new);
            entryEmbedding.setEntry(entry);
            entryEmbedding.setContentHash(contentHash);
            entryEmbedding.setEmbeddingModel(ollamaEmbeddingService.getModel());
            entryEmbedding.setEmbeddingJson(writeEmbeddingVector(vector));
            entryEmbeddingRepository.save(entryEmbedding);
            entryVectorStoreService.upsertEntryEmbedding(entry.getId(), vector);
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
                appendLine(lines, "Texto", textResource.getTextContent());
            } else if (resource instanceof LinkResource linkResource) {
                appendLine(lines, "URL", linkResource.getUrl());
                appendLine(lines, "Sitio", linkResource.getSiteName());
                appendLine(lines, "Descripcion", linkResource.getDescription());
                appendLine(lines, "Contenido", linkResource.getContentPreview());
            } else if (resource instanceof MediaResource mediaResource) {
                appendLine(lines, "Archivo", mediaResource.getFileName());
                appendLine(lines, "Mime", mediaResource.getMimeType());
                appendLine(lines, "Ruta", mediaResource.getStorageKey());
            }
        }

        return String.join("\n", lines).trim();
    }

    private void appendLine(List<String> lines, String label, String value) {
        if (!StringUtils.hasText(value)) {
            return;
        }
        lines.add(label + ": " + value.trim());
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
