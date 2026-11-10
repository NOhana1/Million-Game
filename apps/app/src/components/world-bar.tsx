import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { signedInEmail } from '@/api/session';
import { Avatar } from '@/components/avatar';
import { useGame, useLiveWorldTime } from '@/game/store';
import { formatWorldTime, marketsText } from '@/game/view';

import { colors, font, hover, useWide } from './ui';

export function OfflineNotice() {
  const { offline } = useGame();
  if (!offline) return null;
  return <Text style={styles.offline}>Can’t reach the server. Retrying…</Text>;
}

/** For a visitor looking around: what they get by joining, and the way in. */
export function GuestBanner() {
  const { guest, join } = useGame();
  const wide = useWide();
  if (!guest) return null;
  // On a phone it's one short line beside the button, so it doesn't take the top of the screen.
  return (
    <View style={[styles.guest, !wide && styles.guestPhone]}>
      <Text style={[styles.guestText, !wide && styles.guestTextPhone]} numberOfLines={wide ? undefined : 1}>
        {wide
          ? 'You’re looking around. Join free to get ₪1,000,000 and play in the weekly league.'
          : 'Get ₪1,000,000 to play with.'}
      </Text>
      <Pressable accessibilityRole="button" onPress={join} {...hover('solid')} style={styles.guestButton}>
        <Text style={styles.guestButtonText}>Join free</Text>
      </Pressable>
    </View>
  );
}

/** Shown to everyone while the trading switch is off. */
export function TradingNotice() {
  const { world } = useGame();
  if (!world?.clock.tradingPaused) return null;
  return (
    <Text style={styles.paused}>
      Trading is paused for a short while. Prices and the table keep going, and your orders are safe.
    </Text>
  );
}

export function Brand() {
  return (
    <View style={styles.brandBox}>
      <View style={styles.mark} />
      <Text style={styles.brand}>Portfolio League</Text>
    </View>
  );
}

const CLOSE_AFTER_MS = 250; // time to move the mouse from the letter onto the menu

/**
 * The player's first letter. Pointing at it with a mouse opens a small menu right beside it:
 * who you're signed in as, your profile, and Sign out. On a phone the first tap opens the menu.
 * Clicking the letter while the menu is open goes to your profile, as it always did.
 */
function ProfileButton() {
  const { me, myPhoto, signOut } = useGame();
  const [open, setOpen] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const box = useRef<unknown>(null); // the menu's element on the web, to tell clicks outside it

  const show = () => {
    clearTimeout(closing.current);
    setOpen(true);
  };
  const hideSoon = () => {
    clearTimeout(closing.current);
    closing.current = setTimeout(() => setOpen(false), CLOSE_AFTER_MS);
  };
  // Only a mouse opens it by pointing: a finger's tap also "points", and would then open the profile.
  const byMouse = (event: { nativeEvent: { pointerType?: string } }) => event.nativeEvent.pointerType === 'mouse';

  // A click or tap anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const away = (event: PointerEvent) => {
      const node = box.current as HTMLElement | null;
      if (node && !node.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(closing.current), []);

  if (!me) return null;
  const email = signedInEmail();
  const go = (path: '/profile/me') => {
    setOpen(false);
    router.push(path);
  };

  return (
    <View
      ref={box as never}
      style={styles.profileBox}
      onPointerEnter={(event) => byMouse(event) && show()}
      onPointerLeave={(event) => byMouse(event) && hideSoon()}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your account"
        aria-expanded={open}
        onPress={() => (open ? go('/profile/me') : show())}
        {...hover('lift')}
        style={styles.profile}>
        <Avatar name={me.name} photo={myPhoto} size={32} />
      </Pressable>
      {open ? (
        <View style={styles.menuHolder}>
          <View accessibilityRole="menu" style={styles.menu}>
            <View style={styles.menuWho}>
              <Text style={styles.menuName} numberOfLines={1}>
                {me.name}
              </Text>
              {email ? (
                <Text style={styles.menuEmail} numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="menuitem" onPress={() => go('/profile/me')} {...hover('row')} style={styles.menuItem}>
              <Text style={styles.menuText}>My profile</Text>
            </Pressable>
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setOpen(false);
                void signOut();
              }}
              {...hover('row')}
              style={styles.menuItem}>
              <Text style={[styles.menuText, styles.menuSignOut]}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The top of the phone screen. On a computer the top menu shows this instead. */
export function WorldBar() {
  const { world } = useGame();
  const time = useLiveWorldTime();
  return (
    <View style={styles.bar}>
      <Brand />
      <View style={styles.barRight}>
        {world ? <Text style={styles.time}>{formatWorldTime(time)}</Text> : null}
        <ProfileButton />
      </View>
    </View>
  );
}

export function MenuStatus() {
  const { world } = useGame();
  const time = useLiveWorldTime();
  if (!world) return null;
  return (
    <View style={styles.statusBox}>
      <View style={styles.status}>
        <Text style={styles.statusTime}>{formatWorldTime(time)}</Text>
        <Text style={styles.statusMarkets}>{marketsText(world)}</Text>
      </View>
      <ProfileButton />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.page,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  brandBox: { alignItems: 'center', flexDirection: 'row', gap: 10, marginRight: 20 },
  mark: { backgroundColor: colors.brass, height: 11, transform: [{ rotate: '45deg' }], width: 11 },
  brand: { color: colors.ink, fontFamily: font.display, fontSize: 21, fontWeight: '500' },
  time: {
    color: colors.onDeep,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  barRight: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  statusBox: { alignItems: 'center', flexDirection: 'row', gap: 16, marginLeft: 'auto' },
  status: { alignItems: 'flex-end', gap: 2, justifyContent: 'center' },
  profile: { borderRadius: 16 },
  profileBox: { position: 'relative', zIndex: 20 },
  // The padding bridges the gap to the letter, so the mouse never leaves on its way down.
  menuHolder: { paddingTop: 8, position: 'absolute', right: 0, top: '100%', zIndex: 20 },
  menu: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
    minWidth: 220,
    maxWidth: 280,
    paddingVertical: 6,
  },
  menuWho: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: 2,
    marginBottom: 4,
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  menuName: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  menuEmail: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 9 },
  menuText: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  menuSignOut: { color: colors.down },
  statusTime: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  statusMarkets: { color: colors.onDeep, fontFamily: font.body, fontSize: 12 },
  guest: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  guestPhone: { flexWrap: 'nowrap', justifyContent: 'space-between', paddingVertical: 6 },
  guestText: { color: colors.ink, flexShrink: 1, fontFamily: font.body, fontSize: 13 },
  guestTextPhone: { flex: 1 },
  guestButton: { backgroundColor: colors.brand, borderRadius: 3, paddingHorizontal: 14, paddingVertical: 6 },
  guestButtonText: { color: colors.onBrand, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  paused: {
    backgroundColor: colors.warnSoft,
    color: colors.warnInk,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: '600',
    padding: 8,
    textAlign: 'center',
  },
  offline: {
    backgroundColor: colors.down,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: '600',
    padding: 8,
    textAlign: 'center',
  },
});
