import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, ApiProblem, ChatMessage } from '@/api/client';
import { currentToken } from '@/api/session';

import { Button, colors, font } from './ui';

// Refreshes only while this screen is open: each refresh is a database read.
const REFRESH_MS = 8_000;
const MOST_LETTERS = 300;

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function GroupChat({ myId, height }: { myId: string; height: number }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
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

  return (
    <View style={styles.box}>
      <ScrollView ref={list as never} style={{ height }} contentContainerStyle={styles.list}>
        {messages === null ? null : messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet. Say hello to your group.</Text>
        ) : (
          messages.map((message) => {
            const mine = message.uid === myId;
            return (
              <View key={message.id} style={[styles.message, mine && styles.mine]}>
                <Text style={styles.meta}>
                  <Text style={styles.name}>{mine ? 'You' : message.name}</Text>
                  {'  '}
                  {clock.format(message.at)}
                </Text>
                <Text style={styles.text}>{message.text}</Text>
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
  list: { gap: 12, padding: 16 },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 14 },
  message: { alignSelf: 'flex-start', gap: 2, maxWidth: '86%' },
  mine: { alignItems: 'flex-end', alignSelf: 'flex-end' },
  meta: { color: colors.faint, fontFamily: font.body, fontSize: 11 },
  name: { color: colors.brand, fontWeight: '600' },
  text: { color: colors.ink, fontFamily: font.body, fontSize: 15, lineHeight: 21 },
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
