import { shekelsToAgorot, type Side } from '@portfolio-league/engine';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiProblem, MarketRow, NewOrder } from '@/api/client';
import { newId } from '@/api/session';
import { useGame } from '@/game/store';
import {
  canSellAll,
  currencyOf,
  displayPrice,
  fillingOrder,
  findRow,
  MARKET_LABEL,
  maxOrderAmount,
  orderProblem,
  problemText,
  sharesText,
  shekelRate,
  shekelsPerShare,
  toShekels,
  toUnits,
} from '@/game/view';

import { Button, colors, font, hover, ils, money, Segments, Tile, useWide } from './ui';

// The player types either money, in the security's own currency, or a number of shares.
type Unit = 'money' | 'shares';

/** Keeps digits and one dot, with at most `decimals` places. A pasted 12.50 stays 12.50, not 1250. */
function clean(value: string, decimals: number) {
  const [whole, ...rest] = value.replace(/[^\d.]/g, '').split('.');
  if (decimals === 0 || rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, decimals)}`;
}

const floorTo = (n: number, decimals: number) => Math.floor(n * 10 ** decimals) / 10 ** decimals;

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
  const [unit, setUnit] = useState<Unit>('money');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  // One id per order: a retry of the same order reuses it, so it can't be charged twice.
  const [orderId, setOrderId] = useState(newId);

  if (!me || !market || !world) return null;

  const currency = currencyOf(security);
  const usd = currency === '$';
  const rate = shekelRate(security, market); // shekels per unit of the security's currency
  const perShare = shekelsPerShare(security, market); // shekels for one share, at today's price
  const price = displayPrice(security.price);
  const decimals = unit === 'shares' ? 4 : usd ? 2 : 0;

  // Everything the player types becomes a shekel amount, because cash is kept in shekels and
  // orders are by amount. It's rounded down to the agora, so it never asks for more than typed.
  const typed = Number(text);
  const shekelsTyped = unit === 'shares' ? typed * perShare : typed * rate;
  const amount = Math.floor(shekelsTyped * 100) / 100;
  const shares = shekelsTyped / perShare;

  const heldUnits = toUnits(me.holdings[security.id] ?? 0);
  const sellingOtherwise = me.pendingOrders.some(
    (o) => o.status === 'pending' && o.securityId === security.id && o.side === 'sell',
  );
  // Typing every share you hold sells everything, so no tiny remainder is left behind.
  const sellsAll =
    side === 'sell' &&
    unit === 'shares' &&
    !sellingOtherwise &&
    canSellAll(me, security.id) &&
    typed >= floorTo(heldUnits, 4) &&
    typed <= heldUnits + 0.00005;

  const limit = maxOrderAmount(me, market, security, side); // whole shekels
  // Selling by shares, "Most" is every share you hold, so it can sell everything.
  const limitInUnit =
    side === 'sell' && unit === 'shares' && !sellingOtherwise
      ? floorTo(heldUnits, 4)
      : floorTo(unit === 'shares' ? limit / perShare : limit / rate, decimals);
  const engineProblem = sellsAll ? null : orderProblem(me, market, security, side, amount);
  const problem =
    engineProblem === problemText('BELOW_MINIMUM') && usd
      ? `The minimum order is ₪100 (about $${Math.ceil(100 / rate)} today).`
      : engineProblem;

  const open = world.markets[security.market].open;
  const paused = world.clock.tradingPaused;
  // An earlier order is going through. The buttons open again by themselves once it has.
  const filling = fillingOrder(me, world.worldTime);
  const fillingName = filling ? (findRow(market, filling.securityId)?.name ?? filling.securityId) : '';
  const blocked = sending || paused || Boolean(filling);

  /** Money in the security's own currency: ₪1,000 or $250.50. */
  const own = (n: number) =>
    `${currency}${n.toLocaleString('en-US', { maximumFractionDigits: usd ? 2 : 0 })}`;
  const inDollars = (shekels: number) => (usd ? ` (about ${own(shekels / rate)})` : '');
  const heldValue = toShekels(me.positions.find((p) => p.securityId === security.id)?.value ?? 0);
  const spare =
    side === 'buy'
      ? `You can spend ${ils(toShekels(me.cash))}${inDollars(toShekels(me.cash))}`
      : `You hold ${sharesText(heldUnits)} shares, worth ${ils(heldValue)}${inDollars(heldValue)}`;
  const most = unit === 'shares' ? `${sharesText(limitInUnit)} shares` : own(limitInUnit);
  const what = unit === 'shares' ? `${sharesText(typed)} shares` : own(typed);

  const setAmount = (value: string) => {
    setText(clean(value, decimals));
    changeOrder();
  };

  // Switching keeps the same order: ₪1,000 becomes 10 shares of a ₪100 stock, and back.
  const switchUnit = (next: Unit) => {
    if (next === unit) return;
    const nextDecimals = next === 'shares' ? 4 : usd ? 2 : 0;
    const converted = next === 'shares' ? (typed * rate) / perShare : (typed * perShare) / rate;
    setUnit(next);
    setText(typed > 0 ? String(floorTo(converted, nextDecimals)) : '');
    setTried(false);
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
      const when = open ? 'today’s closing price' : `the next ${MARKET_LABEL[security.market]} opening price`;
      showNotice(`${side === 'buy' ? 'Buy' : 'Sell'} order placed: ${what}. It fills at ${when}.`);
      onClose();
    } catch (error) {
      const code = error instanceof ApiProblem ? error.code : 'NETWORK';
      setServerProblem(code === 'NETWORK' ? 'Can’t reach the server. Please try again.' : problemText(code));
      setSending(false);
    }
  };

  const submit = () => {
    setTried(true);
    if (sellsAll) return sellEverything();
    if (problem) return;
    send(
      { id: orderId, securityId: security.id, side, amount: shekelsToAgorot(amount) },
      `${what} of ${security.name}${usd || unit === 'shares' ? ` (${ils(amount)})` : ''}`,
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
                {MARKET_LABEL[security.market]} · {money(price, currency)} a share
                {usd ? ` · $1 = ₪${rate.toFixed(2)}` : ''}
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

          <View style={styles.unitRow}>
            <Text style={styles.unitLabel}>{side === 'buy' ? 'Buy by' : 'Sell by'}</Text>
            {(['money', 'shares'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: unit === value }}
                onPress={() => switchUnit(value)}
                {...hover('lift')}
                style={[styles.unitChip, unit === value && styles.unitChipOn]}
              >
                <Text style={[styles.chipText, unit === value && styles.unitChipTextOn]}>
                  {value === 'shares' ? 'Number of shares' : usd ? 'Dollars ($)' : 'Shekels (₪)'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.amount, focused && styles.amountFocused]}>
            {unit === 'money' ? <Text style={styles.shekel}>{currency}</Text> : null}
            <TextInput
              accessibilityLabel={
                unit === 'shares' ? 'Number of shares' : usd ? 'Amount in dollars' : 'Amount in shekels'
              }
              autoFocus
              inputMode={decimals > 0 ? 'decimal' : 'numeric'}
              onBlur={() => setFocused(false)}
              onChangeText={setAmount}
              onFocus={() => setFocused(true)}
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={text}
            />
            {unit === 'shares' ? <Text style={styles.suffix}>shares</Text> : null}
          </View>

          {typed > 0 ? (
            <View style={styles.sum}>
              <Text style={styles.sumMain}>
                {unit === 'shares'
                  ? `${sharesText(typed)} × ${money(price, currency)} = ${own(typed * price)}`
                  : `${own(typed)} ÷ ${money(price, currency)} = about ${sharesText(shares)} shares`}
              </Text>
              {usd ? (
                <Text style={styles.sumLine}>Your cash is in shekels: {ils(amount)} at today’s rate.</Text>
              ) : null}
              {shares > 0 && shares < 1 ? (
                <Text style={styles.sumLine}>
                  That’s {Math.round(shares * 100)}% of one share. Part shares are allowed.
                </Text>
              ) : null}
              {sellsAll ? (
                <Text style={styles.sumLine}>That’s all you hold, so it sells everything.</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.muted}>
            {spare}. Most for this order: {most}.
          </Text>

          <View style={styles.quick}>
            {QUICK_AMOUNTS.map(({ label, share }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                onPress={() => setAmount(String(floorTo(limitInUnit * share, decimals)))}
                {...hover('lift')}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {open
                ? 'Executes at today’s closing price.'
                : `${MARKET_LABEL[security.market]} is closed. Executes at the next opening price.`}{' '}
              {usd ? 'The price and the dollar rate aren’t' : 'The price isn’t'} known yet, so the final
              number of shares may differ a little. The order can’t be cancelled.
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
                Your {filling.side} order for {fillingName} is going through now. You can trade again in about
                a minute. This window updates by itself.
              </Text>
            </View>
          ) : null}
          <Button
            label={`${side === 'buy' ? 'Buy' : 'Sell'}${typed > 0 ? ` ${what}` : ''}`}
            onPress={submit}
            disabled={blocked}
          />
          {side === 'sell' && canSellAll(me, security.id) ? (
            <Button variant="quiet" label="Sell everything" onPress={sellEverything} disabled={blocked} />
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
  unitRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitLabel: { color: colors.muted, fontFamily: font.body, fontSize: 13, fontWeight: '600' },
  unitChip: {
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  unitChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  unitChipTextOn: { color: colors.page },
  suffix: { color: colors.muted, fontFamily: font.body, fontSize: 16, fontWeight: '600' },
  sum: { backgroundColor: colors.raised, borderRadius: 3, gap: 4, padding: 12 },
  sumMain: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  sumLine: { color: colors.muted, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
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
  filling: {
    backgroundColor: colors.raised,
    borderColor: colors.line,
    borderRadius: 3,
    borderWidth: 1,
    padding: 12,
  },
  fillingText: { color: colors.ink, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  error: { color: colors.down, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
});
