import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiProblem, ChatMessage, GroupMember } from '@/api/client';
import { currentToken } from '@/api/session';
import { useGame } from '@/game/store';

import { Avatar } from './avatar';
import { Button, colors, font, hover } from './ui';

// Refreshes only while this screen is open: each refresh is a database read.
const REFRESH_MS = 8_000;
const PHOTOS_REFRESH_MS = 120_000;
const MOST_LETTERS = 300;
const AVATAR = 32;
// Turning by the golden angle keeps every new color far from all the ones before it.
const GOLDEN_ANGLE = 137.508;
const FIRST_HUE = 200;
const MY_BUBBLE = 'rgba(217, 181, 106, 0.26)'; // the gold accent, faded

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Each friend's own color, in the order they joined, so no two in the group share one. */
function friendColors(members: GroupMember[], myId: string) {
  const friends = members.filter((m) => m.id !== myId).sort((a, b) => a.joinedAt - b.joinedAt);
  return new Map(
    friends.map((friend, index) => {
      const hue = Math.round((FIRST_HUE + index * GOLDEN_ANGLE) % 360);
      return [friend.id, { name: `hsl(${hue}, 70%, 72%)`, bubble: `hsla(${hue}, 60%, 55%, 0.24)` }];
    }),
  );
}

// Someone who has left the group keeps a plain gray.
const PAST_MEMBER = { name: colors.muted, bubble: colors.raised };

export function GroupChat({ myId, members, height }: { myId: string; members: GroupMember[]; height: number }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<{ scrollToEnd(options: { animated: boolean }): void } | null>(null);

  const load = useCallback(async () => {
    const token = await currentToken();
    if (!token) return;
    const chat = await api.chat(token).catch(() => null);
    if (chat) setMessages(chat.messages);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  // Friends' photos change rarely, so they're fetched when the chat opens, when someone joins or
  // leaves, and every two minutes. Your own photo comes from the app, so your changes show at once.
  const { myPhoto } = useGame();
  const memberIds = members.map((m) => m.id).join(',');
  useFocusEffect(
    useCallback(() => {
      const loadPhotos = async () => {
        const token = await currentToken();
        if (!token) return;
        const found = await api.groupPhotos(token).catch(() => null);
        if (found) setPhotos(found);
      };
      loadPhotos();
      const timer = setInterval(loadPhotos, PHOTOS_REFRESH_MS);
      return () => clearInterval(timer);
    }, [memberIds]),
  );
  const photoOf = (uid: string) => (uid === myId ? myPhoto : photos[uid]);

  const last = messages?.at(-1)?.id;
  useEffect(() => {
    list.current?.scrollToEnd({ animated: false });
  }, [last]);

  const send = async () => {
    const trimmed = text.trim();
    const token = await currentToken();
    if (!trimmed || !token || sending) return;
    setSending(true);
    setProblem(null);
    try {
      await api.sendMessage(token, trimmed);
      setText('');
      await load();
    } catch (error) {
      setProblem(
        error instanceof ApiProblem && error.code === 'TOO_FAST'
          ? 'Slow down a little, then send again.'
          : 'That didn’t send. Please try again.',
      );
    }
    setSending(false);
  };

  const colorOf = friendColors(members, myId);
  // Tapping a picture or a name opens that player's page.
  const openProfile = (uid: string) => router.push(uid === myId ? '/profile/me' : `/profile/${uid}`);

  return (
    <View style={styles.box}>
      <ScrollView ref={list as never} style={{ height }} contentContainerStyle={styles.list}>
        {messages === null ? null : messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet. Say hello to your group.</Text>
        ) : (
          messages.map((message, index) => {
            const mine = message.uid === myId;
            // Like WhatsApp: the name and picture show once at the start of each run of messages.
            const first = messages[index - 1]?.uid !== message.uid;
            const color = colorOf.get(message.uid) ?? PAST_MEMBER;
            return (
              <View key={message.id} style={[styles.row, mine && styles.mineRow, first && styles.runStart]}>
                {first ? (
                  <Pressable
                    accessibilityLabel={`Open ${message.name}'s profile`}
                    accessibilityRole="link"
                    onPress={() => openProfile(message.uid)}
                    {...hover('deep')}>
                    <Avatar
                      name={message.name}
                      photo={photoOf(message.uid)}
                      size={AVATAR}
                      color={mine ? colors.brand : color.name}
                    />
                  </Pressable>
                ) : (
                  <View style={styles.avatarSpace} />
                )}
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: mine ? MY_BUBBLE : color.bubble },
                    first && (mine ? styles.mineCorner : styles.theirCorner),
                  ]}>
                  {first && !mine ? (
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => openProfile(message.uid)}
                      style={styles.nameLink}
                      {...hover('deep')}>
                      <Text style={[styles.name, { color: color.name }]} numberOfLines={1}>
                        {message.name}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.text}>{message.text}</Text>
                  <Text style={styles.time}>{clock.format(message.at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      <View style={styles.write}>
        <TextInput
          accessibilityLabel="Write a message"
          maxLength={MOST_LETTERS}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="Write a message"
          placeholderTextColor={colors.faint}
          style={styles.input}
          value={text}
        />
        <Button label="Send" onPress={send} disabled={sending || text.trim() === ''} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderColor: colors.line, borderRadius: 4, borderWidth: 1 },
  list: { gap: 3, padding: 12 },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, maxWidth: '86%' },
  mineRow: { alignSelf: 'flex-end', flexDirection: 'row-reverse' }, // your picture on the right
  runStart: { marginTop: 9 },
  avatarSpace: { width: AVATAR },
  bubble: { borderRadius: 14, flexShrink: 1, gap: 2, paddingHorizontal: 12, paddingVertical: 7 },
  theirCorner: { borderTopLeftRadius: 4 },
  mineCorner: { borderTopRightRadius: 4 },
  nameLink: { alignSelf: 'flex-start', maxWidth: '100%' },
  name: { fontFamily: font.body, fontSize: 14, fontWeight: '700' },
  text: { color: colors.ink, fontFamily: font.body, fontSize: 15, lineHeight: 21 },
  time: { alignSelf: 'flex-end', color: colors.faint, fontFamily: font.body, fontSize: 11 },
  problem: { color: colors.down, fontFamily: font.body, fontSize: 13, paddingHorizontal: 16 },
  write: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  input: {
    backgroundColor: colors.page,
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontFamily: font.body,
    fontSize: 15,
    minHeight: 48,
    minWidth: 0,
    outlineColor: colors.brand,
    paddingHorizontal: 12,
  },
});
