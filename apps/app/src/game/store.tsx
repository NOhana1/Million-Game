import type { Order } from '@portfolio-league/engine';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { api, ApiProblem, MarketData, Me, NewOrder, WorldData } from '@/api/client';
import { forgetToken, newId, savedToken, saveToken } from '@/api/session';

// Shared data is cached by the CDN, so it can refresh often. A player's own data reads the
// database, so it refreshes less often, and right after they place an order.
const SHARED_REFRESH_MS = 5_000;
const OWN_REFRESH_MS = 15_000;

type Game = {
  status: 'loading' | 'signedOut' | 'signedIn';
  offline: boolean;
  world: WorldData | null;
  market: MarketData | null;
  me: Me | null;
  orders: Order[];
  join(name: string): Promise<void>;
  placeOrder(order: NewOrder): Promise<void>;
};

const GameContext = createContext<Game | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const token = useRef<string | null>(savedToken());
  const [status, setStatus] = useState<Game['status']>(token.current ? 'loading' : 'signedOut');
  const [offline, setOffline] = useState(false);
  const [world, setWorld] = useState<WorldData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  const refreshShared = useCallback(async () => {
    try {
      const [nextWorld, nextMarket] = await Promise.all([api.world(), api.market()]);
      setWorld(nextWorld);
      setMarket(nextMarket);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const refreshOwn = useCallback(async () => {
    if (!token.current) return;
    try {
      const [nextMe, nextOrders] = await Promise.all([
        api.me(token.current),
        api.orders(token.current),
      ]);
      setMe(nextMe);
      setOrders(nextOrders);
      setStatus('signedIn');
    } catch (error) {
      const gone =
        error instanceof ApiProblem && ['PLAYER_NOT_FOUND', 'UNAUTHENTICATED'].includes(error.code);
      if (!gone) return setOffline(true);
      forgetToken();
      token.current = null;
      setMe(null);
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    const whileVisible = (work: () => void) => () => {
      if (AppState.currentState === 'active') work();
    };
    refreshShared();
    refreshOwn();
    const shared = setInterval(whileVisible(refreshShared), SHARED_REFRESH_MS);
    const own = setInterval(whileVisible(refreshOwn), OWN_REFRESH_MS);
    return () => {
      clearInterval(shared);
      clearInterval(own);
    };
  }, [refreshShared, refreshOwn]);

  const join = useCallback(
    async (name: string) => {
      const next = newId();
      await api.createPlayer(next, name);
      saveToken(next);
      token.current = next;
      await refreshOwn();
    },
    [refreshOwn],
  );

  const placeOrder = useCallback(
    async (order: NewOrder) => {
      if (!token.current) return;
      await api.placeOrder(token.current, order);
      await refreshOwn();
    },
    [refreshOwn],
  );

  const game = useMemo(
    () => ({ status, offline, world, market, me, orders, join, placeOrder }),
    [status, offline, world, market, me, orders, join, placeOrder],
  );

  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

export function useGame() {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside GameProvider');
  return game;
}
