// Turns the site into a home-screen app, and tells phone players once how to add it.
// Nothing here changes the game: it's the icon, the full-screen look and a small tip.

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, hover, useWide } from './ui';

const CLOSED_KEY = 'install-tip-closed';

// The page's head gets the app's name, icon and colors. Phones read these when it's added.
if (Platform.OS === 'web') {
  const add = (tag: string, attributes: Record<string, string>) => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    document.head.appendChild(element);
  };
  add('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  add('link', { rel: 'apple-touch-icon', href: '/icons/icon-180.png' });
  add('meta', { name: 'theme-color', content: colors.page });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'League' });
}

type InstallEvent = Event & { prompt(): Promise<void> };

const alreadyApp = () =>
  globalThis.matchMedia?.('(display-mode: standalone)').matches ||
  (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true;

const iPhone = () => /iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent ?? '');

function closedBefore() {
  try {
    return globalThis.localStorage?.getItem(CLOSED_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** Shown on phones only, until it's closed or the game is already on the home screen. */
export function InstallTip() {
  const wide = useWide();
  const [closed, setClosed] = useState(closedBefore);
  // Android's browser offers its own install window, which a button can open.
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const keep = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    globalThis.addEventListener?.('beforeinstallprompt', keep);
    return () => globalThis.removeEventListener?.('beforeinstallprompt', keep);
  }, []);

  if (Platform.OS !== 'web' || wide || closed || alreadyApp() || (!iPhone() && !install)) return null;

  const close = () => {
    try {
      globalThis.localStorage?.setItem(CLOSED_KEY, 'yes');
    } catch {
      // it just shows again next time
    }
    setClosed(true);
  };

  return (
    <View style={styles.tip}>
      <View style={styles.mark} />
      <Text style={styles.text}>
        {install
          ? 'Add Portfolio League to your home screen.'
          : 'Add to your home screen: tap Share, then “Add to Home Screen”.'}
      </Text>
      {install ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => install.prompt().then(close)}
          {...hover('solid')}
          style={styles.button}>
          <Text style={styles.buttonText}>Add</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  mark: { backgroundColor: colors.brand, height: 10, transform: [{ rotate: '45deg' }], width: 10 },
  text: { color: colors.ink, flex: 1, fontFamily: font.body, fontSize: 13 },
  button: { backgroundColor: colors.brand, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 5 },
  buttonText: { color: colors.onBrand, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  close: { color: colors.muted, fontSize: 15, paddingHorizontal: 4 },
});
