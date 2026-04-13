package com.pisito.app.controller.dto.explore;

import java.util.List;

public record ExploreCollectionsResponse(
    List<ExploreCollectionItemResponse> collections
) {
}
