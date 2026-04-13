package com.pisito.app.service;

import com.pisito.app.controller.dto.entry.CreateEntryRelationshipRequest;
import com.pisito.app.controller.dto.entry.EntryRelationshipResponse;
import com.pisito.app.model.Entry;
import com.pisito.app.model.EntryRelationship;
import com.pisito.app.repository.EntryRelationshipRepository;
import com.pisito.app.repository.EntryRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class EntryRelationshipService {

    private final EntryRelationshipRepository entryRelationshipRepository;
    private final EntryRepository entryRepository;

    public EntryRelationshipService(
        EntryRelationshipRepository entryRelationshipRepository,
        EntryRepository entryRepository
    ) {
        this.entryRelationshipRepository = entryRelationshipRepository;
        this.entryRepository = entryRepository;
    }

    @Transactional(readOnly = true)
    public List<EntryRelationshipResponse> findAll(Long userId) {
        return entryRelationshipRepository.findAllBySourceEntryUserIdOrTargetEntryUserIdOrderByCreatedAtAsc(userId, userId)
            .stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public EntryRelationshipResponse create(Long userId, CreateEntryRelationshipRequest request) {
        Long sourceEntryId = request.getSourceEntryId();
        Long targetEntryId = request.getTargetEntryId();
        if (sourceEntryId.equals(targetEntryId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes relacionar una nota consigo misma");
        }

        Entry sourceEntry = getEntryOrThrow(userId, sourceEntryId);
        Entry targetEntry = getEntryOrThrow(userId, targetEntryId);

        if (entryRelationshipRepository.existsBySourceEntryIdAndTargetEntryId(sourceEntryId, targetEntryId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La relacion ya existe");
        }

        EntryRelationship relationship = new EntryRelationship();
        relationship.setSourceEntry(sourceEntry);
        relationship.setTargetEntry(targetEntry);
        relationship.setSourceHandle(trimOrNull(request.getSourceHandle()));
        relationship.setTargetHandle(trimOrNull(request.getTargetHandle()));
        return toResponse(entryRelationshipRepository.save(relationship));
    }

    @Transactional
    public void delete(Long userId, Long relationshipId) {
        EntryRelationship relationship = entryRelationshipRepository.findByIdAndSourceEntryUserId(relationshipId, userId)
            .orElseGet(() -> entryRelationshipRepository.findById(relationshipId)
                .filter(item -> item.getTargetEntry().getUser().getId().equals(userId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Relacion no encontrada")));
        entryRelationshipRepository.delete(relationship);
    }

    @Transactional
    public void deleteForEntry(Long entryId) {
        entryRelationshipRepository.deleteBySourceEntryIdOrTargetEntryId(entryId, entryId);
    }

    private Entry getEntryOrThrow(Long userId, Long entryId) {
        return entryRepository.findByIdAndUserId(entryId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found"));
    }

    private EntryRelationshipResponse toResponse(EntryRelationship relationship) {
        return new EntryRelationshipResponse(
            relationship.getId(),
            relationship.getSourceEntry().getId(),
            relationship.getTargetEntry().getId(),
            relationship.getSourceHandle(),
            relationship.getTargetHandle(),
            relationship.getCreatedAt()
        );
    }

    private String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
