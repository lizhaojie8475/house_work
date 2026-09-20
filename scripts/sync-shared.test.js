const fs = require('fs');
const os = require('os');
const path = require('path');
const { TARGETS, syncShared } = require('./sync-shared');

describe('TARGETS 分发清单', () => {
  test('覆盖两个云函数与小程序三个消费方', () => {
    expect(TARGETS.map((t) => t.dir)).toEqual([
      'cloudfunctions/api/lib',
      'cloudfunctions/reminder/lib',
      'miniprogram/utils/shared',
    ]);
  });

  test('云函数拿到完整四个文件', () => {
    expect(TARGETS[0].files).toEqual(['date.js', 'schedule.js', 'urgency.js', 'repo.js']);
    expect(TARGETS[1].files).toEqual(['date.js', 'schedule.js', 'urgency.js', 'repo.js']);
  });

  test('小程序不同步 schedule.js，周期计算只在云函数执行', () => {
    expect(TARGETS[2].files).toEqual(['date.js', 'urgency.js']);
    expect(TARGETS[2].files).not.toContain('schedule.js');
  });
});

describe('syncShared', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-shared-'));
    fs.mkdirSync(path.join(rootDir, 'shared'));
    fs.writeFileSync(path.join(rootDir, 'shared', 'date.js'), '// date');
    fs.writeFileSync(path.join(rootDir, 'shared', 'urgency.js'), '// urgency');
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('拷贝文件并自动创建目标目录', () => {
    syncShared({
      rootDir,
      targets: [{ dir: 'cloudfunctions/api/lib', files: ['date.js'] }],
    });
    const written = path.join(rootDir, 'cloudfunctions/api/lib/date.js');
    expect(fs.readFileSync(written, 'utf8')).toBe(
      '// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。\n// 源文件：shared/date.js\n// date'
    );
  });

  test('返回实际写入清单', () => {
    const result = syncShared({
      rootDir,
      targets: [{ dir: 'a/lib', files: ['date.js', 'urgency.js'] }],
    });
    expect(result).toEqual([{ dir: 'a/lib', files: ['date.js', 'urgency.js'] }]);
  });

  test('重复执行覆盖旧内容', () => {
    const targets = [{ dir: 'a/lib', files: ['date.js'] }];
    syncShared({ rootDir, targets });
    fs.writeFileSync(path.join(rootDir, 'shared', 'date.js'), '// updated');
    syncShared({ rootDir, targets });
    expect(fs.readFileSync(path.join(rootDir, 'a/lib/date.js'), 'utf8')).toBe(
      '// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。\n// 源文件：shared/date.js\n// updated'
    );
  });

  test('源文件缺失时抛错而非静默跳过', () => {
    expect(() =>
      syncShared({ rootDir, targets: [{ dir: 'a/lib', files: ['missing.js'] }] })
    ).toThrow(/missing.js/);
  });

  test('写入文件带有禁止手工编辑的头注释', () => {
    syncShared({ rootDir, targets: [{ dir: 'a/lib', files: ['date.js'] }] });
    const content = fs.readFileSync(path.join(rootDir, 'a/lib/date.js'), 'utf8');
    expect(content).toContain('自动生成');
    expect(content).toContain('shared/date.js');
  });
});
