// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。
// 源文件：shared/repo.js
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

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;

function createRepo(db, command) {
  const col = (name) => db.collection(name);

  const firstOrNull = (res) => (res.data && res.data.length > 0 ? res.data[0] : null);

  const listAll = async (collectionName, filter, methodName) => {
    const results = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await col(collectionName)
        .where(filter)
        .orderBy('_id', 'asc')
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get();
      results.push(...res.data);
      if (res.data.length < PAGE_SIZE) return results;
    }

    console.error(`[repo-pagination] ${methodName} reached page cap; returning partial results`, {
      filter,
      pageSize: PAGE_SIZE,
      maxPages: MAX_PAGES,
    });
    return results;
  };

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
      const filter = { 'settings.reminderHour': hour };
      return listAll(COLLECTIONS.FAMILIES, filter, 'listFamiliesByReminderHour');
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
      const filter = { familyId, active: true };
      return listAll(COLLECTIONS.MEMBERS, filter, 'listMembers');
    },
    async updateMember(id, patch) {
      await col(COLLECTIONS.MEMBERS).doc(id).update({ data: patch });
      const res = await col(COLLECTIONS.MEMBERS).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },
    async incrementSubscribeQuota(id, delta) {
      await col(COLLECTIONS.MEMBERS).doc(id).update({
        data: { subscribeQuota: command.inc(delta) },
      });
      const res = await col(COLLECTIONS.MEMBERS).where({ _id: id }).limit(1).get();
      const member = firstOrNull(res);
      return member ? member.subscribeQuota : null;
    },
    async clampSubscribeQuota(id, max) {
      await col(COLLECTIONS.MEMBERS)
        .where({ _id: id, subscribeQuota: command.gt(max) })
        .update({ data: { subscribeQuota: max } });
      const res = await col(COLLECTIONS.MEMBERS).where({ _id: id }).limit(1).get();
      const member = firstOrNull(res);
      return member ? member.subscribeQuota : null;
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
      return listAll(COLLECTIONS.CHORES, where, 'listChores');
    },
    async updateChore(id, patch) {
      await col(COLLECTIONS.CHORES).doc(id).update({ data: patch });
      return this.getChore(id);
    },
    async listDueChores(familyId, maxDueKey) {
      const filter = { familyId, archived: false, nextDueAt: command.lte(maxDueKey) };
      return listAll(COLLECTIONS.CHORES, filter, 'listDueChores');
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
        .orderBy('_id', 'desc')
        .skip(skip)
        .limit(limit)
        .get();
      return res.data;
    },
    async listRecentDoneLogs(choreId, limit) {
      const res = await col(COLLECTIONS.LOGS)
        .where({ choreId, type: 'done' })
        .orderBy('doneAt', 'desc')
        .orderBy('_id', 'desc')
        .skip(0)
        .limit(limit)
        .get();
      return res.data;
    },
    async deleteLog(id) {
      const res = await col(COLLECTIONS.LOGS).doc(id).remove();
      return Boolean(res.stats && res.stats.removed > 0);
    },

    // reminder_sends
    // 原子 recordReminderSent 认领已取代预检查；保留此方法供兼容和诊断使用。
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
    async deleteReminderSend(openid, dateKey) {
      const res = await col(COLLECTIONS.REMINDER_SENDS).where({ openid, dateKey }).remove();
      return Boolean(res.stats && res.stats.removed > 0);
    },
  };
}

module.exports = { COLLECTIONS, createRepo };
