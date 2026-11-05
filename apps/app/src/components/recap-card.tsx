import { StyleSheet, Text, View } from 'react-native';

import { useGame } from '@/game/store';
import { useLeague } from '@/game/use-league';
import { findRow, marketMoves, ppmToPercent, recapFor, toShekels } from '@/game/view';

import { Card, changeColor, colors, ils, percent } from './ui';

const MAX_FILLS = 3;

function Move({ label, ppm }: { label: string; ppm: number }) {
  const value = ppmToPercent(ppm);
  return (
    <Text style={styles.move}>
      {label} <Text style={{ color: changeColor(value) }}>{percent(value)}</Text>
    </Text>
  );
}

export function RecapCard() {
  const { me, market, orders } = useGame();
  const { table } = useLeague();
  if (!me || !market) return null;

  const recap = recapFor(me, market, orders);
  const name = (id: string) => findRow(market, id)?.name ?? id;
  const row = table?.rows.find((r) => r.id === me.uid);
  const held = me.positions.length > 0;
  const change = toShekels(recap.change);
  const changePct = ppmToPercent(recap.changePpm);

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Your last day</Text>
      {held ? (
        <Text style={[styles.total, { color: changeColor(changePct) }]}>
          {change < 0 ? '-' : '+'}
          {ils(Math.abs(change))} ({percent(changePct)})
        </Text>
      ) : (
        <Text style={styles.line}>Buy your first security to start your daily recap.</Text>
      )}

      {recap.best ? (
        <Text style={styles.line}>
          Best: {name(recap.best.securityId)} {percent(ppmToPercent(recap.best.changePpm))}
        </Text>
      ) : null}
      {recap.worst ? (
        <Text style={styles.line}>
          Worst: {name(recap.worst.securityId)} {percent(ppmToPercent(recap.worst.changePpm))}
        </Text>
      ) : null}

      {recap.fills.slice(0, MAX_FILLS).map(({ securityId, side, fill }) => (
        <Text key={`${securityId}-${fill.at}-${side}`} style={styles.line}>
          {side === 'buy' ? 'Bought' : 'Sold'} {name(securityId)} for {ils(toShekels(fill.value))}
        </Text>
      ))}

      {row && table ? (
        <Text style={styles.line}>
          You’re #{row.rank} of {table.total} this week
        </Text>
      ) : null}

      <View style={styles.moves}>
        {marketMoves(market).map(({ label, ppm }) => (
          <Move key={label} label={label} ppm={ppm} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, marginHorizontal: 16, marginTop: 16 },
  title: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  total: { fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700' },
  line: { color: colors.ink, fontSize: 14 },
  moves: { columnGap: 14, flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  move: { color: colors.muted, fontSize: 13 },
});
