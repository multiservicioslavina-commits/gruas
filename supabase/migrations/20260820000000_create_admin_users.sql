-- Required for crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT
);

-- Create admin_audit_log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL REFERENCES admin_users(username),
  action TEXT NOT NULL,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create RPC function to verify admin credentials
CREATE OR REPLACE FUNCTION verify_admin_credentials(p_username TEXT, p_password TEXT)
RETURNS TABLE (username TEXT, role TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT admin_users.username, admin_users.role
  FROM admin_users
  WHERE admin_users.username = p_username
    AND admin_users.password_hash = crypt(p_password, admin_users.password_hash);
END;
$$ LANGUAGE plpgsql;

-- Create RPC function to create an admin user with hashed password
CREATE OR REPLACE FUNCTION create_admin_user(p_username TEXT, p_password TEXT, p_role TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO admin_users (username, password_hash, role)
  VALUES (p_username, crypt(p_password, gen_salt('bf', 4)), p_role);
END;
$$ LANGUAGE plpgsql;

-- Seed default admin user
INSERT INTO admin_users (username, password_hash, role, created_by)
VALUES ('admin', crypt('ridera2026', gen_salt('bf', 4)), 'admin', 'system')
ON CONFLICT (username) DO NOTHING;
