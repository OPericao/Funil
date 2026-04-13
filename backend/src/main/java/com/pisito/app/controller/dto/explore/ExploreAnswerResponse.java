package com.pisito.app.controller.dto.explore;

import java.util.List;

public record ExploreAnswerResponse(
    String question,
    String answer,
    List<ExploreSourceResponse> sources
) {
}
