package com.pisito.app.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
    name = "entry_relationships",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_entry_relationship_source_target", columnNames = {"source_entry_id", "target_entry_id"})
    }
)
public class EntryRelationship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_entry_id", nullable = false)
    private Entry sourceEntry;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "target_entry_id", nullable = false)
    private Entry targetEntry;

    @Column(name = "source_handle", length = 50)
    private String sourceHandle;

    @Column(name = "target_handle", length = 50)
    private String targetHandle;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Entry getSourceEntry() {
        return sourceEntry;
    }

    public void setSourceEntry(Entry sourceEntry) {
        this.sourceEntry = sourceEntry;
    }

    public Entry getTargetEntry() {
        return targetEntry;
    }

    public void setTargetEntry(Entry targetEntry) {
        this.targetEntry = targetEntry;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getSourceHandle() {
        return sourceHandle;
    }

    public void setSourceHandle(String sourceHandle) {
        this.sourceHandle = sourceHandle;
    }

    public String getTargetHandle() {
        return targetHandle;
    }

    public void setTargetHandle(String targetHandle) {
        this.targetHandle = targetHandle;
    }
}
