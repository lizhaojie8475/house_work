const {
  SOON_THRESHOLD_DAYS,
  LEVELS,
  classify,
  formatDueText,
  sortChores,
} = require('./urgency');

describe('常量', () => {
  test('soon 阈值固定 3 天', () => {
    expect(SOON_THRESHOLD_DAYS).toBe(3);
  });

  test('四档取值', () => {
    expect(LEVELS).toEqual({
      OVERDUE: 'overdue',
      TODAY: 'today',
      SOON: 'soon',
      NORMAL: 'normal',
    });
  });
});

describe('classify', () => {
  const today = '2026-09-17';

  test('过期一天是 overdue', () => {
    expect(classify('2026-09-16', today)).toEqual({ level: 'overdue', days: -1 });
  });

  test('过期很久是 overdue', () => {
    expect(classify('2026-08-17', today)).toEqual({ level: 'overdue', days: -31 });
  });

  test('当天是 today', () => {
    expect(classify('2026-09-17', today)).toEqual({ level: 'today', days: 0 });
  });

  test('1 天后是 soon', () => {
    expect(classify('2026-09-18', today)).toEqual({ level: 'soon', days: 1 });
  });

  test('3 天后仍是 soon（边界包含）', () => {
    expect(classify('2026-09-20', today)).toEqual({ level: 'soon', days: 3 });
  });

  test('4 天后是 normal（边界之外）', () => {
    expect(classify('2026-09-21', today)).toEqual({ level: 'normal', days: 4 });
  });
});

describe('formatDueText', () => {
  test('逾期显示逾期天数的绝对值', () => {
    expect(formatDueText({ level: 'overdue', days: -2 })).toBe('已逾期 2 天');
  });

  test('逾期一天', () => {
    expect(formatDueText({ level: 'overdue', days: -1 })).toBe('已逾期 1 天');
  });

  test('今天到期', () => {
    expect(formatDueText({ level: 'today', days: 0 })).toBe('今天到期');
  });

  test('明天到期', () => {
    expect(formatDueText({ level: 'soon', days: 1 })).toBe('明天到期');
  });

  test('临近显示剩余天数', () => {
    expect(formatDueText({ level: 'soon', days: 3 })).toBe('还有 3 天');
  });

  test('正常显示剩余天数', () => {
    expect(formatDueText({ level: 'normal', days: 12 })).toBe('还有 12 天');
  });
});

describe('sortChores', () => {
  const today = '2026-09-17';

  test('按四档先后排序', () => {
    const input = [
      { name: '正常', nextDueAt: '2026-10-01' },
      { name: '今天', nextDueAt: '2026-09-17' },
      { name: '临近', nextDueAt: '2026-09-19' },
      { name: '逾期', nextDueAt: '2026-09-10' },
    ];
    expect(sortChores(input, today).map((c) => c.name)).toEqual([
      '逾期',
      '今天',
      '临近',
      '正常',
    ]);
  });

  test('逾期档内拖得越久排越前', () => {
    const input = [
      { name: '逾期3天', nextDueAt: '2026-09-14' },
      { name: '逾期30天', nextDueAt: '2026-08-18' },
      { name: '逾期1天', nextDueAt: '2026-09-16' },
    ];
    expect(sortChores(input, today).map((c) => c.name)).toEqual([
      '逾期30天',
      '逾期3天',
      '逾期1天',
    ]);
  });

  test('未逾期档内日期近的排越前', () => {
    const input = [
      { name: '20天后', nextDueAt: '2026-10-07' },
      { name: '5天后', nextDueAt: '2026-09-22' },
      { name: '10天后', nextDueAt: '2026-09-27' },
    ];
    expect(sortChores(input, today).map((c) => c.name)).toEqual([
      '5天后',
      '10天后',
      '20天后',
    ]);
  });

  test('同一天到期时按名称排序，保证顺序稳定', () => {
    const input = [
      { name: '刷马桶', nextDueAt: '2026-09-17' },
      { name: '擦玻璃', nextDueAt: '2026-09-17' },
    ];
    const names = sortChores(input, today).map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'zh')));
  });

  test('每项附加 urgency 字段', () => {
    const result = sortChores([{ name: 'x', nextDueAt: '2026-09-16' }], today);
    expect(result[0].urgency).toEqual({ level: 'overdue', days: -1 });
  });

  test('不修改原数组', () => {
    const input = [{ name: 'x', nextDueAt: '2026-09-16' }];
    sortChores(input, today);
    expect(input[0].urgency).toBeUndefined();
    expect(input).toHaveLength(1);
  });

  test('空数组返回空数组', () => {
    expect(sortChores([], today)).toEqual([]);
  });
});
