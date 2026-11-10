// Editing your own account, on your profile: your name, and the email you sign in with.
// A new name shows everywhere at once (your group, the table) and in the league after the next
// market open or close. A new email only takes effect once its owner clicks the link we send it.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiProblem } from '@/api/client';
import { changeEmail, emailTaken, signedInEmail, signInProblem, usesAccounts } from '@/api/session';
import { useGame } from '@/game/store';

import { Button, Card, colors, Field, font, PasswordField } from './ui';

export function AccountEditor({ onRenamed, onClose }: { onRenamed: () => void; onClose: () => void }) {
  const { me, rename } = useGame();
  const [name, setName] = useState(me?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameNote, setNameNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null);

  const current = signedInEmail();
  const sameName = name.trim() === me?.name;

  const saveName = async () => {
    if (sameName || name.trim().length < 2 || savingName) return;
    setSavingName(true);
    setNameNote(null);
    try {
      await rename(name.trim());
      setNameNote({ ok: true, text: 'Saved. Your group and the table show it now.' });
      onRenamed();
    } catch (error) {
      setNameNote({
        ok: false,
        text:
          error instanceof ApiProblem && error.status === 409
            ? error.message
            : error instanceof ApiProblem && error.status === 400
              ? 'Use 2 to 24 letters, numbers or spaces.'
              : 'Couldn’t save the name. Please try again.',
      });
    }
    setSavingName(false);
  };

  const sendLink = async () => {
    const wanted = email.trim();
    if (!wanted || !password || sendingLink) return;
    if (wanted.toLowerCase() === current?.toLowerCase()) {
      setEmailNote({ ok: false, text: 'That’s already your email.' });
      return;
    }
    setSendingLink(true);
    setEmailNote(null);
    try {
      await changeEmail(wanted, password);
      setPassword('');
      setEmailNote({
        ok: true,
        text: `We sent a link to ${wanted}. Your email changes when you click it. Then sign in again with the new email.`,
      });
    } catch (error) {
      setEmailNote({
        ok: false,
        text: emailTaken(error) ? 'That email already has an account.' : signInProblem(error),
      });
    }
    setSendingLink(false);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.part}>
        <Text style={styles.title}>Your name</Text>
        <Text style={styles.hint}>Everyone sees it on the table and in your group. It has to be your own.</Text>
        <Field
          label="Name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameNote(null);
          }}
          onSubmitEditing={saveName}
          maxLength={24}
          autoCorrect={false}
        />
        <Button label={savingName ? 'Saving…' : 'Save name'} onPress={saveName} disabled={savingName || sameName || name.trim().length < 2} />
        {nameNote ? <Text style={nameNote.ok ? styles.ok : styles.error}>{nameNote.text}</Text> : null}
      </View>

      {usesAccounts ? (
        <View style={[styles.part, styles.divided]}>
          <Text style={styles.title}>Your email</Text>
          <Text style={styles.hint}>
            {current ? `You sign in with ${current}. ` : ''}To move to a new email, enter it and your password.
            We’ll send a link there to make sure it’s yours.
          </Text>
          <Field
            label="New email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setEmailNote(null);
            }}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            inputMode="email"
          />
          <PasswordField
            label="Your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setEmailNote(null);
            }}
            onSubmitEditing={sendLink}
            autoComplete="current-password"
          />
          <Button
            label={sendingLink ? 'Sending…' : 'Send the link'}
            onPress={sendLink}
            disabled={sendingLink || !email.trim() || !password}
          />
          {emailNote ? <Text style={emailNote.ok ? styles.ok : styles.error}>{emailNote.text}</Text> : null}
        </View>
      ) : null}

      <Button variant="quiet" label="Done" onPress={onClose} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18 },
  part: { gap: 10 },
  divided: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 18 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '500' },
  hint: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  ok: { color: colors.up, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
