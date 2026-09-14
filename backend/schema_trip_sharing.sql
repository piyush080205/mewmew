-- Adds a public share token to the trips table for the guardian
-- trip-sharing screen (see routers/trips.py: POST /api/trips/{id}/share,
-- GET /api/trips/shared/{token}). Nullable + unique: most trips are never
-- shared, and a token is generated lazily on first share.
alter table trips add column if not exists share_token text unique;
