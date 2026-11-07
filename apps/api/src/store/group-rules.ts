// What changes in a group, written once so both stores follow exactly the same rules.

import {
  type ChatMessage,
  type Group,
  type GroupChange,
  type GroupProblem,
  MESSAGE_GAP_MS,
  MOST_MEMBERS,
  MOST_MESSAGES,
  type Player,
} from './types.ts';

const problem = (code: GroupProblem): GroupChange => ({ problem: code });

export function createProblem(player: Player | null) {
  if (!player) return problem('NO_PLAYER');
  return player.groupId ? problem('IN_GROUP') : null;
}

export function joinProblem(player: Player | null, group: Group | null) {
  if (!player) return problem('NO_PLAYER');
  if (player.groupId) return problem('IN_GROUP');
  if (!group) return problem('NO_GROUP');
  return group.members.length >= MOST_MEMBERS ? problem('GROUP_FULL') : null;
}

export const withMember = (group: Group, player: Player, joinedAt: number): Group => ({
  ...group,
  members: [...group.members, { id: player.uid, name: player.name, joinedAt }],
});

/** Null means the group is now empty. */
export function withoutMember(group: Group, uid: string): Group | null {
  const members = group.members.filter((member) => member.id !== uid);
  const next = members[0];
  if (!next) return null;
  return { ...group, members, ownerId: group.ownerId === uid ? next.id : group.ownerId };
}

export function removeProblem(group: Group | null, ownerId: string, memberId: string) {
  if (!group) return problem('NO_GROUP');
  if (group.ownerId !== ownerId) return problem('NOT_OWNER');
  if (memberId === ownerId || !group.members.some((m) => m.id === memberId)) {
    return problem('NOT_MEMBER');
  }
  return null;
}

/** The name comes from the player, so nobody can post as someone else. */
export function withMessage(
  messages: readonly ChatMessage[],
  player: Player,
  message: Omit<ChatMessage, 'uid' | 'name'>,
): ChatMessage[] | GroupChange {
  const last = messages.findLast((m) => m.uid === player.uid);
  if (last && message.at - last.at < MESSAGE_GAP_MS) return problem('TOO_FAST');
  return [...messages, { ...message, uid: player.uid, name: player.name }].slice(-MOST_MESSAGES);
}
