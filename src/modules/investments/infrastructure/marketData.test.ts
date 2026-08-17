import { parseCedearQuotes } from './marketData';

describe('cotizaciones de CEDEARs', () => {
  it('normaliza sólo los tickers solicitados con precio válido', () => {
    expect(parseCedearQuotes([
      { symbol: 'SPY', c: 70250, pct_change: 1.2 },
      { symbol: 'EWZ', c: 18200, pct_change: -0.5 },
      { symbol: 'AAPL', c: 123 },
      { symbol: 'BAD', c: 0 },
    ], ['SPY', 'EWZ'])).toEqual([
      { ticker: 'SPY', price: 70250, changePercentage: 1.2 },
      { ticker: 'EWZ', price: 18200, changePercentage: -0.5 },
    ]);
  });
});
