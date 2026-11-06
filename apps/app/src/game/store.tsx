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
import { createAccount, currentToken, logIn, logOut } from '@/api/session';

// Shared data is cached by the CDN, so it can refresh often. A player's own data reads the
// database, so it refreshes less often, and right after they place an order.
const SHARED_REFRESH_MS = 5_000;
const OWN_REFRESH_MS = 15_000;
// The CDN can answer with a copy up to 10 seconds old, which would show the time before a jump.
const SKIP_CACHE_AFTER_MOVE_MS = 12_000;

type Game = {
  status: 'loading' | 'signedOut' | 'needsName' | 'signedIn';
  offline: boolean;
  world: WorldData | null;
  market: MarketData | null;
  me: Me | null;
  orders: Order[];
  signUp(email: string, password: string, name: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  chooseName(name: string): Promise<void>;
  signOut(): Promise<void>;
  placeOrder(order: NewOrder): Promise<void>;
  clockMoved(): Promise<void>;
};

const GameContext = createContext<Game | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Game['status']>('loading');
  const [offline, setOffline] = useState(false);
  const [world, setWorld] = useState<WorldData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  const skipCacheUntil = useRef(0);

  const refreshShared = useCallback(async () => {
    try {
      const now = Date.now();
      const fresh = now < skipCacheUntil.current ? now : undefined;
      const [nextWorld, nextMarket] = await Promise.all([api.world(fresh), api.market(fresh)]);
      setWorld(nextWorld);
      setMarket(nextMarket);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const refreshOwn = useCallback(async () => {
    try {
      const token = await currentToken();
      if (!token) return setStatus('signedOut');
      const [nextMe, nextOrders] = await Promise.all([api.me(token), api.orders(token)]);
      setMe(nextMe);
      setOrders(nextOrders);
      setStatus('signedIn');
    } catch (error) {
      const code = error instanceof ApiProblem ? error.code : null;
      if (code === 'PLAYER_NOT_FOUND') return setStatus('needsName');
      if (code !== 'UNAUTHENTICATED') return setOffline(true);
      await logOut();
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

  const chooseName = useCallback(
    async (name: string) => {
      const token = await currentToken();
      if (!token) return;
      await api.createPlayer(token, name);
      await refreshOwn();
    },
    [refreshOwn],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      await createAccount(email, password);
      setStatus('needsName'); // if naming fails, the account exists and only the name is left
      await chooseName(name);
    },
    [chooseName],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      await logIn(email, password);
      await refreshOwn();
    },
    [refreshOwn],
  );

  const signOut = useCallback(async () => {
    await logOut();
    setMe(null);
    setOrders([]);
    setStatus('signedOut');
  }, []);

  const placeOrder = useCallback(
    async (order: NewOrder) => {
      const token = await currentToken();
      if (!token) return;
      await api.placeOrder(token, order);
      await refreshOwn();
    },
    [refreshOwn],
  );

  const clockMoved = useCallback(async () => {
    skipCacheUntil.current = Date.now() + SKIP_CACHE_AFTER_MOVE_MS;
    await Promise.all([refreshShared(), refreshOwn()]);
  }, [refreshShared, refreshOwn]);

  const game = useMemo(
    () => ({
      status,
      offline,
      world,
      market,
      me,
      orders,
      signUp,
      signIn,
      chooseName,
      signOut,
      placeOrder,
      clockMoved,
    }),
    [
      status,
      offline,
      world,
      market,
      me,
      orders,
      signUp,
      signIn,
      chooseName,
      signOut,
      placeOrder,
      clockMoved,
    ],
  );

  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

const TICK_MS = 250;

/** The world time right now, moving smoothly between server updates. It only goes forward. */
export function useLiveWorldTime() {
  const { world } = useGame();
  const [time, setTime] = useState(world?.worldTime ?? 0);

  useEffect(() => {
    if (!world) return;
    const receivedAt = Date.now();
    const speed = world.clock.paused ? 0 : world.clock.speed;
    const tick = () =>
      setTime((shown) => Math.max(shown, world.worldTime + (Date.now() - receivedAt) * speed));
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [world]);

  return time;
}

export function useGame() {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside GameProvider');
  return game;
}
