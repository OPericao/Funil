package com.pisito.app.controller.dto.explore;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ExploreConversationTurnRequest {

    @NotBlank
    @Size(max = 32)
    private String role;
    @NotBlank
    @Size(max = 2_000)
    private String content;

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
