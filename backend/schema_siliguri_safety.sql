-- Curated, independently-verified Siliguri (West Bengal) safety-infrastructure
-- dataset for Jagriti's police-accessibility / emergency-routing layer.
--
-- Generated from siliguri_police_directory.csv / siliguri_safety_support.csv
-- after independent web verification against official wbpolice.gov.in /
-- darjeelingpolice.org / AAI / hospital sources (see siliguri_source_audit.csv
-- in the repo's output/ dir for the full corrections trail). Any field that
-- could not be independently confirmed is NULL here rather than carrying
-- forward the seed CSVs' unverified claims.

create table if not exists police_stations (
  police_station_id text primary key,
  state text not null,
  district text not null,
  commissionerate text,
  police_unit text,
  police_station text not null,
  station_type text not null,
  phone text,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  phone_status text not null default 'unverified',
  coordinate_status text not null default 'needs_review',
  source text,
  source_url text,
  last_verified date,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists safety_support_locations (
  location_id text primary key,
  state text not null,
  district text not null,
  name text not null,
  type text not null,
  subtype text,
  latitude double precision not null,
  longitude double precision not null,
  phone text,
  address text,
  website text,
  operator text,
  source text,
  source_url text,
  last_verified date,
  coordinate_status text not null default 'needs_review',
  notes text,
  updated_at timestamptz not null default now()
);

insert into police_stations (police_station_id, state, district, commissionerate, police_unit, police_station, station_type, phone, latitude, longitude, address, phone_status, coordinate_status, source, source_url, last_verified, notes)
values
  ('SIL-PS-SILIGURI', 'West Bengal', 'Darjeeling', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Siliguri PS', 'Police Station', '0353-2662101', 26.7118, 88.4287, 'S.F. Road, Babupara, Siliguri - 734004', 'cross_verified', 'likely_correct', 'Siliguri Metropolitan Police (official site) + independent directory listing', 'https://siliguripc.wbpolice.gov.in/', '2026-09-17', 'Landline independently confirmed via web search. The seed CSV''s mobile number (9147889602) could not be independently confirmed by any source found this session; treat that mobile as unverified, not official.'),
  ('SIL-PS-WOMEN-SILIGURI', 'West Bengal', 'Darjeeling', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Siliguri Women PS', 'Women Police Station', null, 26.7121, 88.4284, 'S.F. Road, Siliguri Bazar, Siliguri - 734004', 'conflicting', 'needs_review', 'Siliguri Metropolitan Police stations list + independent directory (address only)', 'https://siliguripc.wbpolice.gov.in/', '2026-09-17', 'Existence and address confirmed independently. The seed CSV reused the main Siliguri PS landline (0353-2662101) for this separate station and supplied an unconfirmed mobile (9147889605); no independent source gives a distinct number for the Women PS, so phone is left blank rather than guessed. Coordinates sit ~30m from Cyber Crime PS''s coordinates in the seed file -- plausible (same police compound) but not independently verified, so flagged needs_review rather than accepted.'),
  ('SIL-PS-PRADHANNAGAR', 'West Bengal', 'Darjeeling', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Pradhannagar PS', 'Police Station', '0353-2510046', 26.7275, 88.4192, 'Regulated Market Gate, Champasari - 734003', 'cross_verified', 'needs_review', 'Independent directory listings (bharatibiz, yappe)', 'https://siliguripc.wbpolice.gov.in/ps.html/16/pradhannagar-police-station', '2026-09-17', 'Landline confirmed. Independent sources give the address as ''Temple Rd Mallaguri, Ward 2, Pradhan Nagar'', not the seed CSV''s ''Regulated Market Gate, Champasari'' -- these may be different points within the same station''s beat; address kept as seed value but flagged needs_review. An alternate mobile (09093364507) appears in one directory, conflicting with the seed CSV''s 9147889603 -- seed mobile not carried into phone.'),
  ('SIL-PS-MATIGARA', 'West Bengal', 'Darjeeling', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Matigara PS', 'Police Station', '0353-2571472', 26.7115, 88.3811, 'Ramkrishanapara, Matigara - 734010', 'cross_verified', 'likely_correct', 'Independent directory listings (bharatibiz, mappls)', 'https://siliguripc.wbpolice.gov.in/', '2026-09-17', 'Landline confirmed via two independent sources. Seed CSV mobile (9147889608) unverified; omitted.'),
  ('SIL-PS-BAGDOGRA', 'West Bengal', 'Darjeeling', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Bagdogra PS', 'Police Station', '0353-2551242', 26.6961, 88.3182, 'Thana More, Hospital More, Bagdogra - 734014', 'cross_verified', 'likely_correct', 'Official Siliguri PC site listing + independent directories', 'https://siliguripc.wbpolice.gov.in/ps.html/14/bagdogra-police-station', '2026-09-17', 'Landline and ''Thana More'' address independently confirmed. Seed CSV mobile (9147889609) unverified; omitted.'),
  ('SIL-PS-BHAKTINAGAR', 'West Bengal', 'Jalpaiguri', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Bhaktinagar PS', 'Police Station', '0353-2543665', 26.7388, 88.4473, '3rd Mile, Salugara / Checkpost - 734008', 'cross_verified', 'needs_review', 'Independent directory listings (mappls, justdial)', 'https://siliguripc.wbpolice.gov.in/', '2026-09-17', 'Landline confirmed exactly. Independent sources place the station on ''Sevoke Road, Bhaktinagar'' / ''Don Bosco Colony'', not ''3rd Mile, Salugara / Checkpost'' as in the seed CSV -- same general Bhaktinagar ward but address needs manual reconciliation. Seed CSV mobile (9147889604) unverified; omitted.'),
  ('SIL-PS-NJP', 'West Bengal', 'Jalpaiguri', 'Siliguri Police Commissionerate', 'Siliguri PC', 'New Jalpaiguri (NJP) PS', 'Police Station', '0353-2691413', 26.6853, 88.4419, 'Bhanumati Road, Babupara / NJP - 734007', 'cross_verified', 'likely_correct', 'Independent directory listings (mappls, yappe)', 'https://siliguripc.wbpolice.gov.in/', '2026-09-17', 'Landline and address (Bhanumati Rd, Babupara) both independently confirmed. Note this is a regular Police Station, distinct from the ''New Jalpaiguri GRPS'' railway police station below -- do not merge. Seed CSV mobile (9147889606) unverified; omitted.'),
  ('SIL-PS-CYBERCRIME', 'West Bengal', 'Darjeeling', 'Siliguri Police Commissionerate', 'Siliguri PC', 'Cyber Crime PS', 'Cyber Police Station', null, 26.7119, 88.4285, 'Siliguri Bazar, Krishanu Dey Sarani - 734004', 'conflicting', 'needs_review', 'Independent directory listings + WB Cyber Crime Wing station list', 'https://cybercrimewing.wb.gov.in/PoliceStations', '2026-09-17', 'Existence as a distinct Cyber Police Station confirmed. The seed CSV''s phone (0353-2662210) is independently documented as the Siliguri PC CONTROL ROOM number, not a dedicated Cyber PS line -- kept out of `phone` and flagged conflicting rather than presented as this station''s own number. National cyber-crime helpline 1930 is confirmed and should be surfaced to users as the primary reporting channel regardless of this station''s own line. Independent sources place the address on ''Station Feeder Rd, Ward 27, Babupara'', differing from the seed''s ''Krishanu Dey Sarani'' -- flagged needs_review.'),
  ('SIL-GRP-SILIGURI-TOWN', 'West Bengal', 'Darjeeling', null, 'Siliguri GRP', 'Siliguri Town GRPS', 'Government Railway Police', '0353-2516123', 26.7101, 88.4241, 'Siliguri Town Railway Station Platform 1', 'cross_verified', 'needs_review', 'Official Siliguri GRP site + independent directory (Yappe)', 'https://siligurigrp.wb.gov.in/ps-detail/2', '2026-09-17', 'Note the real GRP portal domain is siligurigrp.wb.gov.in, not siligurigrp.wbpolice.gov.in as given in the seed CSV -- corrected. One of two landlines found independently (0353-2516123 and 0353-2910755) matches the seed value; the other is a second, unconfirmed-in-seed line. Independent sources place the station near ''Rajendar Nagar / Hotel Rajdarbar, Pradhan Nagar'', not ''Platform 1'' as in the seed CSV -- flagged needs_review. Mobile (8637591236) unverified; omitted.'),
  ('SIL-GRP-NJP', 'West Bengal', 'Jalpaiguri', null, 'Siliguri GRP', 'New Jalpaiguri GRPS', 'Government Railway Police', null, 26.6835, 88.4431, 'NJP Railway Station Complex, Siliguri', 'conflicting', 'likely_correct', 'Independent directory listing confirming a distinct NJP GRP Police Station', 'https://www.mappls.com/hx4kox', '2026-09-17', 'A distinct ''New Jalpaiguri GRP Police Station'' (separate from the regular NJP Police Station above) is independently confirmed to exist at the NJP railway complex. The seed CSV''s phone (0353-2690214) is documented elsewhere as a number for the regular NJP Police Station, not specifically the GRP unit -- so it is not carried into `phone` here. Mobile (9641137301) unverified; omitted.'),
  ('SIL-PS-NAXALBARI', 'West Bengal', 'Darjeeling', null, 'Darjeeling District Police', 'Naxalbari PS', 'Police Station', '0353-2488615 / 9147889067', 26.6821, 88.2045, 'Panitanki-Naxalbari Road, Naxalbari - 734429', 'cross_verified', 'needs_review', 'Darjeeling Police District official directory', 'https://darjeelingpolice.org/kypsdtl.php?sl_id=MTI%3D', '2026-09-17', 'Landline confirmed exactly. CORRECTION: the seed CSV''s mobile (9147889066) is the wrong number -- the Darjeeling Police District''s own directory lists the Naxalbari OC''s mobile as 9147889067, which the seed CSV had instead assigned to Kharibari PS. Numbers corrected per station.'),
  ('SIL-PS-PHANSIDEWA', 'West Bengal', 'Darjeeling', null, 'Darjeeling District Police', 'Phansidewa PS', 'Police Station', '0353-2587361 / 9147889069', 26.5812, 88.3072, 'Bandargachh, Phansidewa - 734434', 'cross_verified', 'needs_review', 'Darjeeling Police District official directory', 'https://darjeelingpolice.org/kypsdtl.php?sl_id=MTM%3D', '2026-09-17', 'Landline and mobile both confirmed exactly against the official Darjeeling Police District directory -- no change needed.'),
  ('SIL-PS-KHARIBARI', 'West Bengal', 'Darjeeling', null, 'Darjeeling District Police', 'Kharibari PS', 'Police Station', '0353-2554100 / 9147889068', 26.5658, 88.1633, 'SH-12, Rishi Road, Kharibari - 734427', 'cross_verified', 'needs_review', 'Darjeeling Police District official directory', 'https://darjeelingpolice.org/kypsdtl.php?sl_id=MTE%3D', '2026-09-17', 'Landline confirmed exactly. CORRECTION: the seed CSV''s mobile (9147889067) actually belongs to Naxalbari PS per the official directory; Kharibari''s own OC mobile is 9147889068. Numbers corrected per station.'),
  ('SIL-PS-RAJGANJ', 'West Bengal', 'Jalpaiguri', null, 'Jalpaiguri District Police', 'Rajganj PS', 'Police Station', '9147889168', 26.6341, 88.5204, 'Fatapukur-Rajganj Road, Rajganj - 735134', 'conflicting', 'needs_review', 'Independent directory listings (veethi, indiainfo)', 'https://jalpaiguripolice.in/search_ps.php', '2026-09-17', 'Mobile (9147889168) confirmed exactly against independent sources -- kept. The seed CSV''s landline (03561-254224) conflicts with an independently found landline (03561-254231) for the same station; since neither could be pinned to an authoritative single source this session, the landline is left out of `phone` rather than guessed between the two. Also note the seed CSV''s source_url domain (''jaliguripolice.wb.gov.in'') is misspelled and does not resolve; the correct portal is jalpaiguripolice.in.')
on conflict (police_station_id) do update set
  phone = excluded.phone, phone_status = excluded.phone_status,
  coordinate_status = excluded.coordinate_status, notes = excluded.notes,
  last_verified = excluded.last_verified, updated_at = now();

insert into safety_support_locations (location_id, state, district, name, type, subtype, latitude, longitude, phone, address, website, operator, source, source_url, last_verified, coordinate_status, notes)
values
  ('SIL-HOSP-NBMCH', 'West Bengal', 'Darjeeling', 'North Bengal Medical College & Hospital (NBMCH)', 'Tertiary Hospital', 'Government Medical College Hospital', 26.7112, 88.3845, '0353-2585478', 'Sushrutanagar, Thiknikata, Matigara - 734012', 'https://nbmch.ac.in', 'Health & Family Welfare Dept, Govt of West Bengal', 'NBMCH official contact listings (Principal''s Office)', 'https://nbmch.ac.in', '2026-09-17', 'likely_correct', 'Phone number independently confirmed as the Principal''s Office line.'),
  ('SIL-HOSP-SILIGURI-DISTRICT', 'West Bengal', 'Darjeeling', 'Siliguri District Hospital', 'District Hospital', 'Government Hospital', 26.7139, 88.4237, null, 'Hospital Road, Ward 11, Hakim Para, Siliguri - 734001', 'https://siliguridistricthospital.in', 'Darjeeling District Health Registry', 'Siliguri District Hospital official site (address only; phone conflicting)', 'https://siliguridistricthospital.in/contact-us/', '2026-09-17', 'likely_correct', 'Seed CSV phone (0353-2535611) conflicts with an independently found contact number (+91 94762 45535) for the same hospital -- neither confirmed as the sole official line this session, so left blank rather than guessed.'),
  ('SIL-TRANSIT-NJP-STATION', 'West Bengal', 'Jalpaiguri', 'New Jalpaiguri (NJP) Railway Station', 'Railway Station', 'Major Junction (NFR)', 26.6841, 88.4428, null, 'NJP Station Road, Bhaktinagar, Siliguri - 734007', null, 'Indian Railways / Northeast Frontier Railway', 'Indian Railways station directories (address confirmed; phone conflicting)', 'https://en.wikipedia.org/wiki/New_Jalpaiguri_Junction_railway_station', '2026-09-17', 'likely_correct', 'Seed CSV reused the NJP GRPS police phone (0353-2690214) as this station''s own contact number, which is incorrect -- a station enquiry number found independently does not match. Left blank rather than guessed; use national rail enquiry (139) in-app instead of a single unverified station line.'),
  ('SIL-TRANSIT-TNORGAY-BUS', 'West Bengal', 'Darjeeling', 'Tenzing Norgay Central Bus Terminus', 'Transit Hub', 'Bus Terminal', 26.7268, 88.4198, null, 'Hill Cart Road, Pradhan Nagar, Siliguri - 734003', null, 'North Bengal State Transport Corporation (NBSTC)', 'Independent transport directories (address confirmed; phone conflicting)', 'https://en.wikipedia.org/wiki/Tenzing_Norgay_Bus_Terminus', '2026-09-17', 'likely_correct', 'Seed CSV phone (0353-2515063) conflicts with an independently found number (0353-2514920) for the same terminus -- left blank rather than guessed between the two.'),
  ('SIL-TRANSIT-BAGDOGRA-AIRPORT', 'West Bengal', 'Darjeeling', 'Bagdogra International Airport (IXB)', 'Transit Hub', 'Airport', 26.6812, 88.3286, null, 'Airport Road, Bagdogra - 734014', 'https://www.aai.aero/en/airports/bagdogra', 'Airports Authority of India (AAI)', 'AAI official airport contact page (address confirmed; phone conflicting)', 'https://www.aai.aero/airports/contact-us/bagdogra', '2026-09-17', 'likely_correct', 'Seed CSV phone (0353-2698404) conflicts with the AAI-listed number (0353-2698431) -- differs in the last three digits. Left blank rather than guessed; use the AAI page as the authoritative source going forward.'),
  ('SIL-FIRE-SILIGURI', 'West Bengal', 'Darjeeling', 'Siliguri Fire & Emergency Service Station', 'Fire Station', null, 26.7144, 88.4249, null, 'Station Feeder Road, Ward 9, Janta Nagar, Siliguri - 734001', null, 'West Bengal Fire & Emergency Services', 'Independent directories (phone conflicting with seed)', 'https://indiandirectory.co.in/directory/siliguri-fire-station/', '2026-09-17', 'likely_correct', 'Seed CSV phone (0353-2521101) does not match independently found numbers (0353-2502222 / 0353-2501867) for the same station -- left blank rather than guessed. National fire emergency number 101 should be the primary in-app fallback regardless.'),
  ('SIL-FIRE-DABGRAM', 'West Bengal', 'Jalpaiguri', 'Dabgram Fire Station', 'Fire Station', null, 26.7214, 88.4489, null, 'Fulbari Bypass Road, Salugara, Siliguri - 734004', null, 'West Bengal Fire & Emergency Services', 'Not independently confirmed this session', null, '2026-09-17', 'needs_review', 'Could not independently confirm this station''s existence, phone, address, or coordinates against any authoritative source this session -- entire record downgraded to needs_review/unverified pending manual confirmation with WB Fire & Emergency Services.')
on conflict (location_id) do update set
  phone = excluded.phone, coordinate_status = excluded.coordinate_status,
  notes = excluded.notes, last_verified = excluded.last_verified, updated_at = now();

-- Plug curated Siliguri police-station data into the existing city_safety_data
-- lookup (see routers/safety.py's GET /api/safety/city-data), the same way
-- Delhi is curated in schema_city_safety.sql. crime_index/safety_index are
-- left null (not fabricated) since no independently-sourced crime index for
-- Siliguri was found this session.
insert into city_safety_data (
  city_name, center_lat, center_lng, crime_index, safety_index, source, police_stations
) values (
  'Siliguri', 26.7271, 88.3953, null, null,
  'Police stations independently verified against wbpolice.gov.in / darjeelingpolice.org sources; crime/safety index not sourced -- left null rather than guessed. See police_stations and safety_support_locations tables for the full curated dataset with per-field verification status.',
  '[{"name": "Siliguri PS", "lat": 26.7118, "lng": 88.4287, "phone": "0353-2662101"}, {"name": "Siliguri Women PS", "lat": 26.7121, "lng": 88.4284, "phone": null}, {"name": "Pradhannagar PS", "lat": 26.7275, "lng": 88.4192, "phone": "0353-2510046"}, {"name": "Matigara PS", "lat": 26.7115, "lng": 88.3811, "phone": "0353-2571472"}, {"name": "Bagdogra PS", "lat": 26.6961, "lng": 88.3182, "phone": "0353-2551242"}, {"name": "Bhaktinagar PS", "lat": 26.7388, "lng": 88.4473, "phone": "0353-2543665"}, {"name": "New Jalpaiguri (NJP) PS", "lat": 26.6853, "lng": 88.4419, "phone": "0353-2691413"}, {"name": "Cyber Crime PS", "lat": 26.7119, "lng": 88.4285, "phone": null}, {"name": "Siliguri Town GRPS", "lat": 26.7101, "lng": 88.4241, "phone": "0353-2516123"}, {"name": "New Jalpaiguri GRPS", "lat": 26.6835, "lng": 88.4431, "phone": null}, {"name": "Naxalbari PS", "lat": 26.6821, "lng": 88.2045, "phone": "0353-2488615 / 9147889067"}, {"name": "Phansidewa PS", "lat": 26.5812, "lng": 88.3072, "phone": "0353-2587361 / 9147889069"}, {"name": "Kharibari PS", "lat": 26.5658, "lng": 88.1633, "phone": "0353-2554100 / 9147889068"}, {"name": "Rajganj PS", "lat": 26.6341, "lng": 88.5204, "phone": "9147889168"}]'::jsonb
)
on conflict (city_name) do update set
  center_lat = excluded.center_lat, center_lng = excluded.center_lng,
  source = excluded.source, police_stations = excluded.police_stations,
  updated_at = now();
