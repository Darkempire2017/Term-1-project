import { getSessionIndex } from './session';

/**
 * Admin accounts, e.g. ADMIN_INDEXES=250529E. Checked on the server against the
 * signed-in session only. Falls back to 250529E when the variable is not set.
 */
export function isAdminIndex(indexNo: string | null | undefined): boolean {
  if (!indexNo) return false;
  const adminIndexes = (process.env.ADMIN_INDEXES || '250529E')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return adminIndexes.includes(indexNo.toUpperCase());
}

/**
 * The signed-in admin's index number, or null if the caller is not an admin
 */
export async function getAdminIndex(): Promise<string | null> {
  const indexNo = await getSessionIndex();
  return indexNo && isAdminIndex(indexNo) ? indexNo : null;
}
