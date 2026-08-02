import { parseDurationMs } from './duration.util';

describe('parseDurationMs', () => {
  it('parses seconds, minutes, hours, days', () => {
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('15m')).toBe(15 * 60_000);
    expect(parseDurationMs('2h')).toBe(2 * 3_600_000);
    expect(parseDurationMs('7d')).toBe(7 * 86_400_000);
  });

  it('throws on an invalid format', () => {
    expect(() => parseDurationMs('7')).toThrow();
    expect(() => parseDurationMs('7 days')).toThrow();
    expect(() => parseDurationMs('')).toThrow();
  });
});
