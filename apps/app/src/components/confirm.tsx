// A small pop-up that asks before something that can't be undone, like leaving a group.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, colors, font } from './ui';

export function Confirm({
  title,
  text,
  yes,
  no = 'Cancel',
  busy,
  onYes,
  onNo,
}: {
  title: string;
  text: string;
  yes: string;
  no?: string;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onNo}>
      <Pressable accessibilityLabel={no} style={styles.backdrop} onPress={onNo} />
      <View style={styles.holder} pointerEvents="box-none">
        <View accessibilityRole="alert" style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>
          <Button label={yes} onPress={onYes} disabled={busy} />
          <Button variant="quiet" label={no} onPress={onNo} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(3, 6, 5, 0.74)' },
  holder: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 16 },
  box: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 6,
    borderWidth: 1,
    gap: 12,
    maxWidth: 400,
    padding: 20,
    width: '100%',
  },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '500' },
  text: { color: colors.muted, fontFamily: font.body, fontSize: 14, lineHeight: 20, marginBottom: 4 },
});
