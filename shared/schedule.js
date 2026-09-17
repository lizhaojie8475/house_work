// 下次到期日计算。输入输出均为本地日历日字符串 YYYY-MM-DD。
const { addDays, toLocalDateKey } = require('./date');

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

function computeNextDueAt(chore, baseKey) {
  if (chore.scheduleType === 'floating') {
    return nextFloating(baseKey, chore.intervalDays);
  }
  throw new Error(`unsupported scheduleType: ${chore.scheduleType}`);
}

module.exports = { resolveBaseKey, computeNextDueAt };
