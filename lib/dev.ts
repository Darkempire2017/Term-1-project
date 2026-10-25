/**
 * Developer (hardware testing) accounts, e.g. DEV_INDEXES=DEV001.
 * Checked on the server against the signed-in session only.
 */
export function isDevIndex(indexNo: string | null | undefined): boolean {
  if (!indexNo) return false;
  const devIndexes = (process.env.DEV_INDEXES || 'DEV001')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return devIndexes.includes(indexNo.toUpperCase());
}
