// Small line icons for badges and the streak, drawn instead of emoji so they match the rest of
// the game. The shapes come from Lucide (lucide.dev), ISC licence, like the security symbols.

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { IconPart } from './security-icons';
import { colors } from './palette';

export const LINE_ICONS = {
  flame: [
    {
      d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    },
  ],
  zap: [
    {
      d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
    },
  ],
  trendingUp: [{ d: 'M22 7 13.5 15.5 8.5 10.5 2 17' }, { d: 'M16 7h6v6' }],
  shield: [
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
    { d: 'm9 12 2 2 4-4' },
  ],
  arrowUp: [{ cx: '12', cy: '12', r: '10' }, { d: 'm16 12-4-4-4 4' }, { d: 'M12 16V8' }],
  medal: [
    { d: 'M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15' },
    { d: 'M11 12 5.12 2.2' },
    { d: 'm13 12 5.88-9.8' },
    { d: 'M8 7h8' },
    { cx: '12', cy: '17', r: '5' },
    { d: 'M12 18v-2h-.5' },
  ],
  trophy: [
    { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' },
    { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' },
    { d: 'M4 22h16' },
    { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' },
    { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' },
    { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' },
  ],
  crown: [
    {
      d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    },
    { d: 'M5 21h14' },
  ],
  cart: [
    { cx: '8', cy: '21', r: '1' },
    { cx: '19', cy: '21', r: '1' },
    { d: 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12' },
  ],
  layers: [
    { d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' },
    { d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' },
    { d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' },
  ],
  globe: [
    { cx: '12', cy: '12', r: '10' },
    { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' },
    { d: 'M2 12h20' },
  ],
  sprout: [
    { d: 'M7 20h10' },
    { d: 'M10 20c5.5-2.5.8-6.4 3-10' },
    { d: 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z' },
    { d: 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z' },
  ],
  calendar: [
    { d: 'M8 2v4' },
    { d: 'M16 2v4' },
    { x: '3', y: '4', width: '18', height: '18', rx: '2' },
    { d: 'M3 10h18' },
    { d: 'm9 16 2 2 4-4' },
  ],
  rocket: [
    { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' },
    { d: 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z' },
    { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' },
    { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' },
  ],
} satisfies Record<string, IconPart[]>;

export type LineIconName = keyof typeof LINE_ICONS;

export function LineIcon({
  name,
  size = 24,
  color = colors.brand,
}: {
  name: LineIconName;
  size?: number;
  color?: string;
}) {
  const parts: IconPart[] = LINE_ICONS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
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
  );
}
