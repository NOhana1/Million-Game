// A player's page: their badge, this week's standing and everything they've achieved so far.
// Only results show here. What someone holds stays private.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, Profile } from '@/api/client';
import { currentToken } from '@/api/session';
import { Avatar } from '@/components/avatar';
import { DivisionBadge } from '@/components/division-badge';
import { Button, changeColor, colors, Eyebrow, font, hover, Page, percent, useWide } from '@/components/ui';
import { choosePhoto } from '@/game/photo';
import { useGame } from '@/game/store';
import { DIVISION_LABEL, ppmToPercent } from '@/game/view';

const NOTHING_YET = '–';
const BOT_SUFFIX = / \(bot\)$/;

/** Your own picture, with buttons to add, change or remove it. Friends see it in the group chat. */
function MyPhoto({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  const [shown, setShown] = useState(photo);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);

  const change = async (work: (token: string) => Promise<string | null | undefined>) => {
    const token = await currentToken();
    if (!token || busy) return;
    setBusy(true);
    setProblem(false);
    try {
      const next = await work(token);
      if (next !== undefined) setShown(next);
    } catch {
      setProblem(true);
    }
    setBusy(false);
  };

  const add = () =>
    change(async (token) => {
      const picked = await choosePhoto();
      if (!picked) return undefined; // cancelled: nothing changes
      await api.setPhoto(token, picked);
      return picked;
    });
  const remove = () =>
    change(async (token) => {
      await api.removePhoto(token);
      return null;
    });

  return (
    <View style={styles.photoBox}>
      <Avatar name={name} photo={shown} size={size} />
      <Pressable accessibilityRole="button" disabled={busy} onPress={add} {...hover('link')}>
        <Text style={styles.photoLink}>{busy ? 'Saving…' : shown ? 'Change photo' : 'Add photo'}</Text>
      </Pressable>
      {shown && !busy ? (
        <Pressable accessibilityRole="button" onPress={remove} {...hover('link')}>
          <Text style={styles.photoRemove}>Remove</Text>
        </Pressable>
      ) : null}
      {problem ? <Text style={styles.photoProblem}>That didn’t save. Try again.</Text> : null}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, signOut } = useGame();
  const wide = useWide();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const uid = id === 'me' ? me?.uid : id;

  useEffect(() => {
    if (!uid) return;
    let current = true;
    setProfile(null);
    setFailed(false);
    api
      .profile(uid)
      .then((result) => current && setProfile(result))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [uid]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/league'));

  if (failed) {
    return (
      <Page maxWidth={640}>
        <Text style={styles.empty}>We can’t find that player.</Text>
        <Button variant="quiet" label="Back to the league" onPress={() => router.replace('/league')} />
      </Page>
    );
  }
  if (!profile) return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const mine = profile.id === me?.uid;
  const { honours, thisWeek } = profile;
  const name = profile.name.replace(BOT_SUFFIX, '');
  const weekReturn = thisWeek ? ppmToPercent(thisWeek.returnPpm) : 0;

  return (
    <Page maxWidth={880}>
      <Pressable accessibilityRole="button" onPress={back} {...hover('link')} style={styles.backBox}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>

      <View style={styles.head}>
        {mine ? (
          <MyPhoto name={name} photo={profile.photo} size={wide ? 104 : 72} />
        ) : (
          <Avatar name={name} photo={profile.photo} size={wide ? 104 : 72} />
        )}
        <View style={styles.flex}>
          <Eyebrow>
            {mine ? 'Your profile' : profile.bot ? 'Computer player' : 'Player'} ·{' '}
            {DIVISION_LABEL[profile.division]} division
          </Eyebrow>
          <Text numberOfLines={2} style={[styles.name, !wide && styles.namePhone]}>
            {name}
          </Text>
        </View>
        <DivisionBadge division={profile.division} size={wide ? 120 : 76} />
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>This week</Text>
        {thisWeek ? (
          <View style={styles.stats}>
            <Stat label="Place" value={`#${thisWeek.rank} of ${thisWeek.total}`} />
            <Stat label="Score" value={thisWeek.score.toFixed(0)} />
            <Stat label="Return" value={percent(weekReturn)} color={changeColor(weekReturn)} />
            <Stat label="Largest fall" value={`${ppmToPercent(thisWeek.maxFallPpm).toFixed(2)}%`} />
          </View>
        ) : (
          <Text style={styles.empty}>
            {mine ? 'Hold a security to join this week’s table.' : 'Not on this week’s table yet.'}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Achievements</Text>
        <View style={styles.stats}>
          <Stat label="Weeks played" value={String(honours.weeksPlayed)} />
          <Stat label="Weeks won" value={String(honours.wins)} />
          <Stat label="Top 3 finishes" value={String(honours.top3)} />
          <Stat label="Best place" value={honours.bestRank ? `#${honours.bestRank}` : NOTHING_YET} />
          <Stat
            label="Best score"
            value={honours.bestScore === null ? NOTHING_YET : honours.bestScore.toFixed(0)}
          />
        </View>
      </View>

      {mine ? (
        <View style={styles.signOut}>
          <Button variant="quiet" label="Sign out" onPress={signOut} />
        </View>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1, gap: 6, minWidth: 0 },
  backBox: { alignSelf: 'flex-start' },
  back: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  head: { alignItems: 'center', flexDirection: 'row', gap: 20 },
  photoBox: { alignItems: 'center', gap: 6 },
  photoLink: { color: colors.brand, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  photoRemove: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  photoProblem: { color: colors.down, fontFamily: font.body, fontSize: 12, maxWidth: 110, textAlign: 'center' },
  name: { color: colors.ink, fontFamily: font.display, fontSize: 60, fontWeight: '400', lineHeight: 70 },
  namePhone: { fontSize: 38, lineHeight: 46 },
  section: { borderTopColor: colors.line, borderTopWidth: 1, gap: 16, paddingTop: 18 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  stats: { columnGap: 24, flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  stat: { flexBasis: 150, flexGrow: 1, gap: 4 },
  statValue: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    lineHeight: 38,
  },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  signOut: { alignSelf: 'flex-start' },
});
