import { query } from '../config/database';

/**
 * Remove leftover demo/ghost staff (e.g. Manager Mutoni Blessing) who are not
 * real company users but still appear on Staff Performance.
 */
export async function ensureGhostStaffRemoved(): Promise<void> {
  const match =
    "LOWER(REGEXP_REPLACE(COALESCE(full_name, ''), '\\s+', ' ', 'g')) LIKE '%mutoni blessing%'";

  await query(
    `UPDATE users
     SET status = 'REJECTED',
         updated_at = CURRENT_TIMESTAMP
     WHERE ${match}`
  );

  try {
    await query(
      `UPDATE users
       SET deleted_at = COALESCE(deleted_at, NOW())
       WHERE ${match}`
    );
  } catch {
    // deleted_at may not exist on older databases
  }
}
