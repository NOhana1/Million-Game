// The game's logo: a crowned shield with three rising candles. The same drawing is in
// public/icons/icon.svg, which the app icon, favicon and home-screen icons are made from.

import Svg, { Line, Path, Rect } from 'react-native-svg';

import { colors } from './palette';

const CANDLES = [
  { x: 69, wick: [100, 134], body: [106, 20], color: colors.down },
  { x: 90, wick: [86, 128], body: [93, 28], color: colors.up },
  { x: 111, wick: [74, 118], body: [80, 32], color: colors.up },
];

/** The logo mark with no background. Small sizes get a thicker shield so it stays visible. */
export function LogoMark({ height = 24 }: { height?: number }) {
  const shield = height < 40 ? 9 : 6;
  return (
    <Svg width={(height * 108) / 156} height={height} viewBox="36 12 108 156" accessibilityElementsHidden>
      <Path
        d="M66 46 L66 24 L78 36 L90 18 L102 36 L114 24 L114 46 Z"
        fill={colors.brand}
        stroke={colors.brand}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M90 56 L138 70 L138 110 Q138 144 90 162 Q42 144 42 110 L42 70 Z"
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
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {CANDLES.map((c) => (
        <Rect key={`b${c.x}`} x={c.x - 5} y={c.body[0]} width={10} height={c.body[1]} rx={2} fill={c.color} />
      ))}
    </Svg>
  );
}
