package com.pisito.app.controller.dto.explore;

import java.util.List;

public record ExploreCollectionItemResponse(
    String kind,
    String title,
    String description,
    String suggestedQuestion,
    int entryCount,
    List<ExploreSourceResponse> sources
) {
}
