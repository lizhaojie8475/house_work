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
