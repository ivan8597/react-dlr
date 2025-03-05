CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    original_text TEXT,
    translated_text TEXT,
    language VARCHAR(10),
    audio_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 