import type { Division } from '@portfolio-league/engine';
import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

export const colors = {
  page: '#F4F1FB',
  card: '#FFFFFF',
  ink: '#21163A',
  muted: '#5B5170',
  line: '#E6E0F3',
  brand: '#4B2BD6',
  brandSoft: '#EDE8FF',
  plum: '#21163A',
  plumSoft: '#3A2B5C',
  onPlum: '#D9D0F2',
  sun: '#FFD84D',
  up: '#0B7A6F',
  down: '#C2261C',
  upOnPlum: '#7CE8CF',
  downOnPlum: '#FFA99C',
  warnSoft: '#FFF4CC',
  warnInk: '#5E4700',
};

export const font = { display: 'Fredoka, Rubik, sans-serif', body: 'Rubik, sans-serif' };

const WIDE_FROM = 900;
export const useWide = () => useWindowDimensions().width >= WIDE_FROM;

const SECTOR_TILES: Record<string, { back: string; ink: string }> = {
  Fund: { back: '#4B2BD6', ink: '#FFFFFF' },
  Banks: { back: '#0B7A6F', ink: '#FFFFFF' },
  Consumer: { back: '#FF7A45', ink: '#21163A' },
  Energy: { back: '#FFD84D', ink: '#21163A' },
  Transport: { back: '#1E7FC2', ink: '#FFFFFF' },
  Health: { back: '#D6336C', ink: '#FFFFFF' },
  'Real estate': { back: '#8A5A3C', ink: '#FFFFFF' },
  Technology: { back: '#19B5A5', ink: '#21163A' },
  Telecom: { back: '#8FA6FF', ink: '#21163A' },
  Insurance: { back: '#A23BB5', ink: '#FFFFFF' },
  Finance: { back: '#2F8F46', ink: '#FFFFFF' },
};
const OTHER_TILE = { back: colors.plumSoft, ink: '#FFFFFF' };

export const sectorColor = (sector: string) => (SECTOR_TILES[sector] ?? OTHER_TILE).back;

export const ils = (n: number) =>
  `₪${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const money = (n: number, currency: '₪' | '$') =>
  `${currency}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The arrow means the direction doesn't rely on color alone. */
export const percent = (n: number) => {
  const shown = Math.abs(n).toFixed(2);
  if (Number(shown) === 0) return '0.00%';
  return `${n > 0 ? '▲' : '▼'} ${shown}%`;
};

export const changeColor = (n: number) =>
  n > 0.004 ? colors.up : n < -0.004 ? colors.down : colors.muted;

export const changeColorOnPlum = (n: number) =>
  n > 0.004 ? colors.upOnPlum : n < -0.004 ? colors.downOnPlum : colors.onPlum;

/** A scrolling screen. The phone's floating menu needs room below the last item. */
export function Page({ children, maxWidth = 1040 }: { children: ReactNode; maxWidth?: number }) {
  const wide = useWide();
  return (
    <ScrollView style={styles.page}>
      <View style={[styles.pageColumn, { maxWidth }, wide ? styles.pageWide : styles.pagePhone]}>
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Hero({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.hero, style]}>{children}</View>;
}

export function Pill({ label, bright }: { label: string; bright?: boolean }) {
  return (
    <View style={[styles.pill, bright && styles.pillBright]}>
      <Text style={[styles.pillText, bright && styles.pillTextBright]}>{label}</Text>
    </View>
  );
}

const DIVISION_COLORS: Record<Division, string> = {
  bronze: '#E0A06B',
  silver: '#CBD3E0',
  gold: colors.sun,
  diamond: '#8FE3F7',
};

export function DivisionTag({ division, label }: { division: Division; label: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: DIVISION_COLORS[division] }]}>
      <Text style={[styles.pillText, styles.pillTextBright]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** The colored square that makes a security easy to spot. Its color shows the sector. */
export function Tile({ name, sector, size = 44 }: { name: string; sector: string; size?: number }) {
  const { back, ink } = SECTOR_TILES[sector] ?? OTHER_TILE;
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: back, borderRadius: size * 0.32, height: size, width: size },
      ]}>
      <Text style={[styles.tileText, { color: ink, fontSize: size * 0.39 }]}>{initials}</Text>
    </View>
  );
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...input}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  variant = 'solid',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'quiet';
}) {
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        solid ? styles.buttonSolid : styles.buttonQuiet,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, { color: solid ? '#FFFFFF' : colors.brand }]}>{label}</Text>
    </Pressable>
  );
}

export function Segments<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segments}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive, disabled && styles.disabled]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  pageColumn: { alignSelf: 'center', gap: 12, width: '100%' },
  pageWide: { padding: 28 },
  pagePhone: { padding: 16, paddingBottom: 96 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 16 },
  hero: { backgroundColor: colors.plum, borderRadius: 24, padding: 18 },
  pill: {
    backgroundColor: colors.plumSoft,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillBright: { backgroundColor: colors.sun },
  pillText: { color: '#FFFFFF', fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  pillTextBright: { color: colors.ink },
  sectionTitle: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  tile: { alignItems: 'center', flexShrink: 0, justifyContent: 'center' },
  tileText: { fontFamily: font.display, fontWeight: '700' },
  field: { gap: 6 },
  label: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: colors.page,
    borderRadius: 14,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 16,
    outlineColor: colors.brand,
    padding: 14,
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  buttonSolid: { backgroundColor: colors.brand },
  buttonQuiet: { backgroundColor: colors.brandSoft },
  buttonText: { fontFamily: font.body, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: 99,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 18,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: '#FFFFFF' },
});
