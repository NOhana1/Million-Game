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
} from '@/game/view';

import { Button, colors, ils, money, Segments } from './ui';

export function OrderTicket({ security, onClose }: { security: MarketRow; onClose: () => void }) {
  const { me, market, world, placeOrder } = useGame();
  const [side, setSide] = useState<Side>('buy');
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  // One id per order: a retry of the same order reuses it, so it can't be charged twice.
  const [orderId, setOrderId] = useState(newId);

  if (!me || !market || !world) return null;

  const amount = Number(text.replace(/,/g, ''));
  const limit = maxOrderAmount(me, market, security, side);
  const problem = orderProblem(me, market, security, side, amount);
  const open = world.markets[security.market].open;
  const currency = security.market === 'US' ? '$' : '₪';

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
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title}>{security.name}</Text>
              <Text style={styles.muted}>
                {security.id} · {MARKET_LABEL[security.market]} · last{' '}
                {money(displayPrice(security.price), currency)}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>

          <Segments
            value={side}
            onChange={(value) => {
              setSide(value);
              setTried(false);
              changeOrder();
            }}
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />

          <Text style={styles.label}>Amount in shekels</Text>
          <TextInput
            accessibilityLabel="Amount in shekels"
            autoFocus
            inputMode="decimal"
            onChangeText={(value) => {
              setText(value);
              changeOrder();
            }}
            placeholder="0"
            placeholderTextColor="#9AA39E"
            style={styles.input}
            value={text}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setText(String(limit));
              changeOrder();
            }}>
            <Text style={styles.limit}>
              {side === 'buy' ? 'Most you can buy' : 'Most you can sell'}: {ils(limit)}
            </Text>
          </Pressable>

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
            label={side === 'buy' ? 'Place buy order' : 'Place sell order'}
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15, 25, 20, 0.45)' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 16 },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 14,
    gap: 12,
    maxWidth: 440,
    padding: 18,
    width: '100%',
  },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  title: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, marginTop: 2 },
  close: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  input: {
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    marginTop: -6,
    padding: 12,
  },
  limit: { color: colors.brand, fontSize: 13, fontWeight: '600', marginTop: -4 },
  notice: { backgroundColor: colors.warnSoft, borderRadius: 10, padding: 12 },
  noticeText: { color: colors.warnInk, fontSize: 13, lineHeight: 19 },
  error: { color: colors.down, fontSize: 14, fontWeight: '600' },
});
