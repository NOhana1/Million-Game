import { Tabs, TabList, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SignIn } from '@/components/sign-in';
import { colors } from '@/components/ui';
import { WorldBar } from '@/components/world-bar';
import { GameProvider, useGame } from '@/game/store';

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...(props as PressableProps)} style={styles.tab}>
      <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{children}</Text>
      <View style={[styles.tabMark, isFocused && styles.tabMarkActive]} />
    </Pressable>
  );
}

function Game() {
  const { status } = useGame();
  if (status === 'loading') return <ActivityIndicator style={styles.flex} color={colors.brand} />;
  if (status !== 'signedIn') return <SignIn />;

  return (
    <View style={styles.column}>
      <WorldBar />
      <Tabs style={styles.flex}>
        <TabSlot style={styles.flex} />
        <TabList style={styles.tabs}>
          <TabTrigger name="market" href="/" asChild>
            <TabButton>Market</TabButton>
          </TabTrigger>
          <TabTrigger name="portfolio" href="/portfolio" asChild>
            <TabButton>Portfolio</TabButton>
          </TabTrigger>
          <TabTrigger name="league" href="/league" asChild>
            <TabButton>League</TabButton>
          </TabTrigger>
          {/* Reached from a link on the League screen, so it needs no button here. */}
          <TabTrigger name="admin" href="/admin" style={styles.hidden} />
        </TabList>
      </Tabs>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <SafeAreaView style={styles.page}>
          <Game />
        </SafeAreaView>
      </GameProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', backgroundColor: colors.page, flex: 1 },
  column: { flex: 1, maxWidth: 720, width: '100%' },
  flex: { flex: 1 },
  tabs: {
    backgroundColor: colors.card,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  tab: { alignItems: 'center', flex: 1, gap: 6, paddingTop: 12 },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.brand },
  tabMark: { backgroundColor: 'transparent', height: 3, width: 40 },
  tabMarkActive: { backgroundColor: colors.brand },
  hidden: { display: 'none' },
});
