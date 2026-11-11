// The game's logo: a shield with three rising candles. The same drawing is in
// public/icons/icon.svg, which the app icon, favicon and home-screen icons are made from.

import Svg, { Line, Path, Rect } from 'react-native-svg';

import { colors } from './palette';

const CANDLES = [
  { x: 69, wick: [96, 130], body: [102, 20], color: colors.down },
  { x: 90, wick: [82, 124], body: [89, 28], color: colors.up },
  { x: 111, wick: [70, 114], body: [76, 32], color: colors.up },
];

/** The logo mark with no background. Small sizes get a thicker shield so it stays visible. */
export function LogoMark({ height = 24 }: { height?: number }) {
  const shield = height < 40 ? 9 : 7;
  return (
    <Svg width={(height * 108) / 118} height={height} viewBox="36 44 108 118" accessibilityElementsHidden>
      <Path
        d="M90 50 L138 64 L138 104 Q138 138 90 156 Q42 138 42 104 L42 64 Z"
        fill="none"
        stroke={colors.brand}
        strokeWidth={shield}
        strokeLinejoin="round"
      />
      {CANDLES.map((c) => (
        <Line
          key={`w${c.x}`}
          x1={c.x}
          y1={c.wick[0]}
          x2={c.x}
          y2={c.wick[1]}
          stroke={c.color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}
      {CANDLES.map((c) => (
        <Rect key={`b${c.x}`} x={c.x - 5} y={c.body[0]} width={10} height={c.body[1]} rx={2} fill={c.color} />
      ))}
    </Svg>
  );
}
