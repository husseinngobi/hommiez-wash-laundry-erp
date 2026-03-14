-- READ-ONLY AUDIT SCRIPT
-- Safe to run in Supabase SQL Editor (SELECT only)

-- 1) Basic user inventory
SELECT
  id,
  email,
  full_name,
  role,
  status,
  created_at,
  last_login,
  CASE WHEN password IS NULL OR password = '' THEN false ELSE true END AS has_password
FROM users
WHERE deleted_at IS NULL OR deleted_at IS NOT DISTINCT FROM NULL
ORDER BY created_at DESC
LIMIT 500;

-- 2) User summary by status and role
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_users,
  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_users,
  COUNT(*) FILTER (WHERE status = 'SUSPENDED') AS suspended_users,
  COUNT(*) FILTER (WHERE role = 'ADMIN') AS admin_users,
  COUNT(*) FILTER (WHERE role = 'MANAGER') AS manager_users,
  COUNT(*) FILTER (WHERE role = 'DESKTOP_AGENT') AS desktop_agent_users
FROM users
WHERE deleted_at IS NULL OR deleted_at IS NOT DISTINCT FROM NULL;

-- 3) Potential risk checks (duplicate emails)
SELECT lower(email) AS normalized_email, COUNT(*) AS duplicates
FROM users
GROUP BY lower(email)
HAVING COUNT(*) > 1;

-- 4) Accounts without password (should be reviewed after Google-auth removal)
SELECT id, email, full_name, role, status, created_at
FROM users
WHERE (password IS NULL OR password = '')
ORDER BY created_at DESC;

-- 5) Recently created pending accounts (approval queue)
SELECT id, email, full_name, role, status, created_at
FROM users
WHERE status = 'PENDING'
ORDER BY created_at DESC
LIMIT 100;
