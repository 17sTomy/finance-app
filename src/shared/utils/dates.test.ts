import { clampDayToMonth, dateForSelectedMonth, isValidISODate } from './dates';

describe('clampDayToMonth', () => {
  it('adjusts days that do not exist in the selected month', () => {
    expect(clampDayToMonth('2026-02', 31)).toBe(28);
    expect(clampDayToMonth('2028-02', 31)).toBe(29);
    expect(clampDayToMonth('2026-04', 31)).toBe(30);
  });

  it('keeps valid days and clamps the lower boundary', () => {
    expect(clampDayToMonth('2026-02', 15)).toBe(15);
    expect(clampDayToMonth('2026-02', 0)).toBe(1);
  });
});

describe('finance form dates', () => {
  it('rejects empty, malformed and impossible calendar dates', () => {
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate('2026-2-03')).toBe(false);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
  });

  it('uses today in the selected month and otherwise its first day', () => {
    expect(dateForSelectedMonth('2026-08', '2026-08-30')).toBe('2026-08-30');
    expect(dateForSelectedMonth('2026-09', '2026-08-30')).toBe('2026-09-01');
  });
});
