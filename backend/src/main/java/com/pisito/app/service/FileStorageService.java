package com.pisito.app.service;

import com.pisito.app.controller.dto.resource.UploadFileResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.UUID;

@Service
public class FileStorageService {

    private final Path uploadRootPath;
    private final FileTextExtractionService fileTextExtractionService;

    public FileStorageService(
        @Value("${app.upload.dir:uploads}") String uploadDir,
        FileTextExtractionService fileTextExtractionService
    ) {
        this.uploadRootPath = Paths.get(uploadDir).toAbsolutePath().normalize();
        this.fileTextExtractionService = fileTextExtractionService;
    }

    public UploadFileResponse store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file is required");
        }

        try {
            Files.createDirectories(uploadRootPath);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not create upload directory", ex);
        }

        String originalName = StringUtils.hasText(file.getOriginalFilename())
            ? file.getOriginalFilename().trim()
            : "file";
        String safeName = sanitizeFileName(originalName);
        String storedName = UUID.randomUUID() + "-" + safeName;
        Path targetPath = uploadRootPath.resolve(storedName).normalize();

        if (!targetPath.startsWith(uploadRootPath)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name");
        }

        try {
            file.transferTo(targetPath);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store uploaded file", ex);
        }

        String mimeType = StringUtils.hasText(file.getContentType()) ? file.getContentType() : "application/octet-stream";
        String publicPath = "/uploads/" + storedName;
        return new UploadFileResponse(publicPath, originalName, mimeType, file.getSize(), null);
    }

    public String extractStoredText(String storageKey, String fileName, String mimeType) {
        Path storedPath = resolveStoragePath(storageKey);
        return fileTextExtractionService.extractText(storedPath, fileName, mimeType);
    }

    private Path resolveStoragePath(String storageKey) {
        String normalizedKey = trimStorageKey(storageKey);
        if (!StringUtils.hasText(normalizedKey)) {
            return null;
        }

        Path targetPath = uploadRootPath.resolve(normalizedKey).normalize();
        if (!targetPath.startsWith(uploadRootPath)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid storage key");
        }
        return targetPath;
    }

    private String trimStorageKey(String storageKey) {
        if (!StringUtils.hasText(storageKey)) {
            return null;
        }
        String normalized = storageKey.trim();
        if (normalized.startsWith("/api/uploads/")) {
            normalized = normalized.substring("/api/uploads/".length());
        } else if (normalized.startsWith("/uploads/")) {
            normalized = normalized.substring("/uploads/".length());
        } else if (normalized.startsWith("uploads/")) {
            normalized = normalized.substring("uploads/".length());
        }
        return normalized.trim();
    }

    private String sanitizeFileName(String fileName) {
        String normalized = fileName
            .replace("\\", "_")
            .replace("/", "_")
            .replace("..", "_")
            .trim();

        normalized = normalized.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (!StringUtils.hasText(normalized)) {
            return "file";
        }
        return normalized.toLowerCase(Locale.ROOT);
    }
}

