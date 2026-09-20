const {
  TZ_OFFSET_MS,
  toLocalDateKey,
  todayKey,
  parseDateKey,
  makeDateKey,
  addDays,
  diffDays,
  weekdayOf,
  daysInMonth,
} = require('./date');

describe('TZ_OFFSET_MS', () => {
  test('Jest 进程固定运行在 UTC', () => {
    expect(new Date().getTimezoneOffset()).toBe(0);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
  });

  test('固定为 UTC+8', () => {
    expect(TZ_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
  });
});

describe('toLocalDateKey', () => {
  test('北京时间 00:30 属于当天，不能算成前一天', () => {
    // UTC 2026-02-28 16:30 === 北京 2026-03-01 00:30
    const ts = Date.UTC(2026, 1, 28, 16, 30);
    expect(toLocalDateKey(ts)).toBe('2026-03-01');
  });

  test('北京时间 23:30 属于当天，不能算成后一天', () => {
    // UTC 2026-02-28 15:30 === 北京 2026-02-28 23:30
    const ts = Date.UTC(2026, 1, 28, 15, 30);
    expect(toLocalDateKey(ts)).toBe('2026-02-28');
  });

  test('北京时间正午', () => {
    const ts = Date.UTC(2026, 8, 17, 4, 0);
    expect(toLocalDateKey(ts)).toBe('2026-09-17');
  });
});

describe('todayKey', () => {
  test('接受注入的当前时间', () => {
    expect(todayKey(Date.UTC(2026, 0, 1, 16, 0))).toBe('2026-01-02');
  });

  test('不传参数时返回 10 位日期字符串', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseDateKey', () => {
  test('月份返回 1 到 12', () => {
    expect(parseDateKey('2026-09-17')).toEqual({ y: 2026, m: 9, d: 17 });
  });
});

describe('makeDateKey', () => {
  test('个位数月日补零', () => {
    expect(makeDateKey(2026, 1, 5)).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  test('跨月', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  test('跨年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('闰年 2 月', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('非闰年 2 月', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('负数天数往前推', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('加 0 天返回原值', () => {
    expect(addDays('2026-09-17', 0)).toBe('2026-09-17');
  });
});

describe('diffDays', () => {
  test('未来日期返回正数', () => {
    expect(diffDays('2026-09-17', '2026-09-20')).toBe(3);
  });

  test('过去日期返回负数', () => {
    expect(diffDays('2026-09-17', '2026-09-15')).toBe(-2);
  });

  test('同一天返回 0', () => {
    expect(diffDays('2026-09-17', '2026-09-17')).toBe(0);
  });

  test('跨年计算', () => {
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('weekdayOf', () => {
  test('周日返回 0', () => {
    // 2026-09-20 是周日
    expect(weekdayOf('2026-09-20')).toBe(0);
  });

  test('周四返回 4', () => {
    // 2026-09-17 是周四
    expect(weekdayOf('2026-09-17')).toBe(4);
  });
});

describe('daysInMonth', () => {
  test('1 月 31 天', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  test('非闰年 2 月 28 天', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  test('闰年 2 月 29 天', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  test('整百非闰年 2 月 28 天', () => {
    expect(daysInMonth(2100, 2)).toBe(28);
  });

  test('4 月 30 天', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});
