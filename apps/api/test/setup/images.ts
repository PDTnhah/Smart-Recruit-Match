// Keep in sync with deploy/docker-compose.yml so tests run against the same builds.
export const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';
export const REDIS_IMAGE = 'redis:7.4-alpine';
// minio/minio is gone from Docker Hub (CONTEXT D23, LESSONS §4); same digest as compose.
export const MINIO_IMAGE =
  'cgr.dev/chainguard/minio@sha256:59667194421209c2c1eacbe761e24787e047985c5dfa96b15da9b59fe9b55cd0';
