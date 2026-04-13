package com.pisito.app.repository;

import com.pisito.app.model.EntryRelationship;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EntryRelationshipRepository extends JpaRepository<EntryRelationship, Long> {

    List<EntryRelationship> findAllBySourceEntryUserIdOrTargetEntryUserIdOrderByCreatedAtAsc(Long sourceUserId, Long targetUserId);

    Optional<EntryRelationship> findByIdAndSourceEntryUserId(Long id, Long userId);

    boolean existsBySourceEntryIdAndTargetEntryId(Long sourceEntryId, Long targetEntryId);

    void deleteBySourceEntryIdOrTargetEntryId(Long sourceEntryId, Long targetEntryId);
}
