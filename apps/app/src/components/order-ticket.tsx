import { shekelsToAgorot, type Side } from '@portfolio-league/engine';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiProblem, MarketRow, NewOrder } from '@/api/client';
import { newId } from '@/api/session';
import { useGame } from '@/game/store';
import {
  canSellAll,
  displayPrice,
  MARKET_LABEL,
  maxOrderAmount,
  orderProblem,
  problemText,
  toShekels,
} from '@/game/view';

import { Button, colors, font, hover, ils, money, Segments, Tile, useWide } from './ui';

const QUICK_AMOUNTS = [
  { label: '25%', share: 0.25 },
  { label: '50%', share: 0.5 },
  { label: 'Most', share: 1 },
];

export function OrderTicket({
  security,
  onClose,
  startSide = 'buy',
}: {
  security: MarketRow;
  onClose: () => void;
  startSide?: Side;
}) {
  const { me, market, world, placeOrder } = useGame();
  const wide = useWide();
  const [side, setSide] = useState<Side>(startSide);
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  // One id per order: a retry of the same order reuses it, so it can't be charged twice.
  const [orderId, setOrderId] = useState(newId);

  if (!me || !market || !world) return null;

  const amount = Number(text);
  const limit = maxOrderAmount(me, market, security, side);
  const problem = orderProblem(me, market, security, side, amount);
  const open = world.markets[security.market].open;
  const currency = security.market === 'US' ? '$' : '₪';
  const held = me.positions.find((p) => p.securityId === security.id);
  const spare =
    side === 'buy'
      ? `You can spend ${ils(toShekels(me.cash))}`
      : `You hold ${ils(toShekels(held?.value ?? 0))}`;

  // Whole shekels only. Cutting at the dot first keeps a pasted 12.50 from becoming 1250.
  const setAmount = (value: string) => {
    setText(value.split('.')[0].replace(/\D/g, ''));
    changeOrder();
  };

  const changeOrder = () => {
    setOrderId(newId());
    setServerProblem(null);
  };

  const send = async (order: NewOrder) => {
    setSending(true);
    setServerProblem(null);
    try {
      await placeOrder(order);
      onClose();
    } catch (error) {
      const code = error instanceof ApiProblem ? error.code : 'NETWORK';
      setServerProblem(
        code === 'NETWORK' ? 'Can’t reach the server. Please try again.' : problemText(code),
      );
      setSending(false);
    }
  };

  const submit = () => {
    setTried(true);
    if (problem) return;
    send({ id: orderId, securityId: security.id, side, amount: shekelsToAgorot(amount) });
  };

  const sellEverything = () =>
    send({ id: orderId, securityId: security.id, side: 'sell', amount: 'all' });

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.holder, wide && styles.holderWide]} pointerEvents="box-none">
        <View style={[styles.sheet, wide && styles.sheetWide]}>
          <View style={styles.header}>
            <Tile name={security.name} sector={security.sector} />
            <View style={styles.flex}>
              <Text style={styles.title}>{security.name}</Text>
              <Text style={styles.muted}>
                {MARKET_LABEL[security.market]} · {money(displayPrice(security.price), currency)}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} {...hover('link')}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <Segments
            value={side}
            onChange={(value) => {
              setSide(value);
              setTried(false);
              setAmount('');
            }}
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />

          <View style={styles.amount}>
            <Text style={styles.shekel}>₪</Text>
            <TextInput
              accessibilityLabel="Amount in shekels"
              autoFocus
              inputMode="numeric"
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={text}
            />
          </View>
          <Text style={styles.muted}>
            {spare}. Most for this order: {ils(limit)}.
          </Text>

          <View style={styles.quick}>
            {QUICK_AMOUNTS.map(({ label, share }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                onPress={() => setAmount(String(Math.floor(limit * share)))}
                {...hover('lift')}
                style={styles.chip}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {open
                ? 'Executes at today’s closing price.'
                : `${MARKET_LABEL[security.market]} is closed. Executes at the next opening price.`}{' '}
              The price isn’t known yet, and the order can’t be cancelled.
            </Text>
          </View>

          {tried && problem ? <Text style={styles.error}>{problem}</Text> : null}
          {serverProblem ? <Text style={styles.error}>{serverProblem}</Text> : null}
          <Button
            label={`${side === 'buy' ? 'Buy' : 'Sell'}${amount > 0 ? ` ${ils(amount)}` : ''}`}
            onPress={submit}
            disabled={sending}
          />
          {side === 'sell' && canSellAll(me, security.id) ? (
            <Button
              variant="quiet"
              label="Sell everything"
              onPress={sellEverything}
              disabled={sending}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(3, 6, 5, 0.74)' },
  holder: { flex: 1, justifyContent: 'flex-end' },
  holderWide: { alignItems: 'center', justifyContent: 'center' },
  sheet: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 18,
    paddingBottom: 24,
  },
  sheetWide: { borderRadius: 6, maxWidth: 460, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 22, fontWeight: '500' },
  muted: { color: colors.muted, fontFamily: font.body, fontSize: 13, marginTop: 2 },
  close: { color: colors.muted, fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  amount: {
    alignItems: 'center',
    backgroundColor: colors.page,
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },
  shekel: { color: colors.muted, fontFamily: font.display, fontSize: 30, fontWeight: '500' },
  input: {
    color: colors.ink,
    flex: 1,
    fontFamily: font.display,
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    minWidth: 0,
    outlineColor: 'transparent', // the amount box around it is the visible field
    paddingVertical: 10,
  },
  quick: { flexDirection: 'row', gap: 8 },
  chip: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  chipText: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  notice: { backgroundColor: colors.warnSoft, borderRadius: 3, padding: 12 },
  noticeText: { color: colors.warnInk, fontFamily: font.body, fontSize: 13, lineHeight: 19 },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
