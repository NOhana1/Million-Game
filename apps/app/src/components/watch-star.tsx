import { Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useGame } from '@/game/store';

import { colors, hover } from './ui';

const STAR = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'; // from Lucide, ISC licence

/** Adds a security to the player's watchlist, or takes it off. */
export function WatchStar({ id, name, size = 20 }: { id: string; name: string; size?: number }) {
  const { me, toggleWatch } = useGame();
  const watching = me?.watchlist?.includes(id) ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${watching ? 'Stop watching' : 'Watch'} ${name}`}
      aria-selected={watching}
      hitSlop={8}
      onPress={() => toggleWatch(id)}
      {...hover('link')}
      style={styles.star}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d={STAR}
          fill={watching ? colors.brand : 'none'}
          stroke={watching ? colors.brand : colors.faint}
          strokeLinejoin="round"
          strokeWidth={1.7}
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({ star: { alignItems: 'center', justifyContent: 'center', padding: 4 } });
