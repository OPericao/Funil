package com.pisito.app.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

@Service
public class OllamaEmbeddingService {

    private final RestClient restClient;
    private final String model;

    public OllamaEmbeddingService(
        RestClient.Builder restClientBuilder,
        @Value("${ollama.base-url:http://localhost:11434}") String baseUrl,
        @Value("${ollama.embedding-model:nomic-embed-text}") String model
    ) {
        this.restClient = restClientBuilder.baseUrl(baseUrl).build();
        this.model = model;
    }

    public String getModel() {
        return model;
    }

    public double[] embed(String input) {
        if (!StringUtils.hasText(input)) {
            throw new ResponseStatusException(BAD_GATEWAY, "Texto vacio para embeddings");
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("model", model);
        payload.put("input", input);

        JsonNode responseNode;
        try {
            responseNode = restClient.post()
                .uri("/api/embed")
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(JsonNode.class);
        } catch (Exception ex) {
            throw new ResponseStatusException(BAD_GATEWAY, "No se pudo consultar Ollama embeddings", ex);
        }

        JsonNode embeddingNode = extractEmbeddingNode(responseNode);
        if (embeddingNode == null || !embeddingNode.isArray() || embeddingNode.isEmpty()) {
            throw new ResponseStatusException(BAD_GATEWAY, "Respuesta invalida de embeddings");
        }

        double[] vector = new double[embeddingNode.size()];
        for (int index = 0; index < embeddingNode.size(); index += 1) {
            vector[index] = embeddingNode.get(index).asDouble();
        }
        return vector;
    }

    private JsonNode extractEmbeddingNode(JsonNode responseNode) {
        if (responseNode == null) {
            return null;
        }
        JsonNode embeddingsNode = responseNode.path("embeddings");
        if (embeddingsNode.isArray() && !embeddingsNode.isEmpty()) {
            JsonNode firstEmbedding = embeddingsNode.get(0);
            if (firstEmbedding != null && firstEmbedding.isArray()) {
                return firstEmbedding;
            }
        }

        JsonNode legacyEmbeddingNode = responseNode.path("embedding");
        if (legacyEmbeddingNode.isArray() && !legacyEmbeddingNode.isEmpty()) {
            return legacyEmbeddingNode;
        }
        return null;
    }
}
