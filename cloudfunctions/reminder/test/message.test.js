const { buildSummary, buildTemplateData } = require('../lib/message');

const chore = (name, nextDueAt) => ({ name, nextDueAt });

describe('buildSummary', () => {
  const today = '2026-09-17';

  test('统计条数并以最紧急的一件作为摘要', () => {
    const summary = buildSummary(
      [chore('浇花', '2026-09-18'), chore('刷马桶', '2026-09-15'), chore('拖地', '2026-09-17')],
      today
    );
    expect(summary.count).toBe(3);
    expect(summary.topChore.name).toBe('刷马桶');
    expect(summary.headline).toBe('刷马桶已逾期 2 天');
  });

  test('今天到期的摘要文案', () => {
    const summary = buildSummary([chore('拖地', '2026-09-17')], today);
    expect(summary.headline).toBe('拖地今天到期');
  });

  test('明天到期的摘要文案', () => {
    const summary = buildSummary([chore('浇花', '2026-09-18')], today);
    expect(summary.headline).toBe('浇花明天到期');
  });

  test('多天后到期的摘要文案', () => {
    const summary = buildSummary([chore('擦玻璃', '2026-09-20')], today);
    expect(summary.headline).toBe('擦玻璃还有 3 天');
  });

  test('空列表返回 count 为 0 且无 topChore', () => {
    const summary = buildSummary([], today);
    expect(summary.count).toBe(0);
    expect(summary.topChore).toBeNull();
    expect(summary.headline).toBe('');
  });
});

describe('buildTemplateData', () => {
  const today = '2026-09-17';

  test('输出订阅消息模板所需的字段结构', () => {
    const summary = buildSummary([chore('刷马桶', '2026-09-15')], today);
    const data = buildTemplateData(summary, today);
    Object.values(data).forEach((field) => {
      expect(field).toHaveProperty('value');
      expect(typeof field.value).toBe('string');
    });
  });

  test('事项名称字段截断到 20 字符以内，满足模板长度限制', () => {
    const summary = buildSummary([chore('名'.repeat(50), '2026-09-15')], today);
    const data = buildTemplateData(summary, today);
    Object.values(data).forEach((field) => {
      expect(field.value.length).toBeLessThanOrEqual(20);
    });
  });

  test('待办数量 phrase 字段截断到 5 字符以内', () => {
    const data = buildTemplateData(
      { count: 123456, topChore: chore('拖地', '2026-09-15') },
      today
    );
    expect(data.phrase2.value.length).toBeLessThanOrEqual(5);
  });

  test('包含待办条数信息', () => {
    const summary = buildSummary(
      [chore('a', '2026-09-15'), chore('b', '2026-09-17')],
      today
    );
    const data = buildTemplateData(summary, today);
    const joined = Object.values(data).map((f) => f.value).join(' ');
    expect(joined).toContain('2');
  });

  test('包含今天的日期', () => {
    const summary = buildSummary([chore('a', '2026-09-15')], today);
    const data = buildTemplateData(summary, today);
    const joined = Object.values(data).map((f) => f.value).join(' ');
    expect(joined).toContain('2026-09-17');
  });
});
