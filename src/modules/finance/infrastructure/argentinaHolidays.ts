interface HolidayResponse { fecha: string; tipo: string; nombre: string }

const cache = new Map<number, ReadonlySet<string>>();
const emptyDates = new Set<string>();

export const getCachedHolidayDates = (year: number) => cache.get(year) ?? emptyDates;

export async function loadArgentinaHolidayDates(year: number, signal?: AbortSignal): Promise<ReadonlySet<string>> {
  const cached = cache.get(year);
  if (cached) return cached;
  const response = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`, { signal });
  if (!response.ok) throw new Error('No se pudieron consultar los feriados nacionales.');
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('La respuesta de feriados no es vÃ¡lida.');
  const dates = new Set(payload
    .filter((item): item is HolidayResponse => !!item && typeof item === 'object' && typeof (item as HolidayResponse).fecha === 'string')
    .map((item) => item.fecha));
  cache.set(year, dates);
  return dates;
}
