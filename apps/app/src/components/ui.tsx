import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const colors = {
  page: '#F4F5F1',
  card: '#FFFFFF',
  ink: '#15211C',
  muted: '#5F6B65',
  line: '#E1E4DD',
  brand: '#0B5D46',
  brandSoft: '#E1EFE9',
  up: '#0A7A55',
  down: '#BF3B2B',
  warnSoft: '#FBF1DC',
  warnInk: '#70500F',
};

export const ils = (n: number) =>
  `₪${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const money = (n: number, currency: '₪' | '$') =>
  `${currency}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const percent = (n: number) => {
  const shown = n.toFixed(2);
  if (Number(shown) === 0) return '0.00%';
  return `${n > 0 ? '+' : ''}${shown}%`;
};

export const changeColor = (n: number) =>
  n > 0.004 ? colors.up : n < -0.004 ? colors.down : colors.muted;

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
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
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
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
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}>
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 20,
  },
  button: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  buttonSolid: { backgroundColor: colors.brand },
  buttonQuiet: { backgroundColor: colors.brandSoft },
  buttonText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  segments: {
    backgroundColor: '#E7EAE3',
    borderRadius: 10,
    flexDirection: 'row',
    padding: 3,
  },
  segment: { alignItems: 'center', borderRadius: 8, flex: 1, paddingVertical: 8 },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: colors.ink },
});
