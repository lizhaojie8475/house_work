const { todayKey, addDays, TZ_OFFSET_MS } = require('./date');
const { buildSummary, buildTemplateData } = require('./message');

const DUPLICATE_KEY_ERR_CODE = -502001;
const DUPLICATE_KEY_MESSAGE = 'duplicate key error';

function localHourOf(now) {
  return new Date(now + TZ_OFFSET_MS).getUTCHours();
}

// 同类识别器也存在于 cloudfunctions/api/lib/db-conflict.js；错误形态来自外部
// CloudBase SDK，SDK 变化时必须同步更新两处（云函数需各自独立打包）。
function isDuplicateKeyError(err) {
  return Boolean(
    err &&
      (err.errCode === DUPLICATE_KEY_ERR_CODE ||
        String(err.message || '').includes(DUPLICATE_KEY_MESSAGE))
  );
}

function logFailure(logger, context, operation, err) {
  logger.error(`[reminder] ${operation} failed ${context}`, err);
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
    try {
      // 先按最宽松的阈值捞一批，再按每件家务自己的 reminderLeadDays 精筛
      const maxLeadDays = 30;
      let candidates;
      try {
        candidates = await repo.listDueChores(family._id, addDays(today, maxLeadDays));
      } catch (err) {
        logFailure(logger, `familyId=${family._id}`, 'listDueChores', err);
        stats.failed += 1;
        continue;
      }
      const due = candidates.filter(
        (chore) => chore.nextDueAt <= addDays(today, chore.reminderLeadDays)
      );
      if (due.length === 0) continue;

      const summary = buildSummary(due, today);
      const data = buildTemplateData(summary, today);
      let members;
      try {
        members = await repo.listMembers(family._id);
      } catch (err) {
        logFailure(logger, `familyId=${family._id}`, 'listMembers', err);
        stats.failed += 1;
        continue;
      }

      for (const member of members) {
        if (!member.subscribeQuota || member.subscribeQuota <= 0) {
          stats.skipped += 1;
          continue;
        }

        try {
          await repo.recordReminderSent({
            openid: member.openid,
            dateKey: today,
            choreCount: due.length,
            sentAt: now,
          });
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            stats.skipped += 1;
            continue;
          }
          logFailure(logger, `familyId=${family._id} openid=${member.openid}`, 'claim', err);
          stats.failed += 1;
          continue;
        }

        try {
          await sender({ openid: member.openid, data });
          stats.sent += 1;
        } catch (err) {
          // 发送失败时释放预先写入的原子认领，允许后续合法重试。
          logFailure(logger, `familyId=${family._id} openid=${member.openid}`, 'send', err);
          try {
            const removed = await repo.deleteReminderSend(member.openid, today);
            if (!removed) {
              logger.error(
                `[reminder] releaseClaim failed familyId=${family._id} openid=${member.openid}: claim not found`
              );
            }
          } catch (releaseErr) {
            logFailure(
              logger,
              `familyId=${family._id} openid=${member.openid}`,
              'releaseClaim',
              releaseErr
            );
          }
          // 只有发送调用本身失败才说明授权已撤回或额度已耗尽，才校正为 0。
          try {
            await repo.updateMember(member._id, { subscribeQuota: 0 });
          } catch (quotaErr) {
            logFailure(
              logger,
              `familyId=${family._id} openid=${member.openid}`,
              'correctQuota',
              quotaErr
            );
          }
          stats.failed += 1;
          continue;
        }

        try {
          await repo.incrementSubscribeQuota(member._id, -1);
        } catch (err) {
          // 消息已经发出，不能把持久化故障误判为授权失效并清零用户累积额度。
          logFailure(
            logger,
            `familyId=${family._id} openid=${member.openid}`,
            'decrementQuotaAfterSend',
            err
          );
          stats.failed += 1;
        }
      }
    } catch (err) {
      logFailure(logger, `familyId=${family._id}`, 'processFamily', err);
      stats.failed += 1;
    }
  }

  return stats;
}

module.exports = { runReminderScan, localHourOf };
