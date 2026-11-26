-- Albo PostgreSQL / PostGIS initialization script
-- Enables PostGIS for approved facility spatial queries (ADR-008) and pgcrypto for UUID generation.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
