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
  page: '#F4F5F2',
  card: '#FFFFFF',
  ink: '#15211D',
  muted: '#5C6863',
  line: '#DFE3DD',
  brand: '#12372E',
  brandSoft: '#E9EEEA',
  deep: '#0F2B24',
  deepSoft: '#25493F',
  onDeep: '#C4D1CA',
  brass: '#C8A558',
  brassInk: '#8A6A1F',
  up: '#0E7A53',
  down: '#B3261E',
  upOnDeep: '#7FD9B0',
  downOnDeep: '#F5A79C',
  warnSoft: '#F7F1E1',
  warnInk: '#5B4712',
};

// Frank Ruhl Libre has Hebrew of its own. Inter doesn't, so Hebrew names fall through to Heebo.
export const font = {
  display: "'Frank Ruhl Libre', Georgia, serif",
  body: 'Inter, Heebo, -apple-system, sans-serif',
};

const WIDE_FROM = 900;
export const useWide = () => useWindowDimensions().width >= WIDE_FROM;

const SECTOR_COLORS: Record<string, string> = {
  Fund: '#12372E',
  Banks: '#2B4C7E',
  Consumer: '#8C4A32',
  Energy: '#8F7228',
  Transport: '#3D6B7C',
  Health: '#7E3F52',
  'Real estate': '#6B5B4B',
  Technology: '#2F6F62',
  Telecom: '#56608F',
  Insurance: '#664E7A',
  Finance: '#3E6B4A',
};

export const sectorColor = (sector: string) => SECTOR_COLORS[sector] ?? colors.deepSoft;

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

export const changeColorOnDeep = (n: number) =>
  n > 0.004 ? colors.upOnDeep : n < -0.004 ? colors.downOnDeep : colors.onDeep;

/** A scrolling screen. */
export function Page({ children, maxWidth = 1120 }: { children: ReactNode; maxWidth?: number }) {
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

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** The colored square that makes a security easy to spot. Its color shows the sector. */
export function Tile({ name, sector, size = 40 }: { name: string; sector: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: sectorColor(sector), borderRadius: 8, height: size, width: size },
      ]}>
      <Text style={[styles.tileText, { fontSize: size * 0.34 }]}>{initials}</Text>
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
      <Text style={[styles.buttonText, { color: solid ? '#FFFFFF' : colors.ink }]}>{label}</Text>
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
  pageColumn: { alignSelf: 'center', gap: 16, width: '100%' },
  pageWide: { paddingHorizontal: 32, paddingVertical: 28 },
  pagePhone: { padding: 16, paddingBottom: 28 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    padding: 20,
  },
  hero: { backgroundColor: colors.deep, borderRadius: 10, padding: 24 },
  pill: {
    borderColor: colors.deepSoft,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillBright: { borderColor: colors.brass },
  pillText: { color: colors.onDeep, fontFamily: font.body, fontSize: 13, fontWeight: '500' },
  pillTextBright: { color: colors.brass },
  sectionTitle: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 22,
    fontWeight: '500',
    marginTop: 8,
  },
  tile: { alignItems: 'center', flexShrink: 0, justifyContent: 'center' },
  tileText: { color: '#FFFFFF', fontFamily: font.body, fontWeight: '600', letterSpacing: 0.5 },
  field: { gap: 6 },
  label: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 16,
    outlineColor: colors.brand,
    padding: 13,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonSolid: { backgroundColor: colors.brand },
  buttonQuiet: { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
  buttonText: { fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  segments: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 16,
  },
  segmentActive: { backgroundColor: colors.deep },
  segmentText: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  segmentTextActive: { color: '#FFFFFF' },
});
