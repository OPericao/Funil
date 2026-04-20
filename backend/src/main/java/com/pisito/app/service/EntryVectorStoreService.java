package com.pisito.app.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.List;

@Service
public class EntryVectorStoreService {

    private static final Logger log = LoggerFactory.getLogger(EntryVectorStoreService.class);

    private final JdbcTemplate jdbcTemplate;
    private final DataSource dataSource;
    private final ObjectMapper objectMapper;
    private final int embeddingDimensions;
    private volatile boolean pgvectorReady;
    private volatile boolean initializationAttempted;

    public EntryVectorStoreService(
        JdbcTemplate jdbcTemplate,
        DataSource dataSource,
        ObjectMapper objectMapper,
        @Value("${ollama.embedding-dimensions:768}") int embeddingDimensions
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.dataSource = dataSource;
        this.objectMapper = objectMapper;
        this.embeddingDimensions = embeddingDimensions;
    }

    public void initializeSchemaIfSupported() {
        if (initializationAttempted) {
            return;
        }
        initializationAttempted = true;

        if (!isPostgres()) {
            log.info("Skipping pgvector initialization because datasource is not PostgreSQL");
            pgvectorReady = false;
            return;
        }

        try {
            jdbcTemplate.execute("create extension if not exists vector with schema extensions");
            jdbcTemplate.execute(
                "alter table entry_embeddings " +
                    "add column if not exists focus_embedding_json TEXT"
            );
            jdbcTemplate.execute(
                "alter table entry_embeddings " +
                    "add column if not exists embedding extensions.vector(" + embeddingDimensions + ")"
            );
            jdbcTemplate.execute(
                "alter table entry_embeddings " +
                    "add column if not exists focus_embedding extensions.vector(" + embeddingDimensions + ")"
            );
            jdbcTemplate.execute(
                "create index if not exists entry_embeddings_embedding_hnsw " +
                    "on entry_embeddings using hnsw (embedding vector_cosine_ops)"
            );
            jdbcTemplate.execute(
                "create index if not exists entry_embeddings_focus_embedding_hnsw " +
                    "on entry_embeddings using hnsw (focus_embedding vector_cosine_ops)"
            );
            pgvectorReady = true;
            log.info("pgvector schema ready for entry_embeddings with dimensions={}", embeddingDimensions);
        } catch (Exception ex) {
            pgvectorReady = false;
            log.warn("Failed to initialize pgvector schema for entry_embeddings", ex);
        }
    }

    public void backfillMissingVectors(String expectedModel) {
        if (!isReady()) {
            return;
        }

        List<StoredEmbeddingRow> rows = jdbcTemplate.query(
            """
                select entry_id, embedding_json
                from entry_embeddings
                where embedding is null
                  and embedding_json is not null
                  and embedding_model = ?
                order by updated_at desc
                """,
            (rs, _rowNum) -> new StoredEmbeddingRow(
                rs.getLong("entry_id"),
                rs.getString("embedding_json")
            ),
            expectedModel
        );

        int updated = 0;
        for (StoredEmbeddingRow row : rows) {
            double[] vector = parseVector(row.embeddingJson());
            if (vector == null) {
                continue;
            }
            if (upsertEntryEmbedding(row.entryId(), vector)) {
                updated += 1;
            }
        }

        if (updated > 0) {
            log.info("Backfilled {} entry embeddings into pgvector column", updated);
        }
    }

    public boolean upsertEntryEmbedding(Long entryId, double[] vector) {
        return upsertVector(entryId, vector, VectorKind.CONTENT);
    }

    public boolean upsertFocusEmbedding(Long entryId, double[] vector) {
        return upsertVector(entryId, vector, VectorKind.FOCUS);
    }

    private boolean upsertVector(Long entryId, double[] vector, VectorKind kind) {
        if (entryId == null || vector == null || vector.length == 0 || !isReady()) {
            return false;
        }
        if (vector.length != embeddingDimensions) {
            log.warn(
                "Skipping pgvector upsert for entryId={} because embedding dimensions {} do not match configured {}",
                entryId,
                vector.length,
                embeddingDimensions
            );
            return false;
        }

        try {
            jdbcTemplate.update(
                "update entry_embeddings set " + kind.columnName() + " = cast(? as extensions.vector(" + embeddingDimensions + ")) where entry_id = ?",
                toVectorLiteral(vector),
                entryId
            );
            return true;
        } catch (Exception ex) {
            log.warn("Failed to upsert pgvector embedding for entryId={}", entryId, ex);
            return false;
        }
    }

    public List<Long> findNearestEntryIds(
        Long userId,
        double[] queryVector,
        int limit,
        double similarityThreshold,
        Long excludedEntryId
    ) {
        return findNearestEntryMatches(userId, queryVector, limit, similarityThreshold, excludedEntryId).stream()
            .map(NeighborMatch::entryId)
            .toList();
    }

    public List<NeighborMatch> findNearestEntryMatches(
        Long userId,
        double[] queryVector,
        int limit,
        double similarityThreshold,
        Long excludedEntryId
    ) {
        return findNearestEntryMatches(userId, queryVector, limit, similarityThreshold, excludedEntryId, VectorKind.CONTENT);
    }

    public List<NeighborMatch> findNearestEntryMatches(
        Long userId,
        double[] queryVector,
        int limit,
        double similarityThreshold,
        Long excludedEntryId,
        VectorKind kind
    ) {
        if (userId == null || queryVector == null || queryVector.length == 0 || limit <= 0 || !isReady()) {
            return List.of();
        }
        if (queryVector.length != embeddingDimensions) {
            log.warn(
                "Skipping pgvector search because query dimensions {} do not match configured {}",
                queryVector.length,
                embeddingDimensions
            );
            return List.of();
        }

        String vectorLiteral = toVectorLiteral(queryVector);
        String sql = """
            select
              ee.entry_id,
              1 - (ee.%2$s <=> cast(? as extensions.vector(%1$d))) as similarity
            from entry_embeddings ee
            join entries e on e.id = ee.entry_id
            where e.user_id = ?
              and ee.%2$s is not null
              and (? is null or ee.entry_id <> ?)
              and 1 - (ee.%2$s <=> cast(? as extensions.vector(%1$d))) >= ?
            order by ee.%2$s <=> cast(? as extensions.vector(%1$d)) asc
            limit ?
            """.formatted(embeddingDimensions, kind.columnName());

        try {
            return jdbcTemplate.query(
                sql,
                (rs, _rowNum) -> new NeighborMatch(
                    rs.getLong("entry_id"),
                    rs.getDouble("similarity")
                ),
                vectorLiteral,
                userId,
                excludedEntryId,
                excludedEntryId,
                vectorLiteral,
                similarityThreshold,
                vectorLiteral,
                limit
            );
        } catch (Exception ex) {
            log.warn("Failed to run pgvector nearest-neighbor query", ex);
            return List.of();
        }
    }

    public boolean isReady() {
        if (!initializationAttempted) {
            initializeSchemaIfSupported();
        }
        return pgvectorReady;
    }

    private boolean isPostgres() {
        try (Connection connection = dataSource.getConnection()) {
            String productName = connection.getMetaData().getDatabaseProductName();
            return StringUtils.hasText(productName)
                && productName.toLowerCase(java.util.Locale.ROOT).contains("postgres");
        } catch (Exception ex) {
            log.warn("Failed to inspect datasource metadata for pgvector support", ex);
            return false;
        }
    }

    private double[] parseVector(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return null;
        }

        try {
            List<Double> values = objectMapper.readValue(rawJson, new TypeReference<List<Double>>() { });
            if (values.size() != embeddingDimensions) {
                log.warn(
                    "Skipping pgvector backfill because stored embedding dimensions {} do not match configured {}",
                    values.size(),
                    embeddingDimensions
                );
                return null;
            }
            double[] vector = new double[values.size()];
            for (int index = 0; index < values.size(); index += 1) {
                vector[index] = values.get(index);
            }
            return vector;
        } catch (Exception ex) {
            log.warn("Failed to parse stored embedding JSON for pgvector backfill", ex);
            return null;
        }
    }

    private String toVectorLiteral(double[] vector) {
        StringBuilder builder = new StringBuilder("[");
        for (int index = 0; index < vector.length; index += 1) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(Double.toString(vector[index]));
        }
        builder.append(']');
        return builder.toString();
    }

    private record StoredEmbeddingRow(Long entryId, String embeddingJson) {
    }

    public record NeighborMatch(Long entryId, double similarity) {
    }

    public enum VectorKind {
        CONTENT("embedding"),
        FOCUS("focus_embedding");

        private final String columnName;

        VectorKind(String columnName) {
            this.columnName = columnName;
        }

        public String columnName() {
            return columnName;
        }
    }
}
