const { appError, CODES } = require('../lib/errors');
const { requireMember, requireOwner } = require('../lib/auth');
const {
  INVITE_CODE_TTL_MS,
  generateInviteCode,
  isInviteCodeValid,
} = require('../lib/invite');

const DEFAULT_FAMILY_NAME = '我的家';
const ALLOWED_REMINDER_HOURS = [7, 8, 20];
const DEFAULT_SETTINGS = { reminderHour: 8, defaultReminderLeadDays: 1 };
const MAX_INVITE_CODE_ATTEMPTS = 5;

async function freshInvite(repo, now, random, currentCode = null) {
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt += 1) {
    const inviteCode = generateInviteCode(random);
    if (inviteCode === currentCode) continue;

    const collision = await repo.findFamilyByInviteCode(inviteCode);
    if (!collision) {
      return {
        inviteCode,
        inviteCodeExpireAt: now + INVITE_CODE_TTL_MS,
      };
    }
  }

  throw appError(CODES.INTERNAL, '邀请码生成失败，请稍后重试');
}

async function createOrGet({ openid, payload, repo, random }) {
  const existing = await repo.findMemberByOpenid(openid);
  if (existing && existing.active) {
    const family = await repo.getFamily(existing.familyId);
    const members = await repo.listMembers(existing.familyId);
    return { family, member: existing, members };
  }

  const now = Date.now();
  const invite = await freshInvite(repo, now, random);
  const family = await repo.createFamily({
    name: payload.name || DEFAULT_FAMILY_NAME,
    ownerOpenid: openid,
    ...invite,
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
  });
  const member = existing
    ? await repo.updateMember(existing._id, {
        familyId: family._id,
        role: 'owner',
        active: true,
        joinedAt: now,
      })
    : await repo.createMember({
        familyId: family._id,
        openid,
        nickname: payload.nickname || '我',
        avatarUrl: payload.avatarUrl || '',
        role: 'owner',
        subscribeQuota: 0,
        joinedAt: now,
        active: true,
      });
  return { family, member, members: [member] };
}

async function join({ openid, payload, repo }) {
  const code = String(payload.inviteCode || '').trim().toUpperCase();
  if (!code) {
    throw appError(CODES.INVALID_ARGUMENT, '请输入邀请码');
  }

  const existing = await repo.findMemberByOpenid(openid);
  if (existing && existing.active) {
    throw appError(CODES.CONFLICT, '你已经在一个家庭中了');
  }

  const family = await repo.findFamilyByInviteCode(code);
  if (!family) {
    throw appError(CODES.NOT_FOUND, '邀请码不存在或已被重新生成');
  }
  if (!isInviteCodeValid(family, Date.now())) {
    throw appError(CODES.INVALID_ARGUMENT, '邀请码已过期，请让家人重新生成');
  }

  const now = Date.now();
  const member = existing
    ? await repo.updateMember(existing._id, {
        familyId: family._id,
        role: 'member',
        active: true,
        joinedAt: now,
      })
    : await repo.createMember({
        familyId: family._id,
        openid,
        nickname: payload.nickname || '家人',
        avatarUrl: payload.avatarUrl || '',
        role: 'member',
        subscribeQuota: 0,
        joinedAt: now,
        active: true,
      });
  return { family, member };
}

async function refreshInviteCode({ openid, repo, random }) {
  const member = await requireOwner(repo, openid);
  const family = await repo.getFamily(member.familyId);
  const invite = await freshInvite(repo, Date.now(), random, family.inviteCode);
  await repo.updateFamily(member.familyId, invite);
  return invite;
}

async function listMembers({ openid, repo }) {
  const member = await requireMember(repo, openid);
  const members = await repo.listMembers(member.familyId);
  return { members };
}

async function updateSettings({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const family = await repo.getFamily(member.familyId);
  const settings = { ...DEFAULT_SETTINGS, ...(family.settings || {}) };

  if (payload.reminderHour !== undefined) {
    if (!ALLOWED_REMINDER_HOURS.includes(payload.reminderHour)) {
      throw appError(CODES.INVALID_ARGUMENT, '提醒时段只能选择 7 点、8 点或 20 点');
    }
    settings.reminderHour = payload.reminderHour;
  }
  if (payload.defaultReminderLeadDays !== undefined) {
    const days = payload.defaultReminderLeadDays;
    if (!Number.isInteger(days) || days < 0 || days > 30) {
      throw appError(CODES.INVALID_ARGUMENT, '提前提醒天数需为 0 到 30 之间的整数');
    }
    settings.defaultReminderLeadDays = days;
  }

  await repo.updateFamily(member.familyId, { settings });
  return { settings };
}

module.exports = {
  'family.createOrGet': createOrGet,
  'family.join': join,
  'family.refreshInviteCode': refreshInviteCode,
  'family.listMembers': listMembers,
  'family.updateSettings': updateSettings,
  DEFAULT_SETTINGS,
  ALLOWED_REMINDER_HOURS,
};
