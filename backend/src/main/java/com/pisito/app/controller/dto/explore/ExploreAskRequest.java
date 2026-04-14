package com.pisito.app.controller.dto.explore;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;

public class ExploreAskRequest {

    @NotBlank
    @Size(max = 500)
    private String question;
    @Size(max = 8)
    private List<Long> sourceEntryIds = new ArrayList<>();
    @Valid
    private ExploreActiveChipRequest activeChip;
    @Valid
    @Size(max = 12)
    private List<ExploreConversationTurnRequest> history = new ArrayList<>();

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }

    public List<Long> getSourceEntryIds() {
        return sourceEntryIds;
    }

    public void setSourceEntryIds(List<Long> sourceEntryIds) {
        this.sourceEntryIds = sourceEntryIds == null ? new ArrayList<>() : sourceEntryIds;
    }

    public ExploreActiveChipRequest getActiveChip() {
        return activeChip;
    }

    public void setActiveChip(ExploreActiveChipRequest activeChip) {
        this.activeChip = activeChip;
    }

    public List<ExploreConversationTurnRequest> getHistory() {
        return history;
    }

    public void setHistory(List<ExploreConversationTurnRequest> history) {
        this.history = history == null ? new ArrayList<>() : history;
    }
}
