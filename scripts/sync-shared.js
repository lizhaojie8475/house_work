#!/usr/bin/env node
// 把 shared/ 下的纯函数分发到各消费方。
// 云函数无法跨目录 require，小程序只能引用 miniprogram/ 内的文件，
// 因此用拷贝而非软链接或 npm workspace。
const fs = require('fs');
const path = require('path');

const ALL_FILES = ['date.js', 'schedule.js', 'urgency.js', 'repo.js'];

const TARGETS = [
  { dir: 'cloudfunctions/api/lib', files: ALL_FILES },
  { dir: 'cloudfunctions/reminder/lib', files: ALL_FILES },
  // 小程序不拿 schedule.js：到期日由云函数算好并持久化，前端只读 nextDueAt。
  { dir: 'miniprogram/utils/shared', files: ['date.js', 'urgency.js'] },
];

function banner(fileName) {
  return [
    '// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。',
    `// 源文件：shared/${fileName}`,
    '',
  ].join('\n');
}

function syncShared({ rootDir = path.resolve(__dirname, '..'), targets = TARGETS } = {}) {
  return targets.map(({ dir, files }) => {
    const destDir = path.join(rootDir, dir);
    fs.mkdirSync(destDir, { recursive: true });
    files.forEach((fileName) => {
      const src = path.join(rootDir, 'shared', fileName);
      if (!fs.existsSync(src)) {
        throw new Error(`shared source not found: ${fileName}`);
      }
      const body = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(path.join(destDir, fileName), banner(fileName) + body);
    });
    return { dir, files };
  });
}

if (require.main === module) {
  syncShared().forEach(({ dir, files }) => {
    console.log(`synced ${files.length} file(s) -> ${dir}`);
  });
}

module.exports = { TARGETS, syncShared };
