package com.pisito.app.controller.dto.entry;

import java.time.Instant;

public record EntryRelationshipResponse(
    Long id,
    Long sourceEntryId,
    Long targetEntryId,
    String sourceHandle,
    String targetHandle,
    Instant createdAt
) {
}
