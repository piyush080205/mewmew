-- User retention feature tables: streaks, badges, dashboard stats

-- Daily check-ins for streak tracking
CREATE TABLE IF NOT EXISTS daily_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(user_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_checkins_user ON daily_checkins(user_id, checkin_date DESC);

-- Aggregated streak data per user
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id TEXT PRIMARY KEY,
    current_streak INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    last_checkin_date DATE,
    total_checkins INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Badge definitions
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL,  -- 'streak', 'trip', 'social', 'safety', 'exploration'
    requirement_type TEXT NOT NULL,  -- 'streak_days', 'total_trips', 'total_checkins', 'guardians_added', 'night_trips', 'reports_submitted', 'chat_analyses'
    requirement_value INT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- User's earned badges
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    badge_id UUID NOT NULL REFERENCES badges(id),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- Community safety reports
CREATE TABLE IF NOT EXISTS community_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    report_type TEXT NOT NULL,  -- 'unsafe_area', 'poor_lighting', 'harassment', 'suspicious_activity', 'road_issue', 'other'
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
    upvotes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_community_reports_location ON community_reports(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_community_reports_created ON community_reports(created_at DESC);

-- Track who upvoted what (prevent double-voting)
CREATE TABLE IF NOT EXISTS report_upvotes (
    user_id TEXT NOT NULL,
    report_id UUID NOT NULL REFERENCES community_reports(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, report_id)
);

-- Safety tips content
CREATE TABLE IF NOT EXISTS safety_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,  -- 'travel', 'digital', 'self_defense', 'awareness', 'emergency', 'home'
    icon TEXT NOT NULL DEFAULT 'bulb',
    day_of_year INT,  -- 1-366, for daily rotation; NULL means random pool
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed badge definitions
INSERT INTO badges (name, description, icon, category, requirement_type, requirement_value, sort_order) VALUES
    ('First Step', 'Completed your first check-in', 'footsteps', 'streak', 'total_checkins', 1, 1),
    ('Week Warrior', '7-day check-in streak', 'flame', 'streak', 'streak_days', 7, 2),
    ('Fortnight Strong', '14-day check-in streak', 'bonfire', 'streak', 'streak_days', 14, 3),
    ('Monthly Champion', '30-day check-in streak', 'trophy', 'streak', 'streak_days', 30, 4),
    ('First Journey', 'Completed your first trip', 'walk', 'trip', 'total_trips', 1, 10),
    ('Road Regular', 'Completed 10 trips', 'car', 'trip', 'total_trips', 10, 11),
    ('Travel Pro', 'Completed 50 trips', 'airplane', 'trip', 'total_trips', 50, 12),
    ('Night Owl', 'Completed a safe night trip', 'moon', 'trip', 'night_trips', 1, 13),
    ('Guardian Angel', 'Added your first guardian', 'people', 'social', 'guardians_added', 1, 20),
    ('Safety Circle', 'Added 3 guardians', 'people-circle', 'social', 'guardians_added', 3, 21),
    ('Community Voice', 'Submitted your first safety report', 'megaphone', 'social', 'reports_submitted', 1, 22),
    ('Watchdog', 'Submitted 10 safety reports', 'eye', 'social', 'reports_submitted', 10, 23),
    ('Chat Detective', 'Analyzed your first chat', 'search', 'safety', 'chat_analyses', 1, 30),
    ('Cyber Guardian', 'Analyzed 10 chats', 'shield-checkmark', 'safety', 'chat_analyses', 10, 31)
ON CONFLICT (name) DO NOTHING;

-- Seed safety tips
INSERT INTO safety_tips (title, content, category, icon, day_of_year) VALUES
    ('Share Your Route', 'Always share your travel route with a trusted contact before heading out, especially at night.', 'travel', 'map', 1),
    ('Trust Your Instincts', 'If something feels wrong, it probably is. Don''t hesitate to change your route or call for help.', 'awareness', 'alert-circle', 2),
    ('Keep Your Phone Charged', 'Ensure your phone is always charged above 20% when traveling. Carry a power bank as backup.', 'emergency', 'battery-charging', 3),
    ('Vary Your Routine', 'Avoid taking the exact same route at the same time every day. Unpredictability is a safety tool.', 'travel', 'shuffle', 4),
    ('Emergency Numbers', 'Save emergency numbers on speed dial: Police (100), Women Helpline (1091), Ambulance (102).', 'emergency', 'call', 5),
    ('Stay in Well-Lit Areas', 'When walking at night, stick to well-lit streets with foot traffic. Avoid shortcuts through dark alleys.', 'travel', 'flashlight', 6),
    ('Digital Footprint', 'Be mindful of what you share on social media. Avoid posting real-time locations publicly.', 'digital', 'globe', 7),
    ('Self-Defense Basics', 'Learn basic self-defense moves. Even knowing how to break free from a wrist grab can be life-saving.', 'self_defense', 'fitness', 8),
    ('Secure Your Accounts', 'Use strong, unique passwords and enable two-factor authentication on all important accounts.', 'digital', 'lock-closed', 9),
    ('Public Transport Safety', 'When using public transport, sit near the driver or in a well-occupied area. Avoid empty compartments.', 'travel', 'bus', 10),
    ('Meeting Strangers', 'When meeting someone new, always choose a public place and inform a friend about your plans.', 'awareness', 'people', 11),
    ('Know Your Area', 'Familiarize yourself with safe spots near your regular routes — police stations, hospitals, busy shops.', 'awareness', 'compass', 12),
    ('Ride-Share Safety', 'Always verify the car model, license plate, and driver name before getting into a ride-share vehicle.', 'travel', 'car-sport', 13),
    ('Online Chat Safety', 'Never share personal details like address, workplace, or daily schedule with people you only know online.', 'digital', 'chatbubble-ellipses', 14),
    ('Walking Alone', 'Walk confidently and stay alert. Avoid wearing both earphones — keep one ear free to hear your surroundings.', 'travel', 'walk', 15),
    ('Home Security', 'Don''t advertise that you live alone. Use timers on lights to create the appearance of someone being home.', 'home', 'home', 16),
    ('Fake Call Trick', 'If you feel followed, pretend to be on a phone call and mention your exact location loudly.', 'awareness', 'phone-portrait', 17),
    ('ATM Safety', 'Use ATMs in well-lit, busy areas. Shield the keypad when entering your PIN and be aware of your surroundings.', 'awareness', 'card', 18),
    ('Pepper Spray Tips', 'If you carry pepper spray, practice using it so you can deploy it quickly and accurately under stress.', 'self_defense', 'flash', 19),
    ('Document Everything', 'If you experience harassment, document everything — dates, times, screenshots. This evidence matters.', 'awareness', 'document-text', 20),
    ('Elevator Safety', 'Stand near the control panel in elevators. If someone makes you uncomfortable, get off at the next floor.', 'awareness', 'arrow-up', 21),
    ('Parking Lot Awareness', 'In parking lots, have your keys ready, check the back seat before getting in, and be aware of vans parked next to you.', 'travel', 'key', 22),
    ('SOS Features', 'Set up your phone''s SOS feature — most phones let you trigger emergency calls by pressing the power button rapidly.', 'emergency', 'alert', 23),
    ('Boundary Setting', 'Setting boundaries is not rude — it''s essential. Practice saying "no" firmly and without apology.', 'awareness', 'hand-left', 24),
    ('Travel Light', 'When traveling alone, carry only what you need. A heavy bag slows you down and makes you a target.', 'travel', 'bag-remove', 25),
    ('Check-In Habit', 'Build the habit of checking in with someone daily — it creates a safety net without even trying.', 'awareness', 'checkmark-circle', 26),
    ('Cyber Stalking Signs', 'If someone knows things about you they shouldn''t, check your devices for spyware and review app permissions.', 'digital', 'bug', 27),
    ('First Aid Basics', 'Learn basic first aid — how to stop bleeding, perform CPR, and treat burns. It could save your life or someone else''s.', 'emergency', 'medkit', 28),
    ('Hotel Safety', 'In hotels, use all locks on the door. Don''t open the door without verifying who is there.', 'travel', 'bed', 29),
    ('Community Power', 'Report unsafe areas in your community. Your report today could prevent someone else''s bad experience tomorrow.', 'awareness', 'megaphone', 30),
    ('Night Running Safety', 'If you exercise at night, wear reflective clothing and carry identification. Run against traffic.', 'self_defense', 'moon', 31)
ON CONFLICT DO NOTHING;
