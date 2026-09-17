const { resolveBaseKey, computeNextDueAt } = require('./schedule');

describe('resolveBaseKey', () => {
  test('优先取 lastDoneAt 对应的本地日历日', () => {
    const base = resolveBaseKey({
      lastDoneAt: Date.UTC(2026, 8, 16, 16, 30), // 北京 2026-09-17 00:30
      initialLastDoneKey: '2026-01-01',
      createdAt: Date.UTC(2026, 0, 1),
    });
    expect(base).toBe('2026-09-17');
  });

  test('没有 lastDoneAt 时取用户填写的上次完成日', () => {
    const base = resolveBaseKey({
      lastDoneAt: null,
      initialLastDoneKey: '2026-08-01',
      createdAt: Date.UTC(2026, 8, 17, 4, 0),
    });
    expect(base).toBe('2026-08-01');
  });

  test('两者都没有时取创建当天', () => {
    const base = resolveBaseKey({
      lastDoneAt: null,
      initialLastDoneKey: null,
      createdAt: Date.UTC(2026, 8, 17, 4, 0),
    });
    expect(base).toBe('2026-09-17');
  });

  test('lastDoneAt 为 0 视为没有完成过', () => {
    const base = resolveBaseKey({
      lastDoneAt: 0,
      initialLastDoneKey: '2026-08-01',
      createdAt: Date.UTC(2026, 8, 17, 4, 0),
    });
    expect(base).toBe('2026-08-01');
  });
});

describe('computeNextDueAt · 浮动周期', () => {
  test('基准日加上间隔天数', () => {
    const chore = { scheduleType: 'floating', intervalDays: 30 };
    expect(computeNextDueAt(chore, '2026-09-17')).toBe('2026-10-17');
  });

  test('晚做几天则整体顺延，不累积欠账', () => {
    const chore = { scheduleType: 'floating', intervalDays: 30 };
    // 原定 09-17 到期，实际 09-22 才做，下次是 10-22 而非 10-17
    expect(computeNextDueAt(chore, '2026-09-22')).toBe('2026-10-22');
  });

  test('间隔 1 天', () => {
    const chore = { scheduleType: 'floating', intervalDays: 1 };
    expect(computeNextDueAt(chore, '2026-12-31')).toBe('2027-01-01');
  });

  test('间隔跨越非闰年 2 月', () => {
    const chore = { scheduleType: 'floating', intervalDays: 7 };
    expect(computeNextDueAt(chore, '2026-02-25')).toBe('2026-03-04');
  });
});

describe('computeNextDueAt · 非法输入', () => {
  test('未知 scheduleType 抛错', () => {
    expect(() => computeNextDueAt({ scheduleType: 'weird' }, '2026-09-17')).toThrow(
      /unsupported scheduleType/
    );
  });

  test('浮动周期缺少 intervalDays 抛错', () => {
    expect(() => computeNextDueAt({ scheduleType: 'floating' }, '2026-09-17')).toThrow(
      /intervalDays/
    );
  });

  test('浮动周期 intervalDays 小于 1 抛错', () => {
    expect(() =>
      computeNextDueAt({ scheduleType: 'floating', intervalDays: 0 }, '2026-09-17')
    ).toThrow(/intervalDays/);
  });
});

describe('computeNextDueAt · 固定日历 weekly', () => {
  const weekly = (weekdays) => ({
    scheduleType: 'fixed',
    fixedRule: { type: 'weekly', weekdays },
  });

  test('每周日，基准是周四，返回本周日', () => {
    // 2026-09-17 是周四，2026-09-20 是周日
    expect(computeNextDueAt(weekly([0]), '2026-09-17')).toBe('2026-09-20');
  });

  test('基准正好是规则日时返回下一周，不返回当天', () => {
    // 2026-09-20 是周日
    expect(computeNextDueAt(weekly([0]), '2026-09-20')).toBe('2026-09-27');
  });

  test('跳过一次不累积：上次完成是上周日，今天周三，下次仍是本周日', () => {
    // 基准 2026-09-13（周日）-> 2026-09-20（周日）
    expect(computeNextDueAt(weekly([0]), '2026-09-13')).toBe('2026-09-20');
  });

  test('多选周二和周四，基准周四返回下周二', () => {
    // 2026-09-17 周四 -> 2026-09-22 周二
    expect(computeNextDueAt(weekly([2, 4]), '2026-09-17')).toBe('2026-09-22');
  });

  test('多选周二和周四，基准周一返回本周二', () => {
    // 2026-09-14 周一 -> 2026-09-15 周二
    expect(computeNextDueAt(weekly([2, 4]), '2026-09-14')).toBe('2026-09-15');
  });

  test('weekdays 顺序打乱不影响结果', () => {
    expect(computeNextDueAt(weekly([4, 2]), '2026-09-14')).toBe('2026-09-15');
  });

  test('weekdays 为空数组抛错', () => {
    expect(() => computeNextDueAt(weekly([]), '2026-09-17')).toThrow(/weekdays/);
  });

  test('weekdays 含越界值抛错', () => {
    expect(() => computeNextDueAt(weekly([7]), '2026-09-17')).toThrow(/weekdays/);
  });
});

describe('computeNextDueAt · 固定日历 monthly', () => {
  const monthly = (dayOfMonth) => ({
    scheduleType: 'fixed',
    fixedRule: { type: 'monthly', dayOfMonth },
  });

  test('每月 1 号，基准月中返回下月 1 号', () => {
    expect(computeNextDueAt(monthly(1), '2026-09-17')).toBe('2026-10-01');
  });

  test('每月 25 号，基准月初返回本月 25 号', () => {
    expect(computeNextDueAt(monthly(25), '2026-09-03')).toBe('2026-09-25');
  });

  test('基准正好是规则日时返回下个月', () => {
    expect(computeNextDueAt(monthly(25), '2026-09-25')).toBe('2026-10-25');
  });

  test('每月 31 号遇 2 月取该月最后一天', () => {
    expect(computeNextDueAt(monthly(31), '2026-01-31')).toBe('2026-02-28');
  });

  test('每月 31 号遇闰年 2 月取 29 号', () => {
    expect(computeNextDueAt(monthly(31), '2028-01-31')).toBe('2028-02-29');
  });

  test('每月 31 号遇 4 月取 30 号', () => {
    expect(computeNextDueAt(monthly(31), '2026-03-31')).toBe('2026-04-30');
  });

  test('跨年', () => {
    expect(computeNextDueAt(monthly(1), '2026-12-15')).toBe('2027-01-01');
  });

  test('dayOfMonth 越界抛错', () => {
    expect(() => computeNextDueAt(monthly(32), '2026-09-17')).toThrow(/dayOfMonth/);
    expect(() => computeNextDueAt(monthly(0), '2026-09-17')).toThrow(/dayOfMonth/);
  });
});

describe('computeNextDueAt · 固定日历 yearly', () => {
  const yearly = (month, dayOfMonth) => ({
    scheduleType: 'fixed',
    fixedRule: { type: 'yearly', month, dayOfMonth },
  });

  test('每年 4 月 15 日，基准 5 月返回次年', () => {
    expect(computeNextDueAt(yearly(4, 15), '2026-05-01')).toBe('2027-04-15');
  });

  test('每年 10 月 1 日，基准 9 月返回当年', () => {
    expect(computeNextDueAt(yearly(10, 1), '2026-09-17')).toBe('2026-10-01');
  });

  test('基准正好是规则日时返回次年', () => {
    expect(computeNextDueAt(yearly(10, 1), '2026-10-01')).toBe('2027-10-01');
  });

  test('每年 2 月 29 日在非闰年取 2 月 28 日', () => {
    expect(computeNextDueAt(yearly(2, 29), '2026-01-01')).toBe('2026-02-28');
  });

  test('每年 2 月 29 日在闰年取 2 月 29 日', () => {
    expect(computeNextDueAt(yearly(2, 29), '2028-01-01')).toBe('2028-02-29');
  });

  test('month 越界抛错', () => {
    expect(() => computeNextDueAt(yearly(13, 1), '2026-09-17')).toThrow(/month/);
  });
});

describe('computeNextDueAt · 固定日历非法规则', () => {
  test('缺少 fixedRule 抛错', () => {
    expect(() => computeNextDueAt({ scheduleType: 'fixed' }, '2026-09-17')).toThrow(
      /fixedRule/
    );
  });

  test('未知 fixedRule.type 抛错', () => {
    expect(() =>
      computeNextDueAt(
        { scheduleType: 'fixed', fixedRule: { type: 'hourly' } },
        '2026-09-17'
      )
    ).toThrow(/unsupported fixedRule type/);
  });
});
