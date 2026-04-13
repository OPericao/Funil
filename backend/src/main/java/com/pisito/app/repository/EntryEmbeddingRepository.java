package com.pisito.app.repository;

import com.pisito.app.model.EntryEmbedding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EntryEmbeddingRepository extends JpaRepository<EntryEmbedding, Long> {

    Optional<EntryEmbedding> findByEntryId(Long entryId);

    void deleteByEntryId(Long entryId);
}
