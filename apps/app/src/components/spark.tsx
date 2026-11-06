import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { changeColor } from '@/components/ui';

/** A small price line with no numbers, for lists. It keeps its space while it loads. */
export function Spark({
  prices,
  width = 96,
  height = 30,
  color,
}: {
  prices?: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!prices || prices.length < 2) return <View style={{ height, width }} />;
  const low = Math.min(...prices);
  const spread = Math.max(...prices) - low || 1;
  const points = prices
    .map((price, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = 2 + (1 - (price - low) / spread) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const line = color ?? changeColor((prices.at(-1) ?? 0) - (prices[0] ?? 0));
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={line} strokeLinejoin="round" strokeWidth={1.4} />
    </Svg>
  );
}
