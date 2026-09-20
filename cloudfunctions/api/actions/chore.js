const { appError, CODES } = require('../lib/errors');
const { requireMember } = require('../lib/auth');
const { normalizeChoreInput } = require('../lib/chore-input');
const { resolveBaseKey, computeNextDueAt } = require('../lib/schedule');
const { classify, sortChores } = require('../lib/urgency');
const { todayKey } = require('../lib/date');

const MAX_BATCH_SIZE = 50;

const CHORE_NOT_FOUND_MESSAGE = '这件家务不存在或已被删除';

async function loadOwnChore(repo, familyId, choreId) {
  const chore = await repo.getChore(choreId);
  if (!chore) throw appError(CODES.NOT_FOUND, CHORE_NOT_FOUND_MESSAGE);
  if (chore.familyId !== familyId) {
    // 与「不存在」返回相同 code/message，避免通过错误码探测系统中是否存在该 id。
    // 合法用户只会访问本家庭家务；跨家庭仅见于误配或探测，服务端日志保留诊断信息。
    console.error(
      `loadOwnChore cross-family: choreId=${choreId} ownerFamilyId=${chore.familyId} callerFamilyId=${familyId}`
    );
    throw appError(CODES.NOT_FOUND, CHORE_NOT_FOUND_MESSAGE);
  }
  return chore;
}

// 周期配置是否发生变化。fixedRule 是嵌套对象，用序列化比较足够：
// 它的字段由 normalizeChoreInput 按固定顺序构造，不存在键序不同的同值对象。
function scheduleChanged(before, after) {
  return (
    before.scheduleType !== after.scheduleType ||
    before.intervalDays !== after.intervalDays ||
    JSON.stringify(before.fixedRule || null) !== JSON.stringify(after.fixedRule || null) ||
    (before.initialLastDoneKey || null) !== (after.initialLastDoneKey || null)
  );
}

function buildChoreDoc(input, { familyId, openid, now }) {
  const baseKey = resolveBaseKey({
    lastDoneAt: null,
    initialLastDoneKey: input.initialLastDoneKey,
    createdAt: now,
  });
  return {
    ...input,
    familyId,
    lastDoneAt: null,
    lastDoneBy: null,
    nextDueAt: computeNextDueAt(input, baseKey),
    archived: false,
    createdAt: now,
    createdBy: openid,
  };
}

async function create({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const family = await repo.getFamily(member.familyId);
  const input = normalizeChoreInput(payload, {
    defaultReminderLeadDays: family.settings.defaultReminderLeadDays,
  });
  const chore = await repo.createChore(
    buildChoreDoc(input, { familyId: member.familyId, openid, now: Date.now() })
  );
  return { chore };
}

async function batchCreate({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    throw appError(CODES.INVALID_ARGUMENT, '请至少选择一件家务');
  }
  if (items.length > MAX_BATCH_SIZE) {
    throw appError(CODES.INVALID_ARGUMENT, `一次最多创建 ${MAX_BATCH_SIZE} 件家务`);
  }
  const family = await repo.getFamily(member.familyId);
  const now = Date.now();
  // 先全部校验再统一写入，避免部分成功留下脏数据
  const docs = items.map((item) =>
    buildChoreDoc(
      normalizeChoreInput(item, {
        defaultReminderLeadDays: family.settings.defaultReminderLeadDays,
      }),
      { familyId: member.familyId, openid, now }
    )
  );
  const chores = await repo.createChores(docs);
  return { chores };
}

async function list({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  if (payload.archived !== undefined && typeof payload.archived !== 'boolean') {
    throw appError(CODES.INVALID_ARGUMENT, '归档状态必须是布尔值');
  }
  if (payload.room !== undefined && typeof payload.room !== 'string') {
    throw appError(CODES.INVALID_ARGUMENT, '房间筛选必须是文本');
  }
  const chores = await repo.listChores(member.familyId, {
    archived: payload.archived === undefined ? false : payload.archived,
    room: payload.room || null,
  });
  const today = todayKey();
  return { chores: sortChores(chores, today), todayKey: today };
}

async function get({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);
  return { chore, urgency: classify(chore.nextDueAt, todayKey()) };
}

async function update({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);
  const family = await repo.getFamily(member.familyId);

  const { choreId, ...patch } = payload;
  const mergedInput = {
    name: chore.name,
    icon: chore.icon,
    room: chore.room,
    scheduleType: chore.scheduleType,
    intervalDays: chore.intervalDays,
    fixedRule: chore.fixedRule,
    estimatedMinutes: chore.estimatedMinutes,
    notes: chore.notes,
    reminderLeadDays: chore.reminderLeadDays,
  };
  if (chore.initialLastDoneKey) {
    mergedInput.initialLastDoneKey = chore.initialLastDoneKey;
  }
  const merged = normalizeChoreInput(
    {
      ...mergedInput,
      ...patch,
    },
    { defaultReminderLeadDays: family.settings.defaultReminderLeadDays }
  );

  // 只有周期配置或初始上次完成日真的变了才重算到期日。对从未完成过的家务，
  // 重算基准会依次回落到 initialLastDoneKey、创建日，
  // 若改个名字也重算，到期日就会被悄悄重置成「今天 + 周期」——而从模板库导入、
  // 未填「上次做是什么时候」的家务全部属于这一类。
  let nextDueAt = chore.nextDueAt;
  if (scheduleChanged(chore, merged)) {
    const baseKey = resolveBaseKey({
      lastDoneAt: chore.lastDoneAt,
      initialLastDoneKey: merged.initialLastDoneKey,
      createdAt: chore.createdAt,
    });
    nextDueAt = computeNextDueAt(merged, baseKey);
  }

  const updated = await repo.updateChore(chore._id, { ...merged, nextDueAt });
  return { chore: updated };
}

async function setArchived({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);
  if (typeof payload.archived !== 'boolean') {
    throw appError(CODES.INVALID_ARGUMENT, '归档状态必须是布尔值');
  }
  const updated = await repo.updateChore(chore._id, { archived: payload.archived });
  return { chore: updated };
}

module.exports = {
  'chore.create': create,
  'chore.batchCreate': batchCreate,
  'chore.list': list,
  'chore.get': get,
  'chore.update': update,
  'chore.setArchived': setArchived,
  loadOwnChore,
};
