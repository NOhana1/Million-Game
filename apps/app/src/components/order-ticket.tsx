import { shekelsToAgorot, type Side } from '@portfolio-league/engine';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiProblem, MarketRow, NewOrder } from '@/api/client';
import { newId } from '@/api/session';
import { useGame } from '@/game/store';
import {
  canSellAll,
  displayPrice,
  fillingOrder,
  findRow,
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
  const { me, market, world, placeOrder, showNotice } = useGame();
  const wide = useWide();
  const [side, setSide] = useState<Side>(startSide);
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  // One id per order: a retry of the same order reuses it, so it can't be charged twice.
  const [orderId, setOrderId] = useState(newId);

  if (!me || !market || !world) return null;

  const amount = Number(text);
  const limit = maxOrderAmount(me, market, security, side);
  const problem = orderProblem(me, market, security, side, amount);
  const open = world.markets[security.market].open;
  const paused = world.clock.tradingPaused;
  // An earlier order is going through. The buttons open again by themselves once it has.
  const filling = fillingOrder(me, world.worldTime);
  const fillingName = filling ? (findRow(market, filling.securityId)?.name ?? filling.securityId) : '';
  const blocked = sending || paused || Boolean(filling);
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

  const send = async (order: NewOrder, what: string) => {
    setSending(true);
    setServerProblem(null);
    try {
      await placeOrder(order);
      const when = open
        ? 'today’s closing price'
        : `the next ${MARKET_LABEL[security.market]} opening price`;
      showNotice(`${side === 'buy' ? 'Buy' : 'Sell'} order placed: ${what}. It fills at ${when}.`);
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
    send(
      { id: orderId, securityId: security.id, side, amount: shekelsToAgorot(amount) },
      `${ils(amount)} of ${security.name}`,
    );
  };

  const sellEverything = () =>
    send({ id: orderId, securityId: security.id, side: 'sell', amount: 'all' }, `all of ${security.name}`);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.holder, wide && styles.holderWide]} pointerEvents="box-none">
        <View style={[styles.sheet, wide && styles.sheetWide]}>
          <View style={styles.header}>
            <Tile id={security.id} name={security.name} sector={security.sector} />
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

          <View style={[styles.amount, focused && styles.amountFocused]}>
            <Text style={styles.shekel}>₪</Text>
            <TextInput
              accessibilityLabel="Amount in shekels"
              autoFocus
              inputMode="numeric"
              onBlur={() => setFocused(false)}
              onChangeText={setAmount}
              onFocus={() => setFocused(true)}
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

          {/* Once sent, the refreshed account already counts this order, so checking it again would
              wrongly say it breaks the limit just before the ticket closes. */}
          {tried && problem && !sending ? <Text style={styles.error}>{problem}</Text> : null}
          {serverProblem ? <Text style={styles.error}>{serverProblem}</Text> : null}
          {paused ? <Text style={styles.error}>{problemText('TRADING_PAUSED')}</Text> : null}
          {filling && !paused ? (
            <View style={styles.filling}>
              <Text style={styles.fillingText}>
                Your {filling.side} order for {fillingName} is going through now. You can trade
                again in about a minute. This window updates by itself.
              </Text>
            </View>
          ) : null}
          <Button
            label={`${side === 'buy' ? 'Buy' : 'Sell'}${amount > 0 ? ` ${ils(amount)}` : ''}`}
            onPress={submit}
            disabled={blocked}
          />
          {side === 'sell' && canSellAll(me, security.id) ? (
            <Button
              variant="quiet"
              label="Sell everything"
              onPress={sellEverything}
              disabled={blocked}
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
  amountFocused: { borderColor: colors.brand },
  shekel: { color: colors.muted, fontFamily: font.display, fontSize: 30, fontWeight: '500' },
  input: {
    color: colors.ink,
    flex: 1,
    fontFamily: font.display,
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    minWidth: 0,
    // No ring of its own: the browser drew a second box inside the amount box. The amount box
    // shows focus instead.
    outlineStyle: 'solid',
    outlineWidth: 0,
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
  filling: { backgroundColor: colors.raised, borderColor: colors.line, borderRadius: 3, borderWidth: 1, padding: 12 },
  fillingText: { color: colors.ink, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
