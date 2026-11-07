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
// The order list costs a database read per order, so it's fetched only when the player's cash,
// holdings or waiting orders changed, or this long after the last fetch, as a safety net.
const ORDERS_AT_LEAST_EVERY_MS = 60_000;
// The CDN can answer with a copy up to 10 seconds old, which would show the time before a jump.
const SKIP_CACHE_AFTER_MOVE_MS = 12_000;
const NOTICE_MS = 8_000;

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
  notice: string | null;
  showNotice(text: string): void;
  clearNotice(): void;
  setGoal(amount: number): Promise<void>;
  toggleWatch(id: string): Promise<void>;
  clockMoved(): Promise<void>;
  /** Your photo, kept here so the top bar, your profile and the chat change together. */
  myPhoto: string | null;
  setMyPhoto(photo: string | null): void;
};

const GameContext = createContext<Game | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Game['status']>('loading');
  const [offline, setOffline] = useState(false);
  const [world, setWorld] = useState<WorldData | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);

  const skipCacheUntil = useRef(0);
  const ordersSeen = useRef({ for: '', at: 0 }); // what the order list was last fetched for

  const clearNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

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
      const nextMe = await api.me(token);
      setMe(nextMe);
      setStatus('signedIn');
      const now = Date.now();
      const changes = JSON.stringify([
        nextMe.uid,
        nextMe.cash,
        nextMe.holdings,
        nextMe.pendingOrders.map((order) => order.id),
      ]);
      const seen = ordersSeen.current;
      if (changes !== seen.for || now - seen.at >= ORDERS_AT_LEAST_EVERY_MS) {
        setOrders(await api.orders(token));
        ordersSeen.current = { for: changes, at: now };
      }
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
    ordersSeen.current = { for: '', at: 0 };
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

  const setGoal = useCallback(
    async (amount: number) => {
      const token = await currentToken();
      if (!token) return;
      await api.setGoal(token, amount);
      await refreshOwn();
    },
    [refreshOwn],
  );

  // Shown at once, so the star feels instant. The next refresh puts it right if saving failed.
  const toggleWatch = useCallback(
    async (id: string) => {
      const token = await currentToken();
      if (!token || !me) return;
      const current = me.watchlist ?? [];
      const watchlist = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      setMe({ ...me, watchlist });
      await api.setWatchlist(token, watchlist).catch(() => undefined);
    },
    [me],
  );

  // Read once per sign in. After that, editing the photo updates it here directly.
  const uid = me?.uid;
  useEffect(() => {
    setMyPhoto(null);
    if (!uid) return;
    api
      .profile(uid, Date.now())
      .then((profile) => setMyPhoto(profile.photo))
      .catch(() => undefined);
  }, [uid]);

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
      notice,
      showNotice: setNotice,
      clearNotice,
      setGoal,
      toggleWatch,
      clockMoved,
      myPhoto,
      setMyPhoto,
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
      notice,
      clearNotice,
      setGoal,
      toggleWatch,
      clockMoved,
      myPhoto,
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
