export const ADJUSTMENT_TYPES = [
  'restock',
  'correction',
  'damage',
  'expired',
] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];
