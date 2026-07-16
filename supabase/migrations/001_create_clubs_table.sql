-- Create clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT, -- e.g., "Touring", "Cruiser", "Sport", "Adventure"
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Colombia',
  region TEXT,
  leader_name TEXT,
  leader_phone TEXT,
  leader_email TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  whatsapp TEXT,
  twitter_url TEXT,
  members_count INTEGER DEFAULT 0,
  routes_completed INTEGER DEFAULT 0,
  founded_year INTEGER,
  philosophy TEXT,
  frequency TEXT,
  motorcycle_brands TEXT[], -- Array of brands
  route_types TEXT[], -- Array of route types
  avatar_emoji TEXT DEFAULT '🏍',
  avatar_url TEXT,
  cover_url TEXT,
  highlights TEXT,
  featured BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS clubs_slug_idx ON clubs(slug);
CREATE INDEX IF NOT EXISTS clubs_city_idx ON clubs(city);
CREATE INDEX IF NOT EXISTS clubs_active_idx ON clubs(active);
CREATE INDEX IF NOT EXISTS clubs_featured_idx ON clubs(featured);
CREATE INDEX IF NOT EXISTS clubs_state_idx ON clubs(state);

-- Enable RLS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to view active clubs
CREATE POLICY "Anyone can view active clubs" ON clubs
  FOR SELECT
  USING (active = TRUE);

-- Create policy to allow authenticated users to manage their own club
CREATE POLICY "Club leaders can manage their club" ON clubs
  FOR UPDATE
  USING (auth.uid()::text = leader_email OR auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.uid()::text = leader_email OR auth.jwt() ->> 'role' = 'admin');

-- Create policy for admins to insert/delete clubs
CREATE POLICY "Admins can manage all clubs" ON clubs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Insert some example clubs
INSERT INTO clubs (
  name, slug, description, category, city, state, region,
  leader_name, leader_phone, leader_email,
  facebook_url, instagram_url, whatsapp, twitter_url,
  members_count, routes_completed, founded_year,
  philosophy, frequency, motorcycle_brands, route_types,
  avatar_emoji, highlights
) VALUES
  (
    'Touring Bikers Colombia',
    'touring-bikers-colombia',
    'Más que un club, somos una comunidad apasionada por las dos ruedas. Conectamos riders que comparten el espíritu de aventura por las carreteras de Colombia.',
    'Touring',
    'Envigado',
    'Antioquia',
    'Metropolitana',
    'Pau',
    '+57 312 3123 213',
    'pau@touringbikerscolom.co',
    'https://facebook.com/touringbikerscol',
    'https://instagram.com/touringbikerscol',
    '+57 312 3123 213',
    'https://twitter.com/touringbikerscol',
    15, 42, 2022,
    'Aventura, comunidad y responsabilidad en cada kilómetro',
    'Rutas semanales cada sábado y domingos especiales',
    ARRAY['BMW Motorrad', 'Harley-Davidson', 'Royal Enfield', 'Kawasaki', 'Honda', 'Yamaha'],
    ARRAY['Carretera', 'Off-Road', 'Adventure'],
    '🏍',
    'Club de turismo con experiencia en rutas largas y exploración de nuevos destinos'
  ),
  (
    'Cruisers Medellín',
    'cruisers-medellin',
    'El estilo de vida Cruiser en Medellín. Somos un club dedicado a disfrutar del camino con actitud y estilo clásico.',
    'Cruiser',
    'Medellín',
    'Antioquia',
    'Metropolitana',
    'Carlos',
    '+57 300 1234 567',
    'carlos@cruisersmed.co',
    'https://facebook.com/cruisersmedellin',
    'https://instagram.com/cruisersmedellin',
    '+57 300 1234 567',
    NULL,
    28, 67, 2018,
    'Tradición, estilo y camaradería en cada ruta',
    'Rodadas sabatinas y eventos especiales mensuales',
    ARRAY['Harley-Davidson', 'Triumph', 'Indian', 'Yamaha'],
    ARRAY['Carretera', 'Urbana'],
    '🔥',
    'Comunidad consolidada con eventos regulares y solidaridad de grupo'
  ),
  (
    'Enduro Antioquia',
    'enduro-antioquia',
    'Para los que disfrutan del off-road y la adrenalina. Exploramos los caminos difíciles de Antioquia.',
    'Enduro',
    'La Ceja',
    'Antioquia',
    'Oriente',
    'Jhon',
    '+57 315 5678 901',
    'jhon@enduroantioquia.co',
    NULL,
    'https://instagram.com/enduroantioquia',
    '+57 315 5678 901',
    'https://twitter.com/enduroantioquia',
    32, 89, 2020,
    'Desafío, aventura y respeto por la naturaleza',
    'Expediciones bi-semanales en diferentes terrenos',
    ARRAY['KTM', 'Honda', 'Yamaha', 'Kawasaki'],
    ARRAY['Off-Road', 'Mountain', 'Adventure'],
    '⛰',
    'Especialistas en terrenos difíciles con guías certificados'
  )
ON CONFLICT (slug) DO NOTHING;
