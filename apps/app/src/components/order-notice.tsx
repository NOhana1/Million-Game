import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';

import { colors, font, hover, useWide } from './ui';

/** Says the order went through, because the trade window closes as soon as it does. */
export function OrderNotice() {
  const { notice, clearNotice } = useGame();
  const wide = useWide();
  if (!notice) return null;

  const seeOrders = () => {
    clearNotice();
    router.push('/portfolio');
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.notice, wide ? styles.wide : styles.phone]}>
      <Text style={styles.text}>{notice}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={seeOrders} {...hover('link')}>
          <Text style={styles.action}>See orders</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={clearNotice} {...hover('link')}>
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.raised,
    borderColor: colors.brand,
    borderRadius: 4,
    borderWidth: 1,
    gap: 8,
    padding: 14,
    position: 'absolute',
  },
  wide: { maxWidth: 400, right: 40, top: 80, width: '100%' },
  phone: { bottom: 68, left: 12, right: 12 },
  text: { color: colors.ink, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 18 },
  action: { color: colors.brand, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  dismiss: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
});
