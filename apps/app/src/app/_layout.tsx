import { Tabs, TabList, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ActivityIndicator, Platform, Pressable, PressableProps, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { HOVER_CSS } from '@/components/hover-css';
import { OrderNotice } from '@/components/order-notice';
import { SignIn } from '@/components/sign-in';
import { TabIcon, TabIconName } from '@/components/tab-icon';
import { colors, font, hover, useWide } from '@/components/ui';
import { Welcome } from '@/components/welcome';
import { Brand, MenuStatus, OfflineNotice, WorldBar } from '@/components/world-bar';
import { GameProvider, useGame } from '@/game/store';

// The web build has one fixed page, so the fonts are added to it here.
if (Platform.OS === 'web') {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href =
    'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;600&family=Heebo:wght@400;500;600&family=Inter:wght@400;500;600&display=swap';
  document.head.appendChild(fonts);

  const looks = document.createElement('style');
  looks.textContent = HOVER_CSS;
  document.head.appendChild(looks);
}

function TabButton({ children, icon, isFocused, ...props }: TabTriggerSlotProps & { icon: TabIconName }) {
  const wide = useWide();
  return (
    <Pressable
      {...(props as PressableProps)}
      {...hover(wide ? 'tab' : 'line')}
      aria-selected={isFocused}
      style={[
        wide ? styles.topTab : styles.tab,
        isFocused && (wide ? styles.tabActive : styles.tabActivePhone),
      ]}>
      {wide ? null : <TabIcon name={icon} color={isFocused ? colors.brand : colors.muted} />}
      <Text
        style={[
          wide ? styles.topTabText : styles.tabText,
          isFocused && (wide ? styles.topTabTextActive : styles.tabTextActive),
        ]}>
        {children}
      </Text>
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
      <Tabs style={[styles.flex, wide && styles.menuOnTop]}>
        <TabSlot style={styles.flex} />
        <TabList style={wide ? styles.topMenu : styles.tabs}>
          {wide ? <Brand /> : null}
          <TabTrigger name="market" href="/" asChild>
            <TabButton icon="market">Market</TabButton>
          </TabTrigger>
          <TabTrigger name="portfolio" href="/portfolio" asChild>
            <TabButton icon="portfolio">Portfolio</TabButton>
          </TabTrigger>
          <TabTrigger name="league" href="/league" asChild>
            <TabButton icon="league">League</TabButton>
          </TabTrigger>
          <TabTrigger name="guide" href="/guide" asChild>
            <TabButton icon="rules">Rules</TabButton>
          </TabTrigger>
          {/* Reached from a link on the League screen, so it needs no button here. */}
          <TabTrigger name="admin" href="/admin" style={styles.hidden} />
          <TabTrigger name="security" href="/security/TAIX" style={styles.hidden} />
          {wide ? <MenuStatus /> : null}
        </TabList>
      </Tabs>
      <OrderNotice />
      <Welcome />
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
  menuOnTop: { flexDirection: 'column-reverse' },
  tabs: {
    backgroundColor: colors.page,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  tab: {
    alignItems: 'center',
    borderTopColor: 'transparent',
    borderTopWidth: 2,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 58,
    paddingVertical: 6,
  },
  topMenu: {
    alignItems: 'stretch',
    backgroundColor: colors.page,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 30,
    justifyContent: 'flex-start',
    minHeight: 64,
    paddingHorizontal: 40,
  },
  topTab: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    borderTopColor: 'transparent',
    borderTopWidth: 2,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  tabActive: { borderBottomColor: colors.brand },
  tabActivePhone: { borderTopColor: colors.brand },
  tabText: { color: colors.muted, fontFamily: font.body, fontSize: 12, fontWeight: '500' },
  tabTextActive: { color: colors.ink, fontWeight: '600' },
  topTabText: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500', letterSpacing: 0.3 },
  topTabTextActive: { color: colors.ink },
  hidden: { display: 'none' },
});
