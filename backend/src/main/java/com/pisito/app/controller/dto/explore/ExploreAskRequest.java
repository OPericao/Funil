package com.pisito.app.controller.dto.explore;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ExploreAskRequest {

    @NotBlank
    @Size(max = 500)
    private String question;

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }
}
