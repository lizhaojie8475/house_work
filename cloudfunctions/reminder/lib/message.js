// 订阅消息组装。
// 模板字段名（thing1 / phrase2 / date3 等编号）由微信后台实际下发的模板决定，
// 见 docs/setup-notes.md。落地新模板时只需改本文件。
const { sortChores, classify, formatDueText } = require('./urgency');

const TEMPLATE_ID = process.env.REMINDER_TEMPLATE_ID || '';

// thing 类型字段限 20 个字符，超出会导致发送失败
const THING_MAX_LENGTH = 20;

function truncate(text, max = THING_MAX_LENGTH) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function buildSummary(chores, todayKey) {
  if (chores.length === 0) {
    return { count: 0, headline: '', topChore: null };
  }
  const sorted = sortChores(chores, todayKey);
  const top = sorted[0];
  return {
    count: chores.length,
    topChore: top,
    headline: `${top.name}${formatDueText(classify(top.nextDueAt, todayKey))}`,
  };
}

// 字段名对应 docs/setup-notes.md 中记录的模板结构。
function buildTemplateData(summary, todayKey) {
  return {
    thing1: { value: truncate(summary.topChore ? summary.topChore.name : '家务待办') },
    phrase2: { value: truncate(`${summary.count} 项待完成`, 5) },
    date3: { value: todayKey },
  };
}

module.exports = { TEMPLATE_ID, THING_MAX_LENGTH, buildSummary, buildTemplateData, truncate };
