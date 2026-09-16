-- location_events is missing columns that routers/trips.py has been
-- inserting/selecting for a while (accuracy, source, accuracy_radius),
-- which silently breaks every location insert (caught by a try/except
-- that swallows the Postgrest error) and every read that selects them.
-- No location has been stored since 2026-08-21 as a result.

alter table location_events
  add column if not exists accuracy double precision,
  add column if not exists source text default 'gps',
  add column if not exists accuracy_radius double precision;
