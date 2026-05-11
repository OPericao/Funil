ALTER TABLE media_resources
ADD COLUMN IF NOT EXISTS extracted_text TEXT;
