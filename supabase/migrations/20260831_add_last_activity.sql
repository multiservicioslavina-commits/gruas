ALTER TABLE connect_members ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX connect_members_last_activity_idx ON connect_members(club_id, last_activity_at DESC);
