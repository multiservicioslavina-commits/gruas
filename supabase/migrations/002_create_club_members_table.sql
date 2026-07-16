-- Create club members table for storing member registrations
CREATE TABLE IF NOT EXISTS club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  fullname TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  city TEXT,
  moto_brand TEXT NOT NULL,
  moto_model TEXT,
  moto_year INTEGER,
  moto_color TEXT,
  photo_urls TEXT[] DEFAULT '{}', -- Array of uploaded photo URLs
  message TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS club_members_club_id_idx ON club_members(club_id);
CREATE INDEX IF NOT EXISTS club_members_email_idx ON club_members(email);
CREATE INDEX IF NOT EXISTS club_members_status_idx ON club_members(status);
CREATE INDEX IF NOT EXISTS club_members_created_idx ON club_members(created_at);

-- Enable RLS
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert (register)
CREATE POLICY "Anyone can register as club member" ON club_members
  FOR INSERT
  WITH CHECK (TRUE);

-- Create policy to allow viewing own registrations
CREATE POLICY "Members can view own registration" ON club_members
  FOR SELECT
  USING (auth.jwt() ->> 'email' = email);

-- Create policy for club leaders to view their club members
CREATE POLICY "Club leaders can view their members" ON club_members
  FOR SELECT
  USING (
    club_id IN (
      SELECT id FROM clubs WHERE leader_email = auth.jwt() ->> 'email'
    )
    OR auth.jwt() ->> 'role' = 'admin'
  );

-- Create policy for admins
CREATE POLICY "Admins can manage all members" ON club_members
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Create storage bucket for club photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-photos', 'club-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Set public access to club photos bucket
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'club-photos');

CREATE POLICY "Anyone can upload photos" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'club-photos');

CREATE POLICY "Anyone can delete own photos" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'club-photos' AND auth.uid()::text = owner);
