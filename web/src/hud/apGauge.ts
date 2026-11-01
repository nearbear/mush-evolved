/**
 * The tallest the AP gauge's column gets, in slots: the base cap of 12 plus the Noise Reducer's 2. A cap past it (Lethargy's 24
 * or 26) wraps into as many even columns as it needs (2 of 12, or 2 of 13), so the gauge grows in height by the Noise Reducer's
 * 2 for most players and by only 1 for Lethargy's.
 */
const AP_COLUMN_MAX = 14;

/** Slots per column for an AP gauge of `slots`: as few columns as fit under `AP_COLUMN_MAX`, shared out evenly. */
export function apColumnHeight(slots: number): number {
  return Math.ceil(slots / Math.ceil(slots / AP_COLUMN_MAX));
}
