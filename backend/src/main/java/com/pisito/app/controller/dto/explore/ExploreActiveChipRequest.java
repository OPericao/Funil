package com.pisito.app.controller.dto.explore;

import jakarta.validation.constraints.Size;

public class ExploreActiveChipRequest {

    @Size(max = 32)
    private String type;
    @Size(max = 120)
    private String title;
    @Size(max = 300)
    private String description;
    @Size(max = 500)
    private String suggestedQuestion;

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getSuggestedQuestion() {
        return suggestedQuestion;
    }

    public void setSuggestedQuestion(String suggestedQuestion) {
        this.suggestedQuestion = suggestedQuestion;
    }
}
