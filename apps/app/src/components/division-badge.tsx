import type { Division } from '@portfolio-league/engine';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { DIVISION_LABEL } from '@/game/view';

import { colors, font } from './ui';

const asImage = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const trophy = (id: string, [light, mid, dark]: string[]) =>
  asImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/>
</linearGradient></defs>
<path d="M9 7H4.5v2.5A5.5 5.5 0 0 0 10 15M23 7h4.5v2.5A5.5 5.5 0 0 1 22 15" fill="none" stroke="${dark}" stroke-width="2"/>
<path d="M8.5 3.5h15V12a7.5 7.5 0 0 1-15 0z" fill="url(#${id})" stroke="${dark}" stroke-width=".8"/>
<path d="M16 6.2l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z" fill="${dark}" opacity=".55"/>
<rect x="14.4" y="19" width="3.2" height="5" fill="${dark}"/>
<path d="M10 28.5v-1.8a2.7 2.7 0 0 1 2.7-2.7h6.6a2.7 2.7 0 0 1 2.7 2.7v1.8z" fill="url(#${id})" stroke="${dark}" stroke-width=".8"/>
</svg>`);

const DIAMOND = asImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<path d="M9 5h14l6 8-13 15L3 13z" fill="#7FD3EA" stroke="#2C7F9C" stroke-width="1"/>
<path d="M3 13h26L23 5l-3.5 8L16 5l-3.5 8L9 5z" fill="#C9F1FB"/>
<path d="M12.5 13h7L16 28z" fill="#A6E6F5"/>
<path d="M3 13h26M12.5 13L16 28l3.5-15M9 5l3.5 8L16 5l3.5 8L23 5" fill="none" stroke="#2C7F9C" stroke-width=".8"/>
</svg>`);

const BADGES: Record<Division, string> = {
  bronze: trophy('b', ['#EBC29A', '#B4733F', '#6E3F1F']),
  silver: trophy('s', ['#F7F8FA', '#B4BCC8', '#667080']),
  gold: trophy('g', ['#FCEBAE', '#D9AE35', '#8A6510']),
  diamond: DIAMOND,
};

export function DivisionBadge({ division, size = 20 }: { division: Division; size?: number }) {
  return (
    <Image
      accessibilityLabel={`${DIVISION_LABEL[division]} division`}
      contentFit="contain"
      source={{ uri: BADGES[division] }}
      style={{ height: size, width: size }}
    />
  );
}

/** The trophy with its name, for wherever a division is shown in words too. */
export function DivisionTag({
  division,
  onDark,
  size = 20,
}: {
  division: Division;
  onDark?: boolean;
  size?: number;
}) {
  return (
    <View style={styles.tag}>
      <DivisionBadge division={division} size={size} />
      <Text style={[styles.text, onDark && styles.onDark]}>{DIVISION_LABEL[division]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  text: { color: colors.ink, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  onDark: { color: '#FFFFFF' },
});
