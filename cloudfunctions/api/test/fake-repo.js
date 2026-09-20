// repository 的内存实现，供 action 单元测试使用。
// 方法签名必须与 shared/repo.js（Task 11）严格一致。
let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}${seq}`;
}

function duplicateKeyError(index, value) {
  const err = new Error(`duplicate key error: ${index}=${value}`);
  err.errCode = -502001;
  return err;
}

function createFakeRepo(seed = {}) {
  const state = {
    families: [...(seed.families || [])],
    members: [...(seed.members || [])],
    chores: [...(seed.chores || [])],
    logs: [...(seed.logs || [])],
    reminderSends: [...(seed.reminderSends || [])],
  };

  const clone = (doc) => (doc ? JSON.parse(JSON.stringify(doc)) : doc);
  const patchDoc = (doc, patch) => Object.assign(doc, patch);
  const createChore = async (doc) => {
    const created = { _id: nextId('c'), ...doc };
    state.chores.push(created);
    return clone(created);
  };

  return {
    _state: state,

    // families
    async createFamily(doc) {
      if (state.families.some((family) => family.inviteCode === doc.inviteCode)) {
        throw duplicateKeyError('families.inviteCode', doc.inviteCode);
      }
      const created = { _id: nextId('f'), ...doc };
      state.families.push(created);
      return clone(created);
    },
    async getFamily(id) {
      return clone(state.families.find((f) => f._id === id) || null);
    },
    async updateFamily(id, patch) {
      const doc = state.families.find((f) => f._id === id);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },
    async deleteFamily(id) {
      const idx = state.families.findIndex((f) => f._id === id);
      if (idx === -1) return false;
      state.families.splice(idx, 1);
      return true;
    },
    async findFamilyByInviteCode(code) {
      return clone(state.families.find((f) => f.inviteCode === code) || null);
    },
    async listFamiliesByReminderHour(hour) {
      return state.families
        .filter((f) => f.settings && f.settings.reminderHour === hour)
        .map(clone);
    },

    // members
    async createMember(doc) {
      if (state.members.some((member) => member.openid === doc.openid)) {
        throw duplicateKeyError('members.openid', doc.openid);
      }
      const created = { _id: nextId('m'), ...doc };
      state.members.push(created);
      return clone(created);
    },
    async findMemberByOpenid(openid) {
      return clone(state.members.find((m) => m.openid === openid) || null);
    },
    async listMembers(familyId) {
      return state.members
        .filter((m) => m.familyId === familyId && m.active)
        .map(clone);
    },
    async updateMember(id, patch) {
      const doc = state.members.find((m) => m._id === id);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },
    // 模拟 CloudBase where({ _id, active: false }).update() 的原子条件更新语义。
    // 真实实现必须保留 where 上的 active: false 条件并据实际更新文档数判断成败，
    // 绝不可退化为无条件的 doc(id).update()——唯一索引只约束插入，
    // 复用已退出成员记录走的是更新，这里是该路径上唯一的原子保障。
    async claimInactiveMember(id, patch) {
      const doc = state.members.find((m) => m._id === id && m.active === false);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },

    // chores
    createChore,
    async createChores(docs) {
      return Promise.all(docs.map(createChore));
    },
    async getChore(id) {
      return clone(state.chores.find((c) => c._id === id) || null);
    },
    async listChores(familyId, { archived = false, room = null } = {}) {
      return state.chores
        .filter((c) => c.familyId === familyId)
        .filter((c) => Boolean(c.archived) === archived)
        .filter((c) => (room ? c.room === room : true))
        .map(clone);
    },
    async updateChore(id, patch) {
      const doc = state.chores.find((c) => c._id === id);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },
    async listDueChores(familyId, maxDueKey) {
      return state.chores
        .filter((c) => c.familyId === familyId && !c.archived && c.nextDueAt <= maxDueKey)
        .map(clone);
    },

    // chore_logs
    async createLog(doc) {
      const created = { _id: nextId('l'), ...doc };
      state.logs.push(created);
      return clone(created);
    },
    async listLogs(choreId, { limit = 20, skip = 0 } = {}) {
      return state.logs
        .filter((l) => l.choreId === choreId)
        .sort((a, b) => b.doneAt - a.doneAt)
        .slice(skip, skip + limit)
        .map(clone);
    },
    async listRecentDoneLogs(choreId, limit) {
      return state.logs
        .filter((l) => l.choreId === choreId && l.type === 'done')
        .sort((a, b) => b.doneAt - a.doneAt)
        .slice(0, limit)
        .map(clone);
    },
    async deleteLog(id) {
      const idx = state.logs.findIndex((l) => l._id === id);
      if (idx === -1) return false;
      state.logs.splice(idx, 1);
      return true;
    },

    // reminder_sends
    async hasSentReminder(openid, dateKey) {
      return state.reminderSends.some((r) => r.openid === openid && r.dateKey === dateKey);
    },
    async recordReminderSent(doc) {
      if (
        state.reminderSends.some(
          (reminder) => reminder.openid === doc.openid && reminder.dateKey === doc.dateKey
        )
      ) {
        throw duplicateKeyError(
          'reminder_sends.openid_dateKey',
          `${doc.openid}:${doc.dateKey}`
        );
      }
      const created = { _id: nextId('r'), ...doc };
      state.reminderSends.push(created);
      return clone(created);
    },
    async deleteReminderSend(openid, dateKey) {
      const idx = state.reminderSends.findIndex(
        (reminder) => reminder.openid === openid && reminder.dateKey === dateKey
      );
      if (idx === -1) return false;
      state.reminderSends.splice(idx, 1);
      return true;
    },
  };
}

module.exports = { createFakeRepo };
