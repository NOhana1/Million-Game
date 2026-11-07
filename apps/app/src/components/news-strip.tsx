import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, News } from '@/api/client';

import { colors, font, hover } from './ui';

const REFRESH_MS = 5 * 60 * 1000;
const moving = { dataSet: { news: 'true' } } as object;

/** Real headlines passing under the prices. It stays out of the way if there's no news. */
export function NewsStrip() {
  const [news, setNews] = useState<News | null>(null);

  useEffect(() => {
    const load = () => api.news().then(setNews).catch(() => undefined);
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!news || news.headlines.length === 0) return null;

  const items = (copy: string) =>
    news.headlines.map(({ title, link }) => (
      <Pressable
        key={copy + link}
        accessibilityRole="link"
        onPress={() => Linking.openURL(link)}
        {...hover('link')}
        style={styles.item}>
        <Text style={styles.mark}>◆</Text>
        <Text style={styles.title}>{title}</Text>
      </Pressable>
    ));

  return (
    <View style={styles.strip}>
      <View style={styles.label}>
        <Text style={styles.labelText}>Real world</Text>
        <Text style={styles.source}>{news.source}</Text>
      </View>
      <View style={styles.window}>
        <View {...moving} style={styles.run}>
          {items('a')}
          {items('b')}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    alignItems: 'stretch',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  label: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRightColor: colors.line,
    borderRightWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    paddingHorizontal: 14,
  },
  labelText: {
    color: colors.brand,
    fontFamily: font.body,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  source: { color: colors.faint, fontFamily: font.body, fontSize: 11 },
  window: { flex: 1, overflow: 'hidden' },
  run: { flexDirection: 'row', width: 'max-content' as unknown as number },
  item: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  mark: { color: colors.brand, fontSize: 7 },
  title: { color: colors.onDeep, fontFamily: font.body, fontSize: 12.5, whiteSpace: 'nowrap' } as object,
});
