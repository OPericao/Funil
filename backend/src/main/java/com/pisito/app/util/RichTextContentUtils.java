package com.pisito.app.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class RichTextContentUtils {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String RICH_TEXT_KIND = "funil-rich-text";
    private static final Pattern LINK_HREF_PATTERN = Pattern.compile("(?i)<a\\b[^>]*\\bhref=(['\"])(.*?)\\1");

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

    public static String extractPlainTextWithLinks(String storedValue) {
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

            String plainText = extractPlainText(storedValue);
            String html = node.path("html").asText("");
            Set<String> hrefs = extractHrefValues(html);
            if (hrefs.isEmpty()) {
                return plainText;
            }

            StringBuilder combined = new StringBuilder();
            if (StringUtils.hasText(plainText)) {
                combined.append(plainText.trim());
            }

            for (String href : hrefs) {
                if (!StringUtils.hasText(href)) {
                    continue;
                }
                String normalizedHref = normalize(href);
                if (!StringUtils.hasText(normalizedHref)) {
                    continue;
                }
                if (combined.length() > 0) {
                    combined.append('\n');
                }
                combined.append(normalizedHref);
            }

            return combined.toString().trim();
        } catch (Exception ignored) {
            return extractPlainText(storedValue);
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

    private static Set<String> extractHrefValues(String html) {
        Set<String> hrefs = new LinkedHashSet<>();
        if (!StringUtils.hasText(html)) {
            return hrefs;
        }

        Matcher matcher = LINK_HREF_PATTERN.matcher(html);
        while (matcher.find()) {
            String href = decodeHtmlEntities(matcher.group(2));
            if (StringUtils.hasText(href)) {
                hrefs.add(href.trim());
            }
        }
        return hrefs;
    }

    private static String decodeHtmlEntities(String value) {
        if (value == null) {
            return null;
        }
        return value
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");
    }
}
