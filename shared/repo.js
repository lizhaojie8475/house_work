// repository 层。所有云数据库访问都收敛在这里，
// action 只依赖下面这组方法签名，因此可以用内存假实现做单元测试。
// 修改任何方法签名时必须同步修改 test/fake-repo.js，否则 repo-contract 测试会失败。

const COLLECTIONS = {
  FAMILIES: 'families',
  MEMBERS: 'members',
  CHORES: 'chores',
  LOGS: 'chore_logs',
  REMINDER_SENDS: 'reminder_sends',
};

function createRepo(db, command) {
  const col = (name) => db.collection(name);

  const firstOrNull = (res) => (res.data && res.data.length > 0 ? res.data[0] : null);

  return {
    // families
    async createFamily(doc) {
      const { _id } = await col(COLLECTIONS.FAMILIES).add({ data: doc });
      return { _id, ...doc };
    },
    async getFamily(id) {
      const res = await col(COLLECTIONS.FAMILIES).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },
    async updateFamily(id, patch) {
      await col(COLLECTIONS.FAMILIES).doc(id).update({ data: patch });
      return this.getFamily(id);
    },
    async findFamilyByInviteCode(code) {
      const res = await col(COLLECTIONS.FAMILIES).where({ inviteCode: code }).limit(1).get();
      return firstOrNull(res);
    },
    async deleteFamily(id) {
      const res = await col(COLLECTIONS.FAMILIES).doc(id).remove();
      return Boolean(res.stats && res.stats.removed > 0);
    },
    async listFamiliesByReminderHour(hour) {
      const res = await col(COLLECTIONS.FAMILIES)
        .where({ 'settings.reminderHour': hour })
        .limit(1000)
        .get();
      return res.data;
    },

    // members
    async createMember(doc) {
      const { _id } = await col(COLLECTIONS.MEMBERS).add({ data: doc });
      return { _id, ...doc };
    },
    async findMemberByOpenid(openid) {
      const res = await col(COLLECTIONS.MEMBERS).where({ openid }).limit(1).get();
      return firstOrNull(res);
    },
    async listMembers(familyId) {
      const res = await col(COLLECTIONS.MEMBERS)
        .where({ familyId, active: true })
        .limit(50)
        .get();
      return res.data;
    },
    async updateMember(id, patch) {
      await col(COLLECTIONS.MEMBERS).doc(id).update({ data: patch });
      const res = await col(COLLECTIONS.MEMBERS).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },
    async claimInactiveMember(memberId, patch) {
      // 条件更新：where 带上 active: false，云数据库会回报实际更新的文档数。
      // 为 0 即说明并发请求已抢先认领，这是更新路径上唯一的原子保障。
      // 不可改成 doc(id).update()，那样条件就没了。
      const res = await col(COLLECTIONS.MEMBERS)
        .where({ _id: memberId, active: false })
        .update({ data: patch });
      if (!res.stats || res.stats.updated === 0) return null;
      const found = await col(COLLECTIONS.MEMBERS).where({ _id: memberId }).limit(1).get();
      return firstOrNull(found);
    },

    // chores
    async createChore(doc) {
      const { _id } = await col(COLLECTIONS.CHORES).add({ data: doc });
      return { _id, ...doc };
    },
    async createChores(docs) {
      const results = [];
      for (const doc of docs) {
        results.push(await this.createChore(doc));
      }
      return results;
    },
    async getChore(id) {
      const res = await col(COLLECTIONS.CHORES).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },
    async listChores(familyId, { archived = false, room = null } = {}) {
      const where = { familyId, archived };
      if (room) where.room = room;
      const res = await col(COLLECTIONS.CHORES).where(where).limit(500).get();
      return res.data;
    },
    async updateChore(id, patch) {
      await col(COLLECTIONS.CHORES).doc(id).update({ data: patch });
      return this.getChore(id);
    },
    async listDueChores(familyId, maxDueKey) {
      const res = await col(COLLECTIONS.CHORES)
        .where({ familyId, archived: false, nextDueAt: command.lte(maxDueKey) })
        .limit(500)
        .get();
      return res.data;
    },

    // chore_logs
    async createLog(doc) {
      const { _id } = await col(COLLECTIONS.LOGS).add({ data: doc });
      return { _id, ...doc };
    },
    async listLogs(choreId, { limit = 20, skip = 0 } = {}) {
      const res = await col(COLLECTIONS.LOGS)
        .where({ choreId })
        .orderBy('doneAt', 'desc')
        .skip(skip)
        .limit(limit)
        .get();
      return res.data;
    },
    async listRecentDoneLogs(choreId, limit) {
      const res = await col(COLLECTIONS.LOGS)
        .where({ choreId, type: 'done' })
        .orderBy('doneAt', 'desc')
        .skip(0)
        .limit(limit)
        .get();
      return res.data;
    },
    async deleteLog(id) {
      await col(COLLECTIONS.LOGS).doc(id).remove();
      return true;
    },

    // reminder_sends
    async hasSentReminder(openid, dateKey) {
      const res = await col(COLLECTIONS.REMINDER_SENDS)
        .where({ openid, dateKey })
        .limit(1)
        .get();
      return res.data.length > 0;
    },
    async recordReminderSent(doc) {
      const { _id } = await col(COLLECTIONS.REMINDER_SENDS).add({ data: doc });
      return { _id, ...doc };
    },
  };
}

module.exports = { COLLECTIONS, createRepo };
