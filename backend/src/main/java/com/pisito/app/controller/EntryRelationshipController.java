package com.pisito.app.controller;

import com.pisito.app.controller.dto.entry.CreateEntryRelationshipRequest;
import com.pisito.app.controller.dto.entry.EntryRelationshipResponse;
import com.pisito.app.service.EntryRelationshipService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/entries/relationships")
public class EntryRelationshipController {

    private final EntryRelationshipService entryRelationshipService;

    public EntryRelationshipController(EntryRelationshipService entryRelationshipService) {
        this.entryRelationshipService = entryRelationshipService;
    }

    @GetMapping
    public List<EntryRelationshipResponse> getAll(Authentication authentication) {
        return entryRelationshipService.findAll(currentUserId(authentication));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EntryRelationshipResponse create(
        Authentication authentication,
        @Valid @RequestBody CreateEntryRelationshipRequest request
    ) {
        return entryRelationshipService.create(currentUserId(authentication), request);
    }

    @DeleteMapping("/{relationshipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication authentication, @PathVariable Long relationshipId) {
        entryRelationshipService.delete(currentUserId(authentication), relationshipId);
    }

    private Long currentUserId(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof Long userId) {
            return userId;
        }
        return Long.parseLong(String.valueOf(principal));
    }
}
