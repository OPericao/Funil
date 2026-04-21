package com.pisito.app.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

public final class RichTextContentUtils {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String RICH_TEXT_KIND = "funil-rich-text";

    private RichTextContentUtils() {
    }

    public static String extractPlainText(String storedValue) {
        if (!StringUtils.hasText(storedValue)) {
            return storedValue;
        }

        String trimmed = storedValue.trim();
        if (!trimmed.startsWith("{")) {
            return trimmed;
        }

        try {
            JsonNode node = OBJECT_MAPPER.readTree(trimmed);
            if (!node.isObject() || !RICH_TEXT_KIND.equals(node.path("kind").asText())) {
                return trimmed;
            }

            String text = normalize(node.path("text").asText(null));
            if (StringUtils.hasText(text)) {
                return text;
            }

            return stripHtml(node.path("html").asText(""));
        } catch (Exception ignored) {
            return trimmed;
        }
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.replace("\r\n", "\n").trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static String stripHtml(String html) {
        if (!StringUtils.hasText(html)) {
            return "";
        }

        return html
            .replaceAll("(?i)<br\\s*/?>", "\n")
            .replaceAll("(?i)</p>", "\n")
            .replaceAll("(?i)</li>", "\n")
            .replaceAll("<[^>]+>", " ")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replaceAll("[ \\t\\x0B\\f\\r]+", " ")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
    }
}
