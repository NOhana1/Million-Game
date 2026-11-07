// Frames a profile picture: drag it to move it, and zoom in or out. The circle shows
// exactly what friends will see.

import { useEffect, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { clampCrop, MOST_ZOOM, PhotoCrop, placement } from '@/game/photo';

import { Button, colors, font, hover } from './ui';

const FRAME = 240;
const ZOOM_STEP = 0.25;

export function PhotoEditor({
  original,
  start,
  busy,
  onSave,
  onCancel,
}: {
  original: string;
  start: PhotoCrop;
  busy: boolean;
  onSave: (crop: PhotoCrop) => void;
  onCancel: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState(start);
  // The drag handlers are made once, so they read the latest values from here.
  const now = useRef({ crop, size, grabbed: crop });
  now.current.crop = crop;
  now.current.size = size;

  useEffect(() => {
    Image.getSize(original, (width, height) => {
      setSize({ width, height });
      setCrop((current) => clampCrop(current, width, height));
    });
  }, [original]);

  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        now.current.grabbed = now.current.crop;
      },
      onPanResponderMove: (_, gesture) => {
        const { grabbed, size: known } = now.current;
        if (!known) return;
        const moved = { ...grabbed, x: grabbed.x + gesture.dx / FRAME, y: grabbed.y + gesture.dy / FRAME };
        setCrop(clampCrop(moved, known.width, known.height));
      },
    }),
  ).current;

  const zoomBy = (step: number) => {
    if (size) setCrop(clampCrop({ ...crop, zoom: crop.zoom + step }, size.width, size.height));
  };

  const at = size ? placement(crop, size.width, size.height, FRAME) : null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Edit your photo</Text>
          <Text style={styles.hint}>Drag to move it. Use − and + to zoom.</Text>

          <View style={styles.frame} {...drag.panHandlers}>
            {at ? (
              <Image
                pointerEvents="none"
                source={{ uri: original }}
                style={{ position: 'absolute', left: at.left, top: at.top, width: at.width, height: at.height }}
              />
            ) : null}
          </View>

          <View style={styles.zoom}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              disabled={crop.zoom <= 1}
              onPress={() => zoomBy(-ZOOM_STEP)}
              {...hover('lift')}
              style={[styles.zoomButton, crop.zoom <= 1 && styles.off]}>
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${((crop.zoom - 1) / (MOST_ZOOM - 1)) * 100}%` }]} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              disabled={crop.zoom >= MOST_ZOOM}
              onPress={() => zoomBy(ZOOM_STEP)}
              {...hover('lift')}
              style={[styles.zoomButton, crop.zoom >= MOST_ZOOM && styles.off]}>
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Button variant="quiet" label="Cancel" onPress={onCancel} disabled={busy} />
            <Button label={busy ? 'Saving…' : 'Save photo'} onPress={() => onSave(crop)} disabled={busy || !size} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 6,
    borderWidth: 1,
    gap: 14,
    maxWidth: 360,
    padding: 24,
    width: '100%',
  },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  hint: { color: colors.muted, fontFamily: font.body, fontSize: 13, textAlign: 'center' },
  frame: {
    backgroundColor: colors.raised,
    borderColor: colors.brand,
    borderRadius: FRAME / 2,
    borderWidth: 2,
    cursor: 'grab',
    height: FRAME,
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
    width: FRAME,
  } as object,
  zoom: { alignItems: 'center', flexDirection: 'row', gap: 12, width: FRAME },
  zoomButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  off: { opacity: 0.4 },
  zoomText: { color: colors.ink, fontFamily: font.body, fontSize: 22, lineHeight: 24 },
  track: { backgroundColor: colors.line, borderRadius: 2, flex: 1, height: 4, overflow: 'hidden' },
  fill: { backgroundColor: colors.brand, height: 4 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
});
