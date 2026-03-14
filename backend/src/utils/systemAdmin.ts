const normalize = (email: string) => email.trim().toLowerCase();

export const getSystemAdminEmails = (): string[] => {
  const raw = process.env.SYSTEM_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((email) => normalize(email))
    .filter(Boolean);
};

export const isSystemAdminEmail = (email?: string): boolean => {
  if (!email) return false;

  const configuredEmails = getSystemAdminEmails();

  if (configuredEmails.length === 0) {
    return false;
  }

  return configuredEmails.includes(normalize(email));
};
