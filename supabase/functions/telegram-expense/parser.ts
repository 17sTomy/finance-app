export interface ParsedExpense { amount: number; currency: 'ARS' | 'USD'; name: string }
export interface ExpenseCategory { id: string; name: string; kind: string; parent_category_id?: string | null }

function parseAmount(raw: string): number | null {
  let normalized: string;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw)) normalized = raw.replaceAll('.', '').replace(',', '.');
  else if (/^\d+(?:[.,]\d{1,2})?$/.test(raw)) normalized = raw.replace(',', '.');
  else return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 && amount <= 999999999999.99 ? amount : null;
}

export function parseExpenseMessage(text: string): ParsedExpense | null {
  const match = text.trim().match(/^(?:gast[eé]\s+)?(?:(ARS|USD|US\$|\$)\s*)?(\d[\d.,]*)(?:\s*(ARS|USD|pesos|d[oó]lares))?\s+(?:en\s+)?(.+)$/iu);
  if (!match) return null;
  const amount = parseAmount(match[2]);
  const asCurrency = (value: string) => /^(usd|us\$|d[oó]lares)$/i.test(value) ? 'USD' : 'ARS';
  const prefixCurrency = match[1] ? asCurrency(match[1]) : undefined;
  const suffixCurrency = match[3] ? asCurrency(match[3]) : undefined;
  if (prefixCurrency && suffixCurrency && prefixCurrency !== suffixCurrency) return null;
  const name = match[4].trim().replace(/\s+/g, ' ');
  if (amount === null || name.length < 2 || name.length > 160 || name.toLowerCase() === 'en') return null;
  return { amount, currency: prefixCurrency ?? suffixCurrency ?? 'ARS', name };
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function matchExpenseCategory(name: string, categories: ExpenseCategory[]): ExpenseCategory | null {
  const phrase = normalize(name);
  const matches = categories.filter((category) => category.kind === 'expense' || category.kind === 'all')
    .map((category) => {
      const categoryName = normalize(category.name);
      const score = categoryName === phrase ? 10000
        : categoryName.length > 2 && (' ' + phrase + ' ').includes(' ' + categoryName + ' ') ? categoryName.length : 0;
      return { category, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (!matches.length || matches[1]?.score === matches[0].score) return null;
  return matches[0].category;
}

export function argentinaMessageDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}
