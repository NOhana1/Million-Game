import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, font } from './ui';

/** A round picture, or the first letter of the name when there's no picture. */
export function Avatar({
  name,
  photo,
  size = 36,
  color = colors.brand,
}: {
  name: string;
  photo?: string | null;
  size?: number;
  color?: string;
}) {
  const round = { borderRadius: size / 2, height: size, width: size };
  if (photo) return <Image accessibilityLabel={name} source={{ uri: photo }} style={[round, styles.photo]} />;
  return (
    <View style={[round, styles.letterBox, { borderColor: color }]}>
      <Text style={[styles.letter, { color, fontSize: Math.round(size * 0.42) }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.raised },
  letterBox: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderWidth: 1,
    justifyContent: 'center',
  },
  letter: { fontFamily: font.body, fontWeight: '600' },
});
