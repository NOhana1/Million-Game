import { Tabs, TabList, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ActivityIndicator, Platform, Pressable, PressableProps, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SignIn } from '@/components/sign-in';
import { colors, font, useWide } from '@/components/ui';
import { OfflineNotice, SidebarStatus, WorldBar } from '@/components/world-bar';
import { GameProvider, useGame } from '@/game/store';

// The web build has one fixed page, so the fonts are added to it here. Both also cover Hebrew.
if (Platform.OS === 'web') {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href =
    'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Rubik:wght@400;500;600;700&display=swap';
  document.head.appendChild(fonts);
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const wide = useWide();
  return (
    <Pressable
      {...(props as PressableProps)}
      style={[wide ? styles.sideTab : styles.tab, isFocused && styles.tabActive]}>
      <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{children}</Text>
    </Pressable>
  );
}

function Game() {
  const { status } = useGame();
  const wide = useWide();
  if (status === 'loading') return <ActivityIndicator style={styles.flex} color={colors.brand} />;
  if (status !== 'signedIn') return <SignIn />;

  return (
    <View style={styles.flex}>
      <OfflineNotice />
      {wide ? null : <WorldBar />}
      <Tabs style={[styles.flex, wide && styles.sideBySide]}>
        <TabSlot style={styles.flex} />
        <TabList style={wide ? styles.sidebar : styles.tabs}>
          {wide ? <Text style={styles.brand}>Portfolio League</Text> : null}
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
          {wide ? <SidebarStatus /> : null}
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
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1 },
  sideBySide: { flexDirection: 'row-reverse' },
  tabs: {
    backgroundColor: colors.plum,
    borderRadius: 22,
    bottom: 14,
    flexDirection: 'row',
    left: 16,
    padding: 6,
    position: 'absolute',
    right: 16,
  },
  tab: { alignItems: 'center', borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 48 },
  sidebar: {
    alignItems: 'stretch',
    backgroundColor: colors.plum,
    flexDirection: 'column',
    gap: 6,
    justifyContent: 'flex-start',
    padding: 20,
    width: 240,
  },
  sideTab: { borderRadius: 14, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  tabActive: { backgroundColor: colors.sun },
  tabText: { color: colors.onPlum, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: colors.ink },
  brand: {
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  hidden: { display: 'none' },
});
