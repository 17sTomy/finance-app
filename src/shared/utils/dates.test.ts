import { clampDayToMonth } from './dates';

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
