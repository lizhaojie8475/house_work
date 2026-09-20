const { ROOMS, CHORE_TEMPLATES, templatesByRoom } = require('./chore-templates');
const { normalizeChoreInput } = require('../../cloudfunctions/api/lib/chore-input');

// 用户在需求中明确点名的家务，必须全部覆盖
const REQUIRED_NAMES = [
  '洗衣机自清洁',
  '刷马桶',
  '换床单',
  '洗油烟机',
  '清洗扫地机器人',
  '浇花',
  '擦玻璃',
];

describe('ROOMS', () => {
  test('六个分区', () => {
    expect(ROOMS).toEqual(['厨房', '卫生间', '卧室', '客厅', '阳台', '全屋']);
  });
});

describe('CHORE_TEMPLATES', () => {
  test('至少 30 条', () => {
    expect(CHORE_TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  test('覆盖用户明确点名的所有家务', () => {
    const names = CHORE_TEMPLATES.map((t) => t.name);
    REQUIRED_NAMES.forEach((name) => expect(names).toContain(name));
  });

  test('id 唯一', () => {
    const ids = CHORE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('名称唯一', () => {
    const names = CHORE_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('每条的 room 都在 ROOMS 之内', () => {
    CHORE_TEMPLATES.forEach((t) => {
      expect(ROOMS).toContain(t.room);
    });
  });

  test('每条都有非空图标与预估耗时', () => {
    CHORE_TEMPLATES.forEach((t) => {
      expect(t.icon).toBeTruthy();
      expect(Number.isInteger(t.estimatedMinutes)).toBe(true);
      expect(t.estimatedMinutes).toBeGreaterThan(0);
    });
  });

  test('每条都能通过后端输入校验', () => {
    CHORE_TEMPLATES.forEach((t) => {
      expect(() =>
        normalizeChoreInput(t, { defaultReminderLeadDays: 1 })
      ).not.toThrow();
    });
  });

  test('六个分区各至少有一条模板', () => {
    const grouped = templatesByRoom();
    ROOMS.forEach((room) => {
      expect(grouped[room].length).toBeGreaterThan(0);
    });
  });

  test('至少有一条固定日历模板，验证两种周期都被覆盖', () => {
    expect(CHORE_TEMPLATES.some((t) => t.scheduleType === 'fixed')).toBe(true);
    expect(CHORE_TEMPLATES.some((t) => t.scheduleType === 'floating')).toBe(true);
  });
});

describe('templatesByRoom', () => {
  test('分组后总数不变', () => {
    const grouped = templatesByRoom();
    const total = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(CHORE_TEMPLATES.length);
  });

  test('键顺序与 ROOMS 一致', () => {
    expect(Object.keys(templatesByRoom())).toEqual(ROOMS);
  });
});
