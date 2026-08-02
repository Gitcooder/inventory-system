const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses '15m', '7d', '30s', '2h' into milliseconds. Throws on anything else. */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${input}" — expected formats like '15m', '7d'.`,
    );
  }
  const [, value, unit] = match;
  return Number(value) * UNIT_MS[unit];
}
