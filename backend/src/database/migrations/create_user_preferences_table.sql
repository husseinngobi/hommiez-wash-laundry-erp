-- Create user_preferences table for notification settings
CREATE TABLE IF NOT EXISTS user_preferences (
  tenant_id INTEGER NOT NULL DEFAULT app_current_tenant_id() REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  sound_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  in_app_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, user_id)
);

-- Insert default preferences for existing users
INSERT INTO user_preferences (tenant_id, user_id, email_notifications, desktop_notifications, sound_alerts, in_app_notifications)
SELECT tenant_id, id, true, false, false, true
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_preferences
  WHERE user_preferences.tenant_id = users.tenant_id
    AND user_preferences.user_id = users.id
);
