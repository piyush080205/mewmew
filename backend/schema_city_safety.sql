-- City-scoped crime/safety dataset, replacing the Delhi-only hardcoded
-- frontend/services/delhiCrimeData.ts. Looked up by routers/safety.py's
-- GET /api/safety/city-data via reverse-geocoded city name (case-insensitive
-- match on city_name), falling back to the "DEFAULT" row for any city not
-- listed here.
create table if not exists city_safety_data (
  id uuid primary key default gen_random_uuid(),
  city_name text not null unique,
  center_lat double precision,
  center_lng double precision,
  crime_index numeric,
  safety_index numeric,
  source text,
  crime_hotspots jsonb not null default '[]',
  safe_corridors jsonb not null default '[]',
  police_stations jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Neutral fallback for any city without curated data yet. No index shown
-- (null) rather than a fabricated number, empty hotspot/police lists.
insert into city_safety_data (city_name, source, crime_index, safety_index)
values ('DEFAULT', 'No curated data for this city yet — showing neutral defaults', null, null)
on conflict (city_name) do nothing;

-- Delhi — migrated verbatim from the old DELHI_CRIME_DATA constant in
-- frontend/services/delhiCrimeData.ts.
insert into city_safety_data (
  city_name, center_lat, center_lng, crime_index, safety_index, source,
  crime_hotspots, safe_corridors, police_stations
) values (
  'Delhi', 28.5035, 77.1833, 59.03, 40.97,
  'Mock data grounded in NCRB Crime in India 2023/2025, Numbeo Delhi Index, Delhi Police district reports, and published spatial crime research — replace with live NCRB/Delhi Police feeds for production use.',
  '[
    {"id":"HS001","name":"Mehrauli","lat":28.5212,"lng":77.1851,"district":"South West Delhi","police_station":"Mehrauli PS","risk_score":68,"risk_level":"HIGH","dominant_crimes":["snatching","theft","eve_teasing","robbery"],"peak_hours":["20:00-02:00"],"safe_hours":["07:00-19:00"],"incident_density_per_sqkm":14.2,"notes":"Dense market and heritage area. Narrow lanes reduce escape routes. High snatching incidents near Qutub Minar tourist zone."},
    {"id":"HS002","name":"Chattarpur Mandir Road","lat":28.4998,"lng":77.1743,"district":"South West Delhi","police_station":"Chattarpur PS","risk_score":38,"risk_level":"LOW","dominant_crimes":["theft","minor_scuffles"],"peak_hours":["22:00-04:00"],"safe_hours":["06:00-21:00"],"incident_density_per_sqkm":5.1,"notes":"Primarily residential and temple-visiting area. Relatively safe during daytime. Street lighting is poor on side lanes at night."},
    {"id":"HS003","name":"Sangam Vihar","lat":28.5127,"lng":77.2393,"district":"South Delhi","police_station":"Sangam Vihar PS","risk_score":72,"risk_level":"HIGH","dominant_crimes":["snatching","robbery","assault","eve_teasing","drug_activity"],"peak_hours":["21:00-05:00"],"safe_hours":["08:00-19:00"],"incident_density_per_sqkm":18.7,"notes":"One of Delhi''s most densely populated unauthorised colonies. High snatching and assault rates. Poor lighting and unplanned lanes."},
    {"id":"HS004","name":"Saket / Malviya Nagar Market","lat":28.5274,"lng":77.2167,"district":"South Delhi","police_station":"Malviya Nagar PS","risk_score":45,"risk_level":"MEDIUM","dominant_crimes":["pickpocketing","vehicle_theft","eve_teasing"],"peak_hours":["18:00-23:00"],"safe_hours":["09:00-17:00"],"incident_density_per_sqkm":8.4,"notes":"Commercial hub. Crowds at Select Citywalk. Vehicle theft from parking lots is common."},
    {"id":"HS005","name":"Vasant Kunj Sector D / Slum Pocket","lat":28.5196,"lng":77.1563,"district":"South West Delhi","police_station":"Vasant Kunj PS","risk_score":55,"risk_level":"MEDIUM","dominant_crimes":["snatching","theft","eve_teasing"],"peak_hours":["20:00-01:00"],"safe_hours":["07:00-19:00"],"incident_density_per_sqkm":9.8,"notes":"Mix of affluent and informal settlement zones. Boundary areas between sectors are higher risk especially after dark."},
    {"id":"HS006","name":"Neb Sarai","lat":28.5005,"lng":77.2101,"district":"South Delhi","police_station":"Neb Sarai PS","risk_score":60,"risk_level":"HIGH","dominant_crimes":["robbery","snatching","theft"],"peak_hours":["21:00-04:00"],"safe_hours":["08:00-20:00"],"incident_density_per_sqkm":11.3,"notes":"Village settlement integrated into urban fabric. Unplanned narrow lanes. Moderate-to-high robbery risk at night."},
    {"id":"HS007","name":"Deoli / Devli","lat":28.5366,"lng":77.228,"district":"South Delhi","police_station":"Devli PS","risk_score":65,"risk_level":"HIGH","dominant_crimes":["assault","snatching","drug_activity","robbery"],"peak_hours":["22:00-05:00"],"safe_hours":["08:00-18:00"],"incident_density_per_sqkm":13.6,"notes":"Dense urban village. Drug activity flagged in police reports. Avoid isolated inner lanes after dark."},
    {"id":"HS008","name":"Sultanpur / Ghitorni","lat":28.4862,"lng":77.149,"district":"South West Delhi","police_station":"Vasant Kunj North PS","risk_score":42,"risk_level":"MEDIUM","dominant_crimes":["vehicle_theft","theft","minor_snatching"],"peak_hours":["20:00-23:00"],"safe_hours":["06:00-19:00"],"incident_density_per_sqkm":6.2,"notes":"Near Ghitorni Metro. Mostly safe. Vehicle theft from roadside parking is the primary concern."},
    {"id":"HS009","name":"Ambedkar Nagar / Ignou Road","lat":28.544,"lng":77.2066,"district":"South Delhi","police_station":"Ambedkar Nagar PS","risk_score":58,"risk_level":"MEDIUM","dominant_crimes":["snatching","theft","molestation"],"peak_hours":["19:00-23:00"],"safe_hours":["08:00-18:00"],"incident_density_per_sqkm":9.1,"notes":"Transitional zone near IGNOU campus. Snatching reported on stretches with low lighting and sparse foot traffic."},
    {"id":"HS010","name":"Sarita Vihar","lat":28.5283,"lng":77.2891,"district":"South East Delhi","police_station":"Sarita Vihar PS","risk_score":48,"risk_level":"MEDIUM","dominant_crimes":["vehicle_theft","theft","snatching"],"peak_hours":["20:00-00:00"],"safe_hours":["07:00-19:00"],"incident_density_per_sqkm":7.9,"notes":"Planned residential colony. Moderate risk. Snatching near DND Flyway service roads reported."},
    {"id":"HS011","name":"Tughlaqabad / Badarpur Border","lat":28.4793,"lng":77.2683,"district":"South East Delhi","police_station":"Tughlaqabad PS","risk_score":75,"risk_level":"HIGH","dominant_crimes":["robbery","assault","kidnapping","drug_activity"],"peak_hours":["21:00-05:00"],"safe_hours":["09:00-18:00"],"incident_density_per_sqkm":16.4,"notes":"Delhi-Faridabad border corridor. High-risk zone due to inter-state criminal activity. Avoid night transit."},
    {"id":"HS012","name":"Jamia Nagar / Okhla","lat":28.56,"lng":77.2982,"district":"South East Delhi","police_station":"Jamia Nagar PS","risk_score":66,"risk_level":"HIGH","dominant_crimes":["theft","snatching","molestation","robbery"],"peak_hours":["21:00-04:00"],"safe_hours":["08:00-19:00"],"incident_density_per_sqkm":12.8,"notes":"Dense residential with unplanned pockets. Elevated molestation and snatching per district police data."},
    {"id":"HS013","name":"Paharganj","lat":28.6448,"lng":77.2167,"district":"Central Delhi","police_station":"Paharganj PS","risk_score":82,"risk_level":"VERY_HIGH","dominant_crimes":["snatching","theft","robbery","drug_activity","scams"],"peak_hours":["22:00-04:00"],"safe_hours":["10:00-17:00"],"incident_density_per_sqkm":24.5,"notes":"Dense transit zone near NDLS. Highest snatching density in Central Delhi. Tourist scams common. Avoid solo walking at night."},
    {"id":"HS014","name":"Lajpat Nagar Market","lat":28.57,"lng":77.243,"district":"South Delhi","police_station":"Lajpat Nagar PS","risk_score":50,"risk_level":"MEDIUM","dominant_crimes":["pickpocketing","vehicle_theft","eve_teasing"],"peak_hours":["17:00-22:00"],"safe_hours":["10:00-16:00"],"incident_density_per_sqkm":8.6,"notes":"Busy market area. High foot traffic creates pickpocket opportunity. Vehicle break-ins in parking areas."},
    {"id":"HS015","name":"Dwarka Sector 3 / Uttam Nagar","lat":28.5894,"lng":77.0419,"district":"South West Delhi","police_station":"Dwarka PS","risk_score":53,"risk_level":"MEDIUM","dominant_crimes":["theft","vehicle_theft","snatching"],"peak_hours":["20:00-00:00"],"safe_hours":["07:00-19:00"],"incident_density_per_sqkm":9.0,"notes":"Outer Delhi planned township. Mostly residential. Theft and vehicle crime primary concern."}
  ]'::jsonb,
  '[
    {"id":"SC001","name":"Satbari to Saket via MG Road","risk_score":28,"risk_level":"LOW","waypoints":[{"lat":28.5035,"lng":77.1833,"label":"Satbari (Origin)"},{"lat":28.5085,"lng":77.195,"label":"Dera Mandi"},{"lat":28.518,"lng":77.205,"label":"Pushp Vihar"},{"lat":28.5274,"lng":77.2167,"label":"Saket Metro"}],"notes":"Well-lit arterial road. CCTV coverage. Avoid after 01:00 AM."},
    {"id":"SC002","name":"Satbari to Vasant Kunj via NH48 service road","risk_score":22,"risk_level":"LOW","waypoints":[{"lat":28.5035,"lng":77.1833,"label":"Satbari (Origin)"},{"lat":28.5012,"lng":77.17,"label":"Andheria More"},{"lat":28.5196,"lng":77.1563,"label":"Vasant Kunj Sector A"}],"notes":"NH48 well-patrolled. Stay on main carriageway. Avoid service lanes after dark."},
    {"id":"SC003","name":"Satbari to AIIMS via Outer Ring Road","risk_score":30,"risk_level":"LOW","waypoints":[{"lat":28.5035,"lng":77.1833,"label":"Satbari (Origin)"},{"lat":28.5274,"lng":77.2167,"label":"Saket"},{"lat":28.548,"lng":77.2095,"label":"IIT Gate"},{"lat":28.5665,"lng":77.21,"label":"AIIMS"}],"notes":"Outer Ring Road is a major arterial with good police presence. Well lit."}
  ]'::jsonb,
  '[
    {"name":"Chattarpur Police Station","lat":28.4976,"lng":77.1765,"phone":"011-24135151"},
    {"name":"Mehrauli Police Station","lat":28.5205,"lng":77.1842,"phone":"011-26645190"},
    {"name":"Vasant Kunj North Police Station","lat":28.523,"lng":77.1585,"phone":"011-26124436"},
    {"name":"Malviya Nagar Police Station","lat":28.5337,"lng":77.2098,"phone":"011-29533100"}
  ]'::jsonb
)
on conflict (city_name) do nothing;

-- Placeholder rows for other major cities. Indices are rough Numbeo-style
-- estimates only, NOT verified against local police data — flagged via
-- `source` so the frontend can visibly label them as placeholders, and
-- hotspots/corridors/police lists are intentionally empty until curated.
insert into city_safety_data (city_name, center_lat, center_lng, crime_index, safety_index, source)
values
  ('Mumbai', 19.0760, 72.8777, 43.0, 57.0, 'placeholder — needs verification against local police/NCRB data'),
  ('Bangalore', 12.9716, 77.5946, 40.0, 60.0, 'placeholder — needs verification against local police/NCRB data'),
  ('Bengaluru', 12.9716, 77.5946, 40.0, 60.0, 'placeholder — needs verification against local police/NCRB data')
on conflict (city_name) do nothing;
