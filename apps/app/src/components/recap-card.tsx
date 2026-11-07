import { StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';
import { findRow, marketMoves, ppmToPercent, recapFor, toShekels } from '@/game/view';

import { Card, changeColor, colors, font, ils, percent, useWide } from './ui';

const MAX_FILLS = 3;

function Move({ label, ppm }: { label: string; ppm: number }) {
  const value = ppmToPercent(ppm);
  return (
    <Text style={styles.move}>
      {label} <Text style={[styles.strong, { color: changeColor(value) }]}>{percent(value)}</Text>
    </Text>
  );
}

function Extreme({ label, name, ppm }: { label: string; name: string; ppm: number }) {
  const value = ppmToPercent(ppm);
  return (
    <Text style={styles.line}>
      {label}: {name} <Text style={[styles.strong, { color: changeColor(value) }]}>{percent(value)}</Text>
    </Text>
  );
}

export function RecapCard() {
  const { me, market, orders } = useGame();
  const wide = useWide();
  if (!me || !market) return null;

  const recap = recapFor(me, market, orders);
  const name = (id: string) => findRow(market, id)?.name ?? id;
  const held = me.positions.length > 0;
  const change = toShekels(recap.change);
  const changePct = ppmToPercent(recap.changePpm);

  return (
    <Card ruled style={[styles.card, wide && styles.wide]}>
      <Text style={styles.title}>Your last day</Text>
      {held ? (
        <Text style={[styles.total, { color: changeColor(changePct) }]}>
          {change < 0 ? '-' : '+'}
          {ils(Math.abs(change))} <Text style={styles.totalPct}>{percent(changePct)}</Text>
        </Text>
      ) : (
        <Text style={styles.line}>Buy your first security to start your daily recap.</Text>
      )}

      {recap.best ? (
        <Extreme label="Best" name={name(recap.best.securityId)} ppm={recap.best.changePpm} />
      ) : null}
      {recap.worst ? (
        <Extreme label="Worst" name={name(recap.worst.securityId)} ppm={recap.worst.changePpm} />
      ) : null}

      {recap.fills.slice(0, MAX_FILLS).map(({ securityId, side, fill }) => (
        <Text key={`${securityId}-${fill.at}-${side}`} style={styles.line}>
          {side === 'buy' ? 'Bought' : 'Sold'} {name(securityId)} for {ils(toShekels(fill.value))}
        </Text>
      ))}

      <View style={styles.moves}>
        {marketMoves(market).map(({ label, ppm }) => (
          <Move key={label} label={label} ppm={ppm} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  wide: { flex: 1 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '500' },
  total: {
    fontFamily: font.display,
    fontSize: 30,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  totalPct: { fontSize: 16 },
  line: { color: colors.ink, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: '600' },
  moves: { columnGap: 14, flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  move: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
});
