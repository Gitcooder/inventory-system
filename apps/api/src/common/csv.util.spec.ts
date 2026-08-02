import { toCsv } from './csv.util';

interface Row {
  name: string;
  qty: number;
}

describe('toCsv', () => {
  it('produces a header row plus one row per item, CRLF-separated', () => {
    const csv = toCsv<Row>(
      [{ name: 'Amoxicillin', qty: 10 }],
      [
        { header: 'Name', value: (r) => r.name },
        { header: 'Qty', value: (r) => r.qty },
      ],
    );
    expect(csv).toBe('Name,Qty\r\nAmoxicillin,10');
  });

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const csv = toCsv<Row>(
      [{ name: 'Widget, "Deluxe"\nEdition', qty: 1 }],
      [
        { header: 'Name', value: (r) => r.name },
        { header: 'Qty', value: (r) => r.qty },
      ],
    );
    expect(csv).toBe('Name,Qty\r\n"Widget, ""Deluxe""\nEdition",1');
  });

  it('does not quote fields with no special characters', () => {
    const csv = toCsv<Row>(
      [{ name: 'Plain', qty: 5 }],
      [
        { header: 'Name', value: (r) => r.name },
        { header: 'Qty', value: (r) => r.qty },
      ],
    );
    expect(csv).not.toContain('"');
  });

  it('handles an empty row set (header only)', () => {
    const csv = toCsv<Row>([], [{ header: 'Name', value: (r) => r.name }]);
    expect(csv).toBe('Name');
  });
});
