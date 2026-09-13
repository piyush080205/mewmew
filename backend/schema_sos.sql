-- Emergency contacts + offline-first SOS events.
-- Additive to the existing hand-created trips/location_events/sensor_events
-- tables (see server.py for their inferred shape) — does not modify them.
--
-- Run this against the project's Supabase Postgres instance (SQL editor,
-- or `python setup_supabase.py`, which executes this file).

create extension if not exists pgcrypto;

create table if not exists emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text,
  phone_number text not null,
  priority integer not null default 1,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emergency_contacts_user on emergency_contacts(user_id);

create table if not exists sos_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id text unique,           -- Room-generated UUID; upsert key for idempotent sync
  user_id text,
  trip_id text references trips(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  accuracy_meters real,
  location_is_fresh boolean default true,
  location_timestamp timestamptz,
  battery_percent integer,
  confidence double precision not null,
  trigger_reason text not null,
  contributing_signals jsonb,
  status text not null default 'PENDING',  -- PENDING|SMS_ATTEMPTED|SMS_SENT|SENT|SERVER_SYNCED|COMPLETED|FAILED
  sms_recipients jsonb,
  sms_result jsonb,
  cancelled boolean not null default false,
  synced_at timestamptz
);

create index if not exists idx_sos_events_user on sos_events(user_id);
create index if not exists idx_sos_events_trip on sos_events(trip_id);
create index if not exists idx_sos_events_status on sos_events(status);
