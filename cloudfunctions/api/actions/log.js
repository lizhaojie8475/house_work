const { appError, CODES } = require('../lib/errors');
const { requireMember } = require('../lib/auth');
const { loadOwnChore } = require('./chore');
const { resolveBaseKey, computeNextDueAt } = require('../lib/schedule');
const { todayKey } = require('../lib/date');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// 从流水重算冗余字段。lastDoneAt 取所有 done 流水中最大的 doneAt，
// 因此补录一个更早的日期不会把「上次完成」倒退。
function deriveFromLogs(chore, doneLogs) {
  const latest = doneLogs.length > 0 ? doneLogs[0] : null;
  const lastDoneAt = latest ? latest.doneAt : null;
  const lastDoneBy = latest ? latest.doneBy : null;
  const baseKey = resolveBaseKey({
    lastDoneAt,
    initialLastDoneKey: chore.initialLastDoneKey,
    createdAt: chore.createdAt,
  });
  return { lastDoneAt, lastDoneBy, nextDueAt: computeNextDueAt(chore, baseKey) };
}

async function complete({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  const now = Date.now();
  const doneAt = payload.doneAt === undefined ? now : payload.doneAt;
  if (!Number.isFinite(doneAt) || doneAt > now) {
    throw appError(CODES.INVALID_ARGUMENT, '完成时间不能晚于当前时间');
  }

  const log = await repo.createLog({
    familyId: member.familyId,
    choreId: chore._id,
    type: 'done',
    doneAt,
    doneBy: openid,
    note: String(payload.note || '').slice(0, 200),
    createdAt: now,
  });

  const doneLogs = await repo.listRecentDoneLogs(chore._id, 1);
  const updated = await repo.updateChore(chore._id, deriveFromLogs(chore, doneLogs));
  return { chore: updated, log };
}

async function undo({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  // 取两条：第一条待删除，第二条是回滚目标
  const doneLogs = await repo.listRecentDoneLogs(chore._id, 2);
  if (doneLogs.length === 0) {
    throw appError(CODES.NOT_FOUND, '这件家务还没有完成记录，无法撤销');
  }

  await repo.deleteLog(doneLogs[0]._id);
  const updated = await repo.updateChore(chore._id, deriveFromLogs(chore, doneLogs.slice(1)));
  return { chore: updated };
}

async function skip({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  const now = Date.now();
  const log = await repo.createLog({
    familyId: member.familyId,
    choreId: chore._id,
    type: 'skip',
    doneAt: now,
    doneBy: openid,
    note: String(payload.note || '').slice(0, 200),
    createdAt: now,
  });

  // 浮动周期从今天重新起算；固定日历顺延到原到期日之后的下一个规则日。
  const baseKey = chore.scheduleType === 'floating' ? todayKey(now) : chore.nextDueAt;
  const updated = await repo.updateChore(chore._id, {
    nextDueAt: computeNextDueAt(chore, baseKey),
  });
  return { chore: updated, log };
}

async function list({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  const limit = payload.limit === undefined ? DEFAULT_LIMIT : payload.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw appError(CODES.INVALID_ARGUMENT, `每页条数需为 1 到 ${MAX_LIMIT} 之间的整数`);
  }
  const skipCount = payload.skip === undefined ? 0 : payload.skip;
  if (!Number.isInteger(skipCount) || skipCount < 0) {
    throw appError(CODES.INVALID_ARGUMENT, '分页偏移必须是非负整数');
  }

  const logs = await repo.listLogs(chore._id, { limit, skip: skipCount });
  return { logs };
}

module.exports = {
  'log.complete': complete,
  'log.undo': undo,
  'log.skip': skip,
  'log.list': list,
};
