package com.pisito.app.controller.dto.entry;

import java.util.List;

public record EntrySearchDebugResponse(
    double topicScore,
    double tagScore,
    double noteScore,
    double titleScore,
    double semanticScore,
    double conflictPenalty,
    double structuredScore,
    double finalScore,
    int directTagMatches,
    List<String> queryTopics,
    List<String> tagTopics
) {
}
