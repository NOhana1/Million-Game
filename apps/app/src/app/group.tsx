// A player's group: start one, join one with a code, see how everyone is doing and talk.
// Only results show here. What a member holds stays private.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiProblem, GroupMember, MyGroup } from '@/api/client';
import { currentToken } from '@/api/session';
import { DivisionBadge } from '@/components/division-badge';
import { GroupChat } from '@/components/group-chat';
import {
  Button,
  Card,
  changeColor,
  colors,
  Eyebrow,
  Field,
  font,
  hover,
  Page,
  percent,
  useWide,
} from '@/components/ui';
import { useGame } from '@/game/store';
import { ppmToPercent } from '@/game/view';

const REFRESH_MS = 30_000;
const MOST_MEMBERS = 20;
const COPIED_MS = 2_000;
const NOT_RANKED = '–';

const problemText = (error: unknown) =>
  error instanceof ApiProblem && error.status !== 400
    ? error.message
    : 'That didn’t work. Check it and try again.';

function NoGroup({ onChanged }: { onChanged: () => Promise<void> }) {
  const wide = useWide();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (work: (token: string) => Promise<unknown>) => {
    const token = await currentToken();
    if (!token) return;
    setSending(true);
    setProblem(null);
    try {
      await work(token);
      await onChanged();
    } catch (error) {
      setProblem(problemText(error));
      setSending(false);
    }
  };

  return (
    <Page maxWidth={880}>
      <View style={styles.intro}>
        <Eyebrow>Groups</Eyebrow>
        <Text style={[styles.title, !wide && styles.titlePhone]}>Compete with your friends</Text>
        <Text style={styles.lead}>
          Start a group or join one with a code. See how everyone is doing this week, and talk in
          your own chat.
        </Text>
      </View>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <View style={[styles.choices, wide && styles.choicesWide]}>
        <Card style={styles.choice}>
          <Text style={styles.section}>Start a group</Text>
          <Field
            label="Group name"
            maxLength={30}
            onChangeText={setName}
            placeholder="For example, The Bulls"
            value={name}
          />
          <Button
            label="Create group"
            onPress={() => run((token) => api.createGroup(token, name.trim()))}
            disabled={sending || name.trim().length < 3}
          />
        </Card>
        <Card style={styles.choice}>
          <Text style={styles.section}>Join a group</Text>
          <Field
            label="Invite code"
            autoCapitalize="characters"
            maxLength={6}
            onChangeText={setCode}
            placeholder="6 letters and numbers"
            value={code}
          />
          <Button
            variant="quiet"
            label="Join group"
            onPress={() => run((token) => api.joinGroup(token, code.trim()))}
            disabled={sending || code.trim().length !== 6}
          />
        </Card>
      </View>
    </Page>
  );
}

function MemberRow({
  member,
  place,
  isMe,
  canRemove,
  ownerView,
  onRemove,
}: {
  member: GroupMember;
  place: number;
  isMe: boolean;
  canRemove: boolean;
  ownerView: boolean;
  onRemove: () => void;
}) {
  const [sure, setSure] = useState(false);
  const change = member.returnPpm === null ? 0 : ppmToPercent(member.returnPpm);
  return (
    <View {...hover('row')} style={[styles.member, isMe && styles.me]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${member.name}`}
        onPress={() => router.push(`/profile/${member.id}`)}
        style={styles.memberLink}>
        <Text style={styles.place}>{place}</Text>
        <DivisionBadge division={member.division} size={26} />
        <View style={styles.flex}>
          <Text style={styles.memberName} numberOfLines={1}>
            {member.name}
            {isMe ? ' (you)' : ''}
          </Text>
          <Text style={styles.meta}>
            {member.owner ? 'Owner · ' : ''}
            {member.rank ? `#${member.rank} overall` : 'Not on the table yet'}
          </Text>
        </View>
        <Text style={[styles.return, { color: changeColor(change) }]}>
          {member.returnPpm === null ? NOT_RANKED : percent(change)}
        </Text>
        <Text style={styles.score}>{member.score === null ? NOT_RANKED : member.score.toFixed(0)}</Text>
      </Pressable>
      {canRemove ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => (sure ? onRemove() : setSure(true))}
          {...hover('link')}>
          <Text style={[styles.remove, sure && styles.removeSure]}>{sure ? 'Sure?' : 'Remove'}</Text>
        </Pressable>
      ) : ownerView ? (
        <View style={styles.removeSpace} />
      ) : null}
    </View>
  );
}

function GroupPage({ group, onChanged }: { group: MyGroup; onChanged: () => Promise<void> }) {
  const { me } = useGame();
  const wide = useWide();
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const owner = group.members.find((m) => m.owner)?.id === me?.uid;

  const copy = async () => {
    await globalThis.navigator?.clipboard?.writeText(group.code).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };

  const act = async (work: (token: string) => Promise<unknown>) => {
    const token = await currentToken();
    if (!token) return;
    await work(token).catch(() => undefined);
    await onChanged();
  };

  return (
    <Page>
      <View style={[styles.head, wide && styles.headWide]}>
        <View style={styles.flex}>
          <Eyebrow>
            Your group · {group.members.length} of {MOST_MEMBERS} members
          </Eyebrow>
          <Text numberOfLines={2} style={[styles.title, !wide && styles.titlePhone]}>
            {group.name}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy invite code ${group.code}`}
          onPress={copy}
          {...hover('lift')}
          style={styles.code}>
          <Eyebrow>{copied ? 'Copied' : 'Invite code'}</Eyebrow>
          <Text style={styles.codeText}>{group.code}</Text>
        </Pressable>
      </View>

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={[styles.column, wide && styles.columnMembers]}>
          <View style={styles.tableHead}>
            <Text style={styles.heading}>This week</Text>
            <Text style={[styles.meta, styles.return]}>Return</Text>
            <Text style={[styles.meta, styles.scoreHead]}>Score</Text>
            {owner ? <View style={styles.removeSpace} /> : null}
          </View>
          <View style={styles.table}>
            {group.members.map((member, index) => (
              <MemberRow
                key={member.id}
                member={member}
                place={index + 1}
                isMe={member.id === me?.uid}
                canRemove={owner && member.id !== me?.uid}
                ownerView={owner}
                onRemove={() => act((token) => api.removeMember(token, member.id))}
              />
            ))}
          </View>
        </View>
        <View style={[styles.column, wide && styles.columnChat]}>
          <Text style={styles.heading}>Chat</Text>
          {me ? <GroupChat myId={me.uid} height={wide ? 420 : 320} /> : null}
        </View>
      </View>

      <View style={styles.leave}>
        <Button
          variant="quiet"
          label={leaving ? 'Yes, leave this group' : 'Leave group'}
          onPress={() => (leaving ? act((token) => api.leaveGroup(token)) : setLeaving(true))}
        />
      </View>
    </Page>
  );
}

export default function GroupScreen() {
  const [group, setGroup] = useState<MyGroup | null | undefined>(undefined);

  const load = useCallback(async () => {
    const token = await currentToken();
    if (!token) return;
    const answer = await api.group(token).catch(() => null);
    if (answer) setGroup(answer.group);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  if (group === undefined) return <ActivityIndicator style={styles.page} color={colors.brand} />;
  return group ? <GroupPage group={group} onChanged={load} /> : <NoGroup onChanged={load} />;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1, gap: 2, minWidth: 0 },
  intro: { gap: 8, maxWidth: 620 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 56, fontWeight: '400', lineHeight: 66 },
  titlePhone: { fontSize: 36, lineHeight: 44 },
  lead: { color: colors.onDeep, fontFamily: font.body, fontSize: 17, lineHeight: 26 },
  problem: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  choices: { gap: 14 },
  choicesWide: { flexDirection: 'row' },
  choice: { flex: 1, gap: 14 },
  section: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  head: { gap: 14 },
  headWide: { alignItems: 'flex-end', flexDirection: 'row' },
  code: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  codeText: {
    color: colors.brand,
    fontFamily: font.display,
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    letterSpacing: 3,
  },
  columns: { gap: 24 },
  columnsWide: { alignItems: 'flex-start', flexDirection: 'row', gap: 32 },
  column: { gap: 10, width: '100%' },
  columnMembers: { flex: 1.25, minWidth: 0, width: 'auto' as unknown as number },
  columnChat: { flex: 1, minWidth: 0, width: 'auto' as unknown as number },
  heading: { color: colors.ink, flex: 1, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  tableHead: { alignItems: 'flex-end', flexDirection: 'row', gap: 10, paddingHorizontal: 8 },
  table: { borderTopColor: colors.line, borderTopWidth: 1 },
  member: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 8,
  },
  memberLink: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minHeight: 60, minWidth: 0 },
  me: { backgroundColor: colors.raised },
  place: { color: colors.brand, fontFamily: font.display, fontSize: 20, textAlign: 'center', width: 22 },
  memberName: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500' },
  meta: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  return: {
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minWidth: 68,
    textAlign: 'right',
  },
  score: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
  scoreHead: { minWidth: 36, textAlign: 'right' },
  remove: { color: colors.faint, fontFamily: font.body, fontSize: 12, fontWeight: '500', minWidth: 46, textAlign: 'right' },
  removeSpace: { width: 46 },
  removeSure: { color: colors.down },
  leave: { alignSelf: 'flex-start', marginTop: 8 },
});
