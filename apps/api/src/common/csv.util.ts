export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

/**
 * Minimal but correct CSV serialization — no library needed for this. Quotes
 * any field containing a comma, quote, or newline, and doubles internal
 * quotes, per RFC 4180. CRLF row endings (also per RFC 4180) so it opens
 * cleanly in Excel, not just tools that assume bare LF.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (value: string | number): string => {
    const str = String(value);
    return /["\n,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escape(c.value(row))).join(','),
  );
  return [header, ...lines].join('\r\n');
}
