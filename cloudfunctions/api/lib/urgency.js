// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。
// 源文件：shared/urgency.js
// 紧急度分档、排序与到期文案。
// 这里的阈值只影响展示分组，与家务自身的 reminderLeadDays（推送时机）无关。
const { diffDays } = require('./date');

const SOON_THRESHOLD_DAYS = 3;

const LEVELS = {
  OVERDUE: 'overdue',
  TODAY: 'today',
  SOON: 'soon',
  NORMAL: 'normal',
};

const LEVEL_ORDER = {
  [LEVELS.OVERDUE]: 0,
  [LEVELS.TODAY]: 1,
  [LEVELS.SOON]: 2,
  [LEVELS.NORMAL]: 3,
};

function classify(nextDueAt, todayKey) {
  const days = diffDays(todayKey, nextDueAt);
  if (days < 0) return { level: LEVELS.OVERDUE, days };
  if (days === 0) return { level: LEVELS.TODAY, days };
  if (days <= SOON_THRESHOLD_DAYS) return { level: LEVELS.SOON, days };
  return { level: LEVELS.NORMAL, days };
}

function formatDueText(urgency) {
  if (urgency.level === LEVELS.OVERDUE) return `已逾期 ${-urgency.days} 天`;
  if (urgency.level === LEVELS.TODAY) return '今天到期';
  if (urgency.days === 1) return '明天到期';
  return `还有 ${urgency.days} 天`;
}

// 逾期档要求拖得越久越靠前（days 越负），其余档要求日期越近越靠前（days 越小）。
// 两者都是 days 升序，因此同档内统一升序即可。
function sortChores(chores, todayKey) {
  return chores
    .map((chore) => ({ ...chore, urgency: classify(chore.nextDueAt, todayKey) }))
    .sort((a, b) => {
      const byLevel = LEVEL_ORDER[a.urgency.level] - LEVEL_ORDER[b.urgency.level];
      if (byLevel !== 0) return byLevel;
      if (a.urgency.days !== b.urgency.days) return a.urgency.days - b.urgency.days;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
}

module.exports = { SOON_THRESHOLD_DAYS, LEVELS, classify, formatDueText, sortChores };
