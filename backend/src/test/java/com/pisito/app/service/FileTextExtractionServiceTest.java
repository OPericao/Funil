package com.pisito.app.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class FileTextExtractionServiceTest {

    private final FileTextExtractionService fileTextExtractionService = new FileTextExtractionService();

    @Test
    void extractsTextFromPlainTextFiles() {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "nota.txt",
            "text/plain",
            "Linea uno\nLinea dos".getBytes(StandardCharsets.UTF_8)
        );

        String extracted = fileTextExtractionService.extractText(file);

        assertThat(extracted).contains("Linea uno").contains("Linea dos");
    }

    @Test
    void skipsCommonBinaryFiles() {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "imagen.png",
            "image/png",
            new byte[] {0x01, 0x02, 0x03}
        );

        String extracted = fileTextExtractionService.extractText(file);

        assertThat(extracted).isNull();
    }
}
