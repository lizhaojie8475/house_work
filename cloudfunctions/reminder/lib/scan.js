const { todayKey, addDays, TZ_OFFSET_MS } = require('./date');
const { buildSummary, buildTemplateData } = require('./message');

function localHourOf(now) {
  return new Date(now + TZ_OFFSET_MS).getUTCHours();
}

// 每小时运行一次，只处理提醒时段等于当前小时的家庭。
// 这样家庭可自选提醒时段，却只需维护一个定时触发器。
async function runReminderScan({ repo, sender, now = Date.now(), logger = console }) {
  const hour = localHourOf(now);
  const today = todayKey(now);
  const stats = { scannedFamilies: 0, sent: 0, skipped: 0, failed: 0 };

  const families = await repo.listFamiliesByReminderHour(hour);
  stats.scannedFamilies = families.length;

  for (const family of families) {
    // 先按最宽松的阈值捞一批，再按每件家务自己的 reminderLeadDays 精筛
    const maxLeadDays = 30;
    const candidates = await repo.listDueChores(family._id, addDays(today, maxLeadDays));
    const due = candidates.filter(
      (chore) => chore.nextDueAt <= addDays(today, chore.reminderLeadDays)
    );
    if (due.length === 0) continue;

    const summary = buildSummary(due, today);
    const data = buildTemplateData(summary, today);
    const members = await repo.listMembers(family._id);

    for (const member of members) {
      if (!member.subscribeQuota || member.subscribeQuota <= 0) {
        stats.skipped += 1;
        continue;
      }
      if (await repo.hasSentReminder(member.openid, today)) {
        stats.skipped += 1;
        continue;
      }
      try {
        await sender({ openid: member.openid, data });
        await repo.updateMember(member._id, { subscribeQuota: member.subscribeQuota - 1 });
        await repo.recordReminderSent({
          openid: member.openid,
          dateKey: today,
          choreCount: due.length,
          sentAt: now,
        });
        stats.sent += 1;
      } catch (err) {
        // 失败多因用户撤回授权或额度耗尽。不扣额度、不写去重记录，
        // 把本地额度校正为 0，用户下次进入小程序会看到续订提示。
        logger.error(`[reminder] send failed openid=${member.openid}`, err);
        await repo.updateMember(member._id, { subscribeQuota: 0 });
        stats.failed += 1;
      }
    }
  }

  return stats;
}

module.exports = { runReminderScan, localHourOf };
