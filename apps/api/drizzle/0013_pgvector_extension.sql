-- Hand-written (drizzle-kit does not create extensions). US-2.5, AD-11, CONTEXT D39.
-- pgvector for ai.embeddings; generated in its own migration so the next one, which declares the
-- vector(1024) column and its HNSW indexes, finds the type. The postgres image is pgvector/pgvector.
CREATE EXTENSION IF NOT EXISTS vector;
