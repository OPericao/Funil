package com.pisito.app.controller.dto.explore;

import java.util.List;

public record ExploreRecommendationItemResponse(
    String type,
    String title,
    String description,
    String suggestedQuestion,
    List<ExploreSourceResponse> sources
) {
}
