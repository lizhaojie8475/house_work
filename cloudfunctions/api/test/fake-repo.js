// repository 的内存实现，供 action 单元测试使用。
// 方法签名必须与 shared/repo.js（Task 11）严格一致。
let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}${seq}`;
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
      const created = { _id: nextId('r'), ...doc };
      state.reminderSends.push(created);
      return clone(created);
    },
  };
}

module.exports = { createFakeRepo };
