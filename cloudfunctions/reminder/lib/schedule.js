// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。
// 源文件：shared/schedule.js
// 下次到期日计算。输入输出均为本地日历日字符串 YYYY-MM-DD。
const {
  addDays,
  toLocalDateKey,
  parseDateKey,
  makeDateKey,
  weekdayOf,
  daysInMonth,
} = require('./date');

// 按优先级解析周期计算的基准日：
// 上次完成日 -> 新建时用户填写的「上次是什么时候做的」 -> 创建当天
function resolveBaseKey({ lastDoneAt, initialLastDoneKey, createdAt }) {
  if (lastDoneAt) return toLocalDateKey(lastDoneAt);
  if (initialLastDoneKey) return initialLastDoneKey;
  return toLocalDateKey(createdAt);
}

function nextFloating(baseKey, intervalDays) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error(`invalid intervalDays: ${intervalDays}`);
  }
  return addDays(baseKey, intervalDays);
}

function nextWeekly(baseKey, weekdays) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    throw new Error(`invalid weekdays: ${JSON.stringify(weekdays)}`);
  }
  if (weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) {
    throw new Error(`invalid weekdays: ${JSON.stringify(weekdays)}`);
  }
  const baseWeekday = weekdayOf(baseKey);
  // delta 为 0 表示基准日本身，按「严格晚于」的语义顺延整周
  const deltas = weekdays.map((w) => ((w - baseWeekday + 7) % 7) || 7);
  return addDays(baseKey, Math.min(...deltas));
}

function nextMonthly(baseKey, dayOfMonth) {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`invalid dayOfMonth: ${dayOfMonth}`);
  }
  const { y, m } = parseDateKey(baseKey);
  // 最多两轮：本月的候选日若不晚于基准日，下月的候选日必然晚于基准日
  let cy = y;
  let cm = m;
  for (let i = 0; i < 2; i += 1) {
    const day = Math.min(dayOfMonth, daysInMonth(cy, cm));
    const candidate = makeDateKey(cy, cm, day);
    if (candidate > baseKey) return candidate;
    cm += 1;
    if (cm > 12) {
      cm = 1;
      cy += 1;
    }
  }
  throw new Error(`failed to resolve monthly rule from ${baseKey}`);
}

function nextYearly(baseKey, month, dayOfMonth) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`invalid month: ${month}`);
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`invalid dayOfMonth: ${dayOfMonth}`);
  }
  const { y } = parseDateKey(baseKey);
  for (let cy = y; cy <= y + 1; cy += 1) {
    const day = Math.min(dayOfMonth, daysInMonth(cy, month));
    const candidate = makeDateKey(cy, month, day);
    if (candidate > baseKey) return candidate;
  }
  throw new Error(`failed to resolve yearly rule from ${baseKey}`);
}

function nextFixed(baseKey, rule) {
  if (!rule || typeof rule !== 'object') {
    throw new Error('missing fixedRule');
  }
  if (rule.type === 'weekly') return nextWeekly(baseKey, rule.weekdays);
  if (rule.type === 'monthly') return nextMonthly(baseKey, rule.dayOfMonth);
  if (rule.type === 'yearly') return nextYearly(baseKey, rule.month, rule.dayOfMonth);
  throw new Error(`unsupported fixedRule type: ${rule.type}`);
}

function computeNextDueAt(chore, baseKey) {
  if (chore.scheduleType === 'floating') {
    return nextFloating(baseKey, chore.intervalDays);
  }
  if (chore.scheduleType === 'fixed') {
    return nextFixed(baseKey, chore.fixedRule);
  }
  throw new Error(`unsupported scheduleType: ${chore.scheduleType}`);
}

module.exports = { resolveBaseKey, computeNextDueAt };
