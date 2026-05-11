package com.pisito.app.service;

import org.apache.tika.Tika;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.metadata.TikaCoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

@Service
public class FileTextExtractionService {

    private static final Logger log = LoggerFactory.getLogger(FileTextExtractionService.class);
    private static final int MAX_EXTRACTED_CHARS = 12000;
    private static final Set<String> SUPPORTED_EXTENSIONS = Set.of(
        "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "yml", "yaml",
        "log", "rtf", "pdf", "docx", "odt", "java", "kt", "js", "jsx", "ts", "tsx", "py",
        "sql", "css", "scss", "less"
    );
    private static final Set<String> SUPPORTED_MIME_TYPES = Set.of(
        "application/json",
        "application/xml",
        "application/pdf",
        "application/rtf",
        "application/x-rtf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.oasis.opendocument.text"
    );

    private final Tika tika = new Tika();

    public String extractText(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }

        String fileName = trimToNull(file.getOriginalFilename());
        String mimeType = trimToNull(file.getContentType());
        if (!shouldAttemptExtraction(fileName, mimeType)) {
            return null;
        }

        try (InputStream inputStream = new BufferedInputStream(file.getInputStream())) {
            return extractText(inputStream, fileName, mimeType);
        } catch (Exception ex) {
            log.warn("Could not extract text from uploaded file fileName={} mimeType={}", fileName, mimeType, ex);
            return null;
        }
    }

    public String extractText(Path path, String fileName, String mimeType) {
        if (path == null || !Files.exists(path) || !Files.isRegularFile(path)) {
            return null;
        }

        if (!shouldAttemptExtraction(fileName, mimeType)) {
            return null;
        }

        try (InputStream inputStream = new BufferedInputStream(Files.newInputStream(path))) {
            return extractText(inputStream, fileName, mimeType);
        } catch (Exception ex) {
            log.warn("Could not extract text from stored file path={} fileName={} mimeType={}", path, fileName, mimeType, ex);
            return null;
        }
    }

    private String extractText(InputStream inputStream, String fileName, String mimeType) throws IOException {
        try {
            Metadata metadata = new Metadata();
            if (StringUtils.hasText(fileName)) {
                metadata.set(TikaCoreProperties.RESOURCE_NAME_KEY, fileName);
            }
            if (StringUtils.hasText(mimeType)) {
                metadata.set(Metadata.CONTENT_TYPE, mimeType);
            }

            String extracted = tika.parseToString(inputStream, metadata, MAX_EXTRACTED_CHARS);
            return normalizeExtractedText(extracted);
        } catch (Exception ex) {
            throw new IOException("Could not extract file text", ex);
        }
    }

    private boolean shouldAttemptExtraction(String fileName, String mimeType) {
        String normalizedMimeType = trimToNull(mimeType);
        if (normalizedMimeType != null) {
            String lowercaseMimeType = normalizedMimeType.toLowerCase(Locale.ROOT);
            if (lowercaseMimeType.startsWith("image/")
                || lowercaseMimeType.startsWith("video/")
                || lowercaseMimeType.startsWith("audio/")) {
                return false;
            }
            if (lowercaseMimeType.startsWith("text/") || SUPPORTED_MIME_TYPES.contains(lowercaseMimeType)) {
                return true;
            }
        }

        String extension = extractExtension(fileName);
        return extension != null && SUPPORTED_EXTENSIONS.contains(extension);
    }

    private String extractExtension(String fileName) {
        String normalized = trimToNull(fileName);
        if (normalized == null) {
            return null;
        }
        int dotIndex = normalized.lastIndexOf('.');
        if (dotIndex < 0 || dotIndex + 1 >= normalized.length()) {
            return null;
        }
        return normalized.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
    }

    private String normalizeExtractedText(String rawText) {
        String normalized = trimToNull(rawText);
        if (normalized == null) {
            return null;
        }

        normalized = normalized
            .replace('\u0000', ' ')
            .replace("\r\n", "\n")
            .replace('\r', '\n')
            .replaceAll("[\\t\\x0B\\f\\u00A0]+", " ")
            .replaceAll(" *\n *", "\n")
            .replaceAll("\n{3,}", "\n\n")
            .trim();

        return StringUtils.hasText(normalized) ? normalized : null;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
