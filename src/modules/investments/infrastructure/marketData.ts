export interface CedearQuote {
  ticker: string;
  price: number;
  changePercentage: number;
}

interface Data912Quote { symbol?: unknown; c?: unknown; pct_change?: unknown }

export function parseCedearQuotes(payload: unknown, symbols: string[]): CedearQuote[] {
  if (!Array.isArray(payload)) return [];
  const requested = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  return payload.flatMap((item: Data912Quote) => {
    const ticker = typeof item?.symbol === 'string' ? item.symbol.toUpperCase() : '';
    const price = Number(item?.c);
    if (!requested.has(ticker) || !Number.isFinite(price) || price <= 0) return [];
    return [{ ticker, price, changePercentage: Number.isFinite(Number(item.pct_change)) ? Number(item.pct_change) : 0 }];
  });
}

export async function fetchCedearQuotes(symbols: string[], signal?: AbortSignal): Promise<CedearQuote[]> {
  if (symbols.length === 0) return [];
  const response = await fetch('https://data912.com/live/arg_cedears', { signal });
  if (!response.ok) throw new Error('No se pudieron actualizar las cotizaciones.');
  return parseCedearQuotes(await response.json(), symbols);
}
