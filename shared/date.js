// 本地日历日工具。全部基于 UTC 构造 Date 做整日运算，结果与运行环境时区无关。
// 云函数运行环境是 UTC，若用本地时间 API 判断「今天」，
// 北京时间 00:00-08:00 会被算成前一天，导致提醒整体错一天。

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Shanghai，中国无夏令时

function toLocalDateKey(timestamp) {
  return new Date(timestamp + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function todayKey(now = Date.now()) {
  return toLocalDateKey(now);
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function makeDateKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function keyToUtcMs(key) {
  const { y, m, d } = parseDateKey(key);
  return Date.UTC(y, m - 1, d);
}

function addDays(key, days) {
  return new Date(keyToUtcMs(key) + days * 86400000).toISOString().slice(0, 10);
}

function diffDays(fromKey, toKey) {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / 86400000);
}

function weekdayOf(key) {
  return new Date(keyToUtcMs(key)).getUTCDay();
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

module.exports = {
  TZ_OFFSET_MS,
  toLocalDateKey,
  todayKey,
  parseDateKey,
  makeDateKey,
  addDays,
  diffDays,
  weekdayOf,
  daysInMonth,
};
