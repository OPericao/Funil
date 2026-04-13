package com.pisito.app.controller.dto.resource;

import com.pisito.app.model.ResourceType;

import java.time.Instant;

public record ResourceResponse(
    Long id,
    ResourceType type,
    String title,
    String textContent,
    String url,
    String siteName,
    String description,
    String contentPreview,
    String storageKey,
    String fileName,
    String mimeType,
    Instant createdAt
) {
}


