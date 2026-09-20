const cloud = require('wx-server-sdk');
const { createRepo } = require('./lib/repo');
const { runReminderScan } = require('./lib/scan');
const { TEMPLATE_ID } = require('./lib/message');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const repo = createRepo(db, db.command);

async function sender({ openid, data }) {
  const res = await cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId: TEMPLATE_ID,
    page: 'pages/todo/todo',
    data,
    miniprogramState: 'formal',
    lang: 'zh_CN',
  });
  if (res.errCode && res.errCode !== 0) {
    throw new Error(`subscribeMessage.send failed: ${res.errCode} ${res.errMsg}`);
  }
}

exports.main = async () => {
  if (!TEMPLATE_ID) {
    console.error('[reminder] REMINDER_TEMPLATE_ID 未配置，跳过本次扫描');
    return { ok: false, reason: 'missing template id' };
  }
  const stats = await runReminderScan({ repo, sender, now: Date.now(), logger: console });
  console.log('[reminder] scan finished', stats);
  return { ok: true, stats };
};
