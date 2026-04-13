package com.pisito.app.controller.dto.entry;

import jakarta.validation.constraints.NotNull;

public class CreateEntryRelationshipRequest {

    @NotNull
    private Long sourceEntryId;

    @NotNull
    private Long targetEntryId;

    private String sourceHandle;

    private String targetHandle;

    public Long getSourceEntryId() {
        return sourceEntryId;
    }

    public void setSourceEntryId(Long sourceEntryId) {
        this.sourceEntryId = sourceEntryId;
    }

    public Long getTargetEntryId() {
        return targetEntryId;
    }

    public void setTargetEntryId(Long targetEntryId) {
        this.targetEntryId = targetEntryId;
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
