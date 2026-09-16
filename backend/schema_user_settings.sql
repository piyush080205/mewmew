-- Account-level preferences. Currently just the SOS emergency-share
-- duration, configured from the app's Account screen.
create table if not exists user_settings (
  user_id text primary key,
  sos_share_minutes integer,
  updated_at timestamptz default now()
);
