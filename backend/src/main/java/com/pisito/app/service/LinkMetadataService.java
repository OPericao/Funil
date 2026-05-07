package com.pisito.app.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.HtmlUtils;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class LinkMetadataService {

    private static final Logger log = LoggerFactory.getLogger(LinkMetadataService.class);
    private static final Pattern TITLE_PATTERN = Pattern.compile("(?is)<title[^>]*>(.*?)</title>");
    private static final Pattern META_PATTERN = Pattern.compile(
        "(?is)<meta\\s+[^>]*(?:name|property)\\s*=\\s*[\"']([^\"']+)[\"'][^>]*content\\s*=\\s*[\"']([^\"']*)[\"'][^>]*>"
            + "|<meta\\s+[^>]*content\\s*=\\s*[\"']([^\"']*)[\"'][^>]*(?:name|property)\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>"
    );
    private static final Pattern SCRIPT_PATTERN = Pattern.compile("(?is)<script[^>]*>.*?</script>");
    private static final Pattern STYLE_PATTERN = Pattern.compile("(?is)<style[^>]*>.*?</style>");
    private static final Pattern NOSCRIPT_PATTERN = Pattern.compile("(?is)<noscript[^>]*>.*?</noscript>");
    private static final Pattern SVG_PATTERN = Pattern.compile("(?is)<svg[^>]*>.*?</svg>");
    private static final Pattern TAG_PATTERN = Pattern.compile("(?is)<[^>]+>");
    private static final int DESCRIPTION_LIMIT = 600;
    private static final int CONTENT_PREVIEW_LIMIT = 2000;

    private final RestClient restClient;
    private final String userAgent;

    public LinkMetadataService(
        RestClient.Builder restClientBuilder,
        @Value("${link-preview.user-agent:FunilBot/1.0 (+https://localhost)}") String userAgent
    ) {
        this.restClient = restClientBuilder.build();
        this.userAgent = StringUtils.hasText(userAgent) ? userAgent.trim() : "FunilBot/1.0";
    }

    public Optional<LinkMetadata> extract(String rawUrl) {
        URI uri = normalizeHttpUri(rawUrl).orElse(null);
        if (uri == null) {
            return Optional.empty();
        }

        try {
            String html = restClient.get()
                .uri(uri)
                .header("User-Agent", userAgent)
                .header("Accept", "text/html,application/xhtml+xml")
                .retrieve()
                .body(String.class);

            if (!StringUtils.hasText(html)) {
                return Optional.of(fallbackMetadata(uri));
            }

            String title = firstNonBlank(
                metaContent(html, "og:title"),
                metaContent(html, "twitter:title"),
                extractTitle(html)
            );
            String description = firstNonBlank(
                metaContent(html, "og:description"),
                metaContent(html, "twitter:description"),
                metaContent(html, "description")
            );
            String siteName = firstNonBlank(
                metaContent(html, "og:site_name"),
                metaContent(html, "application-name"),
                humanizeHost(uri.getHost())
            );
            String previewImageUrl = firstNonBlank(
                resolvePreviewUrl(uri, metaContent(html, "og:image")),
                resolvePreviewUrl(uri, metaContent(html, "twitter:image")),
                resolvePreviewUrl(uri, metaContent(html, "twitter:image:src"))
            );
            String contentPreview = extractVisibleText(html);

            return Optional.of(new LinkMetadata(
                truncate(title, 120),
                truncate(description, DESCRIPTION_LIMIT),
                truncate(siteName, 255),
                truncate(contentPreview, CONTENT_PREVIEW_LIMIT),
                truncate(previewImageUrl, 2000)
            ));
        } catch (RestClientException ex) {
            log.debug("link metadata fetch failed for url={}", uri, ex);
            return Optional.of(fallbackMetadata(uri));
        }
    }

    private Optional<URI> normalizeHttpUri(String rawUrl) {
        if (!StringUtils.hasText(rawUrl)) {
            return Optional.empty();
        }

        String candidate = rawUrl.trim();
        if (!candidate.matches("(?i)^https?://.*")) {
            candidate = "https://" + candidate;
        }

        try {
            URI uri = new URI(candidate);
            String scheme = uri.getScheme();
            if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
                return Optional.empty();
            }
            if (!StringUtils.hasText(uri.getHost())) {
                return Optional.empty();
            }
            return Optional.of(uri);
        } catch (URISyntaxException ex) {
            return Optional.empty();
        }
    }

    private LinkMetadata fallbackMetadata(URI uri) {
        String siteName = humanizeHost(uri.getHost());
        return new LinkMetadata(null, null, truncate(siteName, 255), null, null);
    }

    private String resolvePreviewUrl(URI pageUri, String rawValue) {
        if (!StringUtils.hasText(rawValue)) {
            return null;
        }
        try {
            return pageUri.resolve(rawValue.trim()).toString();
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String extractTitle(String html) {
        Matcher matcher = TITLE_PATTERN.matcher(html);
        if (!matcher.find()) {
            return null;
        }
        return cleanText(matcher.group(1));
    }

    private String metaContent(String html, String metaKey) {
        Matcher matcher = META_PATTERN.matcher(html);
        while (matcher.find()) {
            String leftKey = cleanText(matcher.group(1));
            String leftValue = cleanText(matcher.group(2));
            String rightValue = cleanText(matcher.group(3));
            String rightKey = cleanText(matcher.group(4));

            if (metaKey.equalsIgnoreCase(leftKey) && StringUtils.hasText(leftValue)) {
                return leftValue;
            }
            if (metaKey.equalsIgnoreCase(rightKey) && StringUtils.hasText(rightValue)) {
                return rightValue;
            }
        }
        return null;
    }

    private String extractVisibleText(String html) {
        String withoutScripts = SCRIPT_PATTERN.matcher(html).replaceAll(" ");
        String withoutStyles = STYLE_PATTERN.matcher(withoutScripts).replaceAll(" ");
        String withoutNoscript = NOSCRIPT_PATTERN.matcher(withoutStyles).replaceAll(" ");
        String withoutSvg = SVG_PATTERN.matcher(withoutNoscript).replaceAll(" ");
        String plainText = TAG_PATTERN.matcher(withoutSvg).replaceAll(" ");
        return cleanText(plainText);
    }

    private String cleanText(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String normalized = HtmlUtils.htmlUnescape(value)
            .replace('\u00A0', ' ')
            .replaceAll("\\s+", " ")
            .trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String humanizeHost(String host) {
        if (!StringUtils.hasText(host)) {
            return null;
        }
        String normalizedHost = host.trim().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        return normalizedHost.isEmpty() ? null : normalizedHost;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private String truncate(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() <= maxLength) {
            return trimmed;
        }
        return trimmed.substring(0, Math.max(0, maxLength - 1)).trim() + "…";
    }

    public record LinkMetadata(
        String title,
        String description,
        String siteName,
        String contentPreview,
        String previewImageUrl
    ) {
    }
}
