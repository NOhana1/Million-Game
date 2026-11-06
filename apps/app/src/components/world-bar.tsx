import { StyleSheet, Text, View } from 'react-native';

import { useGame, useLiveWorldTime } from '@/game/store';
import { formatWorldTime, marketsText } from '@/game/view';

import { colors, font } from './ui';

export function OfflineNotice() {
  const { offline } = useGame();
  if (!offline) return null;
  return <Text style={styles.offline}>Can’t reach the server. Retrying…</Text>;
}

/** The top of the phone screen. On a computer the sidebar shows this instead. */
export function WorldBar() {
  const { world } = useGame();
  const time = useLiveWorldTime();
  return (
    <View style={styles.bar}>
      <Text style={styles.brand}>Portfolio League</Text>
      {world ? <Text style={styles.time}>{formatWorldTime(time)}</Text> : null}
    </View>
  );
}

export function SidebarStatus() {
  const { world } = useGame();
  const time = useLiveWorldTime();
  if (!world) return null;
  return (
    <View style={styles.status}>
      <Text style={styles.statusTime}>{formatWorldTime(time)}</Text>
      <Text style={styles.statusMarkets}>{marketsText(world)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  brand: { color: colors.brand, fontFamily: font.display, fontSize: 20, fontWeight: '700' },
  time: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  status: { gap: 4, marginTop: 'auto' },
  statusTime: {
    color: '#FFFFFF',
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  statusMarkets: { color: colors.onPlum, fontFamily: font.body, fontSize: 13 },
  offline: {
    backgroundColor: colors.down,
    color: '#FFFFFF',
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: '600',
    padding: 8,
    textAlign: 'center',
  },
});
