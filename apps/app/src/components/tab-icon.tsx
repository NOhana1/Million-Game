import Svg, { Path } from 'react-native-svg';

export type TabIconName = 'market' | 'portfolio' | 'league' | 'rules';

const PATHS: Record<TabIconName, string[]> = {
  market: ['M3 20h18', 'M4 15l5-5 4 4 7-8', 'M15 6h5v5'],
  portfolio: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.5A6 6 0 0 1 20.5 9H15z'],
  league: [
    'M8 4h8v6a4 4 0 0 1-8 0z',
    'M8 6H4v1a4 4 0 0 0 4 4',
    'M16 6h4v1a4 4 0 0 1-4 4',
    'M12 14v4',
    'M8 20h8',
  ],
  rules: ['M12 6c-2-1.5-5-2-8-2v15c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z', 'M12 6v15'],
};

export function TabIcon({ name, color }: { name: TabIconName; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
