-- Live location sharing: session metadata on trips, plus optional
-- speed/battery columns on location_events for adaptive-interval display.
-- Builds on schema_trip_sharing.sql's share_token column.

alter table trips
  add column if not exists sharing_type text default 'manual',
  add column if not exists share_started_at timestamptz,
  add column if not exists share_expires_at timestamptz;

alter table location_events
  add column if not exists speed double precision,
  add column if not exists battery double precision;
