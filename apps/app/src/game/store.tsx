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
import {
  accountGone,
  createAccount,
  currentToken,
  dropUnconfirmedAccount,
  emailConfirmed,
  logIn,
  logOut,
} from '@/api/session';
import { visitDue } from '@/game/streak';

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
const EMAIL_CHECK_MS = 4_000;

type Game = {
  /** needsEmail: the account exists, but its email isn't confirmed yet, so it can't join. */
  status: 'loading' | 'signedOut' | 'needsEmail' | 'needsName' | 'signedIn';
  offline: boolean;
  world: WorldData | null;
  market: MarketData | null;
  me: Me | null;
  orders: Order[];
  signUp(email: string, password: string, name: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  chooseName(name: string): Promise<void>;
  /** Asks again whether the email is confirmed, and joins with the name given at sign-up if so. */
  checkEmail(): Promise<boolean>;
  /** Leaves the "check your email" step. An unconfirmed account is deleted, freeing its email. */
  switchEmail(): Promise<void>;
  /** Why joining failed, for example a name someone else took while the email was confirmed. */
  joinProblem: string | null;
  signOut(): Promise<void>;
  placeOrder(order: NewOrder): Promise<void>;
  notice: string | null;
  showNotice(text: string): void;
  clearNotice(): void;
  setGoal(amount: number): Promise<void>;
  /** A new name for the player. Throws ApiProblem if it's taken or not allowed. */
  rename(name: string): Promise<void>;
  toggleWatch(id: string): Promise<void>;
  clockMoved(): Promise<void>;
  /** Your photo, kept here so the top bar, your profile and the chat change together. */
  myPhoto: string | null;
  setMyPhoto(photo: string | null): void;
  /** A visitor looking around before signing up. Everything public works; trading asks them to join. */
  guest: boolean;
  lookAround(): void;
  join(): void;
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
  const [guest, setGuest] = useState(false);
  const lookAround = useCallback(() => setGuest(true), []);
  const join = useCallback(() => setGuest(false), []);

  const skipCacheUntil = useRef(0);
  const ordersSeen = useRef({ for: '', at: 0 }); // what the order list was last fetched for
  const visitSent = useRef(''); // the player and day the streak visit was last sent for

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
      // Counts today's visit toward the streak, also when the game was left open overnight or
      // comes back from the home screen without reloading. It doesn't hold up the rest.
      const visit = visitDue(nextMe.uid, nextMe.streak?.lastDay, visitSent.current, now);
      if (visit) {
        visitSent.current = visit;
        api
          .visit(token)
          .then((streak) => setMe((current) => (current ? { ...current, streak } : current)))
          .catch(() => {
            visitSent.current = ''; // try again on the next refresh
          });
      }
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
      if (code === 'PLAYER_NOT_FOUND') {
        setMe(null);
        try {
          return setStatus((await emailConfirmed()) ? 'needsName' : 'needsEmail');
        } catch (stillThere) {
          // The owner deleted this player and their sign-in: go back to the sign-up page below.
          if (!accountGone(stillThere)) return setOffline(true);
        }
      } else if (code !== 'UNAUTHENTICATED' && !accountGone(error)) {
        return setOffline(true);
      }
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

  // The name typed at sign-up, kept until the email is confirmed and the player can be created.
  const nameToJoin = useRef<string | null>(null);
  const [joinProblem, setJoinProblem] = useState<string | null>(null);

  const chooseName = useCallback(
    async (name: string) => {
      const token = await currentToken();
      if (!token) return;
      try {
        await api.createPlayer(token, name);
      } catch (error) {
        if (error instanceof ApiProblem && error.code === 'NAME_TAKEN') {
          // Ask for another name, instead of trying the same one again.
          nameToJoin.current = null;
          setJoinProblem(error.message);
          setStatus('needsName');
          throw error;
        }
        if (!(error instanceof ApiProblem && error.code === 'EMAIL_NOT_CONFIRMED')) throw error;
        nameToJoin.current = name;
        return setStatus('needsEmail');
      }
      nameToJoin.current = null;
      setJoinProblem(null);
      await refreshOwn();
    },
    [refreshOwn],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      await createAccount(email, password);
      if (!(await emailConfirmed())) {
        nameToJoin.current = name;
        return setStatus('needsEmail');
      }
      setStatus('needsName'); // if naming fails, the account exists and only the name is left
      await chooseName(name);
    },
    [chooseName],
  );

  const checkEmail = useCallback(async () => {
    if (!(await emailConfirmed())) return false;
    const name = nameToJoin.current;
    if (name) await chooseName(name);
    else setStatus('needsName'); // the page was reloaded since sign-up, so ask for the name again
    return true;
  }, [chooseName]);

  // The link is clicked in another tab or in the email app, so keep looking while waiting.
  useEffect(() => {
    if (status !== 'needsEmail') return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') checkEmail().catch(() => undefined);
    }, EMAIL_CHECK_MS);
    return () => clearInterval(timer);
  }, [status, checkEmail]);

  // If the regular refresh noticed the confirmation first, join with the name already given.
  useEffect(() => {
    if (status === 'needsName' && nameToJoin.current) chooseName(nameToJoin.current).catch(() => undefined);
  }, [status, chooseName]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await logIn(email, password);
      await refreshOwn();
    },
    [refreshOwn],
  );

  const leave = useCallback(async (end: () => Promise<void>) => {
    nameToJoin.current = null;
    setJoinProblem(null);
    await end();
    setMe(null);
    setOrders([]);
    ordersSeen.current = { for: '', at: 0 };
    setStatus('signedOut');
  }, []);
  const signOut = useCallback(() => leave(logOut), [leave]);
  const switchEmail = useCallback(() => leave(dropUnconfirmedAccount), [leave]);

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

  const rename = useCallback(
    async (name: string) => {
      const token = await currentToken();
      if (!token) return;
      await api.rename(token, name);
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
      checkEmail,
      switchEmail,
      joinProblem,
      signOut,
      placeOrder,
      notice,
      showNotice: setNotice,
      clearNotice,
      setGoal,
      rename,
      toggleWatch,
      clockMoved,
      myPhoto,
      setMyPhoto,
      guest: guest && status === 'signedOut',
      lookAround,
      join,
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
      checkEmail,
      switchEmail,
      joinProblem,
      signOut,
      placeOrder,
      notice,
      clearNotice,
      setGoal,
      rename,
      toggleWatch,
      clockMoved,
      myPhoto,
      guest,
      lookAround,
      join,
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
