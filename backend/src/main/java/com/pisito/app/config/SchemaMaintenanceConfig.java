package com.pisito.app.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class SchemaMaintenanceConfig {

    private static final Logger log = LoggerFactory.getLogger(SchemaMaintenanceConfig.class);

    @Bean
    ApplicationRunner ensureMediaExtractedTextColumn(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute("""
                ALTER TABLE media_resources
                ADD COLUMN IF NOT EXISTS extracted_text TEXT
                """);
            log.info("Schema check completed for media_resources.extracted_text");
        };
    }
}
