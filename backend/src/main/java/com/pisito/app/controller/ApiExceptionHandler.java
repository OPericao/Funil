package com.pisito.app.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final String UPLOAD_TOO_LARGE_MESSAGE = "El archivo supera el tamano maximo permitido de 10 MB.";

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatusException(
        ResponseStatusException exception,
        HttpServletRequest request
    ) {
        int status = exception.getStatusCode().value();
        HttpStatus resolvedStatus = HttpStatus.resolve(status);

        String reason = exception.getReason();
        String message = (reason == null || reason.isBlank()) ? "Request failed" : reason;
        String error = resolvedStatus == null ? "Error" : resolvedStatus.getReasonPhrase();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("timestamp", Instant.now().toString());
        payload.put("status", status);
        payload.put("error", error);
        payload.put("message", message);
        payload.put("path", request.getRequestURI());

        return ResponseEntity.status(status).body(payload);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSizeExceeded(
        MaxUploadSizeExceededException exception,
        HttpServletRequest request
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("timestamp", Instant.now().toString());
        payload.put("status", HttpStatus.PAYLOAD_TOO_LARGE.value());
        payload.put("error", HttpStatus.PAYLOAD_TOO_LARGE.getReasonPhrase());
        payload.put("message", UPLOAD_TOO_LARGE_MESSAGE);
        payload.put("path", request.getRequestURI());

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(payload);
    }
}
