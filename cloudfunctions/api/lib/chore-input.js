const { appError, CODES } = require('./errors');
const { computeNextDueAt } = require('./schedule');
const { parseDateKey, daysInMonth, todayKey } = require('./date');

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireText(value, field, maxLength) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw appError(CODES.INVALID_ARGUMENT, `${field}不能为空`);
  if (text.length > maxLength) {
    throw appError(CODES.INVALID_ARGUMENT, `${field}不能超过 ${maxLength} 个字`);
  }
  return text;
}

function optionalInt(value, field, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw appError(CODES.INVALID_ARGUMENT, `${field}需为 ${min} 到 ${max} 之间的整数`);
  }
  return value;
}

function isValidDateKey(key) {
  const { y, m, d } = parseDateKey(key);
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function canonicalizeFixedRule(rule) {
  if (!rule || typeof rule !== 'object') return rule || null;
  if (rule.type === 'weekly') {
    return {
      type: rule.type,
      weekdays: Array.isArray(rule.weekdays)
        ? [...rule.weekdays].sort((a, b) => a - b)
        : rule.weekdays,
    };
  }
  if (rule.type === 'monthly') {
    return { type: rule.type, dayOfMonth: rule.dayOfMonth };
  }
  if (rule.type === 'yearly') {
    return {
      type: rule.type,
      month: rule.month,
      dayOfMonth: rule.dayOfMonth,
    };
  }
  return { type: rule.type };
}

// 归一化并校验家务输入。校验通过意味着 computeNextDueAt 一定不会抛错。
function normalizeChoreInput(raw, { defaultReminderLeadDays }) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw appError(CODES.INVALID_ARGUMENT, '每件家务都需要填写完整信息');
  }
  const scheduleType = raw.scheduleType;
  if (scheduleType !== 'floating' && scheduleType !== 'fixed') {
    throw appError(CODES.INVALID_ARGUMENT, '周期类型只能是浮动周期或固定日历');
  }

  const normalized = {
    name: requireText(raw.name, '家务名称', 30),
    icon: String(raw.icon || '🧹').slice(0, 4),
    room: String(raw.room || '全屋').trim().slice(0, 12) || '全屋',
    scheduleType,
    intervalDays: null,
    fixedRule: null,
    estimatedMinutes: optionalInt(raw.estimatedMinutes, '预估耗时', 1, 600, 15),
    notes: String(raw.notes || '').slice(0, 500),
    reminderLeadDays: optionalInt(
      raw.reminderLeadDays,
      '提前提醒天数',
      0,
      30,
      defaultReminderLeadDays
    ),
    initialLastDoneKey: null,
  };

  if (scheduleType === 'floating') {
    const days = raw.intervalDays;
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw appError(CODES.INVALID_ARGUMENT, '周期天数需为 1 到 3650 之间的整数');
    }
    normalized.intervalDays = days;
  } else {
    normalized.fixedRule = canonicalizeFixedRule(raw.fixedRule);
  }

  if (raw.initialLastDoneKey) {
    const key = String(raw.initialLastDoneKey);
    if (!DATE_KEY_RE.test(key)) {
      throw appError(CODES.INVALID_ARGUMENT, '上次完成日格式应为 2026-09-17');
    }
    if (!isValidDateKey(key)) {
      throw appError(CODES.INVALID_ARGUMENT, '上次完成日不是有效的日历日期');
    }
    if (key > todayKey()) {
      throw appError(CODES.INVALID_ARGUMENT, '上次完成日不能晚于今天');
    }
    normalized.initialLastDoneKey = key;
  }

  // 用一次实际计算兜住 fixedRule 的所有细节校验，避免把规则校验写两遍
  try {
    computeNextDueAt(normalized, '2026-01-01');
  } catch (err) {
    console.error('家务周期配置校验失败', err);
    throw appError(CODES.INVALID_ARGUMENT, '周期设置有误，请检查星期、日期和月份设置');
  }

  return normalized;
}

module.exports = { normalizeChoreInput, DATE_KEY_RE };
