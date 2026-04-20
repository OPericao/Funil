package com.pisito.app.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class EntryVectorSchemaInitializer implements ApplicationRunner {

    private final EntryVectorStoreService entryVectorStoreService;
    private final String embeddingModel;

    public EntryVectorSchemaInitializer(
        EntryVectorStoreService entryVectorStoreService,
        @Value("${ollama.embedding-model:nomic-embed-text}") String embeddingModel
    ) {
        this.entryVectorStoreService = entryVectorStoreService;
        this.embeddingModel = embeddingModel;
    }

    @Override
    public void run(ApplicationArguments args) {
        entryVectorStoreService.initializeSchemaIfSupported();
        entryVectorStoreService.backfillMissingVectors(embeddingModel);
    }
}
