import { ReactNode, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from './palette';
import { SECURITY_ICONS } from './security-icons';

export { colors };

/** Gives an element a look from hover-css.ts. Ignored outside the web. */
export const hover = (kind: string) => ({ dataSet: { hover: kind } }) as object;

const riseIn = { dataSet: { rise: 'true' } } as object;

// Frank Ruhl Libre has Hebrew of its own. Inter doesn't, so Hebrew names fall through to Heebo.
export const font = {
  display: "'Frank Ruhl Libre', Georgia, serif",
  body: 'Inter, Heebo, -apple-system, sans-serif',
};

const WIDE_FROM = 900;
export const useWide = () => useWindowDimensions().width >= WIDE_FROM;

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

/** A scrolling screen. Its sections rise into place one after another. */
export function Page({ children, maxWidth = 1160 }: { children: ReactNode; maxWidth?: number }) {
  const wide = useWide();
  return (
    <ScrollView style={styles.page}>
      <View
        {...riseIn}
        style={[styles.pageColumn, { maxWidth }, wide ? styles.pageWide : styles.pagePhone]}>
        {children}
      </View>
    </ScrollView>
  );
}

/** A panel, or with `ruled` a section that only has a line above it, like a page in a paper. */
export function Card({
  children,
  style,
  ruled,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  ruled?: boolean;
}) {
  return <View style={[ruled ? styles.ruled : styles.card, style]}>{children}</View>;
}

/** The small spaced capitals above a heading or a number. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
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

/** A security's letters, with its symbol as a small gold seal on the corner. */
export function Tile({
  id,
  name,
  size = 40,
}: {
  id: string;
  name: string;
  sector?: string;
  size?: number;
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  const seal = Math.round(size * 0.52);
  const parts = SECURITY_ICONS[id] ?? [];
  return (
    <View style={[styles.tile, { height: size, width: size }]}>
      <Text style={[styles.tileText, { fontSize: size * 0.36 }]}>{initials}</Text>
      {parts.length > 0 ? (
        <View style={[styles.seal, { borderRadius: seal / 2, height: seal, width: seal }]}>
          <Svg
            width={seal * 0.68}
            height={seal * 0.68}
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.onBrand}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round">
            {parts.map((part, index) =>
              'd' in part ? (
                <Path key={index} d={part.d} />
              ) : 'r' in part ? (
                <Circle key={index} {...part} />
              ) : (
                <Rect key={index} {...part} />
              ),
            )}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

/** A password box with an eye button that shows or hides what was typed. */
export function PasswordField({ label, ...input }: Omit<TextInputProps, 'secureTextEntry'> & { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.passwordInput]}
          secureTextEntry={!visible}
          {...input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((shown) => !shown)}
          hitSlop={8}
          style={styles.eye}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={1.8}>
            <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
            <Circle cx={12} cy={12} r={3} />
            {visible ? <Path d="M4 4l16 16" strokeLinecap="round" /> : null}
          </Svg>
        </Pressable>
      </View>
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
      {...hover(solid ? 'solid' : 'quiet')}
      style={({ pressed }) => [
        styles.button,
        solid ? styles.buttonSolid : styles.buttonQuiet,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, { color: solid ? colors.onBrand : colors.ink }]}>{label}</Text>
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
            aria-selected={active}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            {...hover('segment')}
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
  pageColumn: { alignSelf: 'center', gap: 28, width: '100%' },
  pageWide: { paddingHorizontal: 40, paddingVertical: 36 },
  pagePhone: { gap: 22, padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    padding: 22,
  },
  ruled: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 18 },
  hero: { paddingBottom: 4 },
  eyebrow: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  pill: {
    borderColor: colors.deepSoft,
    borderRadius: 3,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillBright: { borderColor: colors.brand },
  pillText: { color: colors.onDeep, fontFamily: font.body, fontSize: 12, fontWeight: '500' },
  pillTextBright: { color: colors.brand },
  sectionTitle: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 24,
    fontWeight: '500',
    marginTop: 4,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
  },
  tileText: { color: colors.ink, fontFamily: font.display, fontWeight: '500' },
  seal: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderColor: colors.page,
    borderWidth: 1.5,
    bottom: -6,
    justifyContent: 'center',
    position: 'absolute',
    right: -6,
  },
  field: { gap: 6 },
  label: { color: colors.onDeep, fontFamily: font.body, fontSize: 13, fontWeight: '500' },
  input: {
    backgroundColor: colors.page,
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 16,
    outlineColor: colors.brand,
    padding: 13,
  },
  passwordInput: { paddingRight: 48 },
  eye: { alignItems: 'center', bottom: 0, justifyContent: 'center', position: 'absolute', right: 0, top: 0, width: 46 },
  button: {
    alignItems: 'center',
    borderRadius: 3,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 22,
  },
  buttonSolid: { backgroundColor: colors.brand },
  buttonQuiet: { backgroundColor: 'transparent', borderColor: colors.deepSoft, borderWidth: 1 },
  buttonText: { fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  segments: { alignSelf: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  segment: {
    alignItems: 'center',
    borderRadius: 3,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  segmentTextActive: { color: colors.onBrand, fontWeight: '600' },
});
