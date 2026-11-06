import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api, LeagueTable } from '@/api/client';

const REFRESH_MS = 30_000; // the table only changes at market opens and closes

export function useLeague() {
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [previous, setPrevious] = useState<LeagueTable | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        setTable(await api.league());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const lastWeekEnd = table?.previousWeekEndsAt ?? null;
  useEffect(() => {
    if (lastWeekEnd === null) return;
    api.finishedWeek(lastWeekEnd).then(setPrevious, () => setPrevious(null));
  }, [lastWeekEnd]);

  return { table, previous, failed };
}
