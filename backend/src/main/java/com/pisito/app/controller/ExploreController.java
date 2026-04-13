package com.pisito.app.controller;

import com.pisito.app.controller.dto.explore.ExploreAnswerResponse;
import com.pisito.app.controller.dto.explore.ExploreAskRequest;
import com.pisito.app.controller.dto.explore.ExploreCollectionsResponse;
import com.pisito.app.controller.dto.explore.ExploreRecommendationsResponse;
import com.pisito.app.controller.dto.explore.ExploreSuggestionsResponse;
import com.pisito.app.service.ExploreService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/explore")
public class ExploreController {

    private final ExploreService exploreService;

    public ExploreController(ExploreService exploreService) {
        this.exploreService = exploreService;
    }

    @GetMapping("/recommendations")
    public ExploreRecommendationsResponse recommendations(
        Authentication authentication,
        @RequestParam(name = "refresh", required = false) String refreshToken
    ) {
        return exploreService.recommendations(currentUserId(authentication), refreshToken);
    }

    @GetMapping("/collections")
    public ExploreCollectionsResponse collections(Authentication authentication) {
        return exploreService.collections(currentUserId(authentication));
    }

    @GetMapping("/suggestions")
    public ExploreSuggestionsResponse suggestions(Authentication authentication) {
        return exploreService.suggestions(currentUserId(authentication));
    }

    @PostMapping("/ask")
    public ExploreAnswerResponse ask(Authentication authentication, @Valid @RequestBody ExploreAskRequest request) {
        return exploreService.ask(currentUserId(authentication), request.getQuestion());
    }

    private Long currentUserId(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long userId) {
            return userId;
        }
        return Long.parseLong(String.valueOf(principal));
    }
}
