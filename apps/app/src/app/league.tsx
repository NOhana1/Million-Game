import { type Division, divisionMoves, DIVISIONS, MOVE_PERCENT } from '@portfolio-league/engine';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeagueRow, LeagueTable } from '@/api/client';
import { DivisionBadge, DivisionTag } from '@/components/division-badge';
import { TopThree } from '@/components/league-cards';
import {
  Card,
  changeColor,
  colors,
  Eyebrow,
  font,
  hover,
  Hero,
  Page,
  percent,
  Segments,
  useWide,
} from '@/components/ui';
import { useGame, useLiveWorldTime } from '@/game/store';
import { useLeague } from '@/game/use-league';
import { DIVISION_LABEL, weekEndsIn } from '@/game/view';

const PPM_PER_PERCENT = 10_000;
const BOT_SUFFIX = / \(bot\)$/; // the tag below always shows, however narrow the screen
const PODIUM = 3;

type Week = 'this' | 'last';
type Shown = Division | 'everyone';
type Move = 'up' | 'down' | null;

const MOVE_TEXT = { up: '▲ Moving up', down: '▼ Moving down' };

function Countdown({ weekEndsAt }: { weekEndsAt: number }) {
  const { world } = useGame();
  const time = useLiveWorldTime();
  if (!world) return null;
  return <Text style={styles.heroStrong}>{weekEndsIn(world, weekEndsAt, time)}</Text>;
}

/** A finished week says who moved. This week's table says who would move if it ended now. */
function movesOf(table: LeagueTable, finished: boolean) {
  const moves = divisionMoves(table.rows);
  return (row: LeagueRow): Move => {
    const next = finished ? row.nextDivision : moves.get(row.id);
    if (!next || next === row.division) return null;
    return DIVISIONS.indexOf(next) > DIVISIONS.indexOf(row.division) ? 'up' : 'down';
  };
}

/** Says in plain words what this week's place means for the player's division. */
function standingText(table: LeagueTable, mine: LeagueRow, move: Move) {
  const group = table.rows.filter((row) => row.division === mine.division);
  const place = group.findIndex((row) => row.id === mine.id) + 1;
  const label = DIVISION_LABEL[mine.division];
  const next = DIVISIONS[DIVISIONS.indexOf(mine.division) + 1];
  const lower = DIVISIONS[DIVISIONS.indexOf(mine.division) - 1];
  const start = `You’re #${place} of ${group.length} in ${label}.`;
  if (move === 'up') return `${start} If the week ended now, you’d move up to ${DIVISION_LABEL[next]}.`;
  if (move === 'down') return `${start} If the week ended now, you’d drop to ${DIVISION_LABEL[lower]}.`;
  if (!next) return `${start} This is the top division. Stay out of the bottom ${MOVE_PERCENT}%.`;
  const places = Math.ceil((group.length * MOVE_PERCENT) / 100);
  return `${start} Finish in the top ${places} to move up to ${DIVISION_LABEL[next]}.`;
}

/** The four stages, lowest first. Pressing one shows who is in it. */
function Ladder({
  table,
  mine,
  shown,
  onShow,
}: {
  table: LeagueTable;
  mine?: LeagueRow;
  shown: Shown;
  onShow: (shown: Shown) => void;
}) {
  return (
    <View style={styles.ladder}>
      {DIVISIONS.map((division) => {
        const players = table.rows.filter((row) => row.division === division).length;
        const active = shown === division;
        return (
          <Pressable
            key={division}
            accessibilityRole="button"
            accessibilityLabel={`Show the ${DIVISION_LABEL[division]} division`}
            aria-selected={active}
            onPress={() => onShow(division)}
            {...hover('lift')}
            style={[styles.step, active && styles.stepActive]}>
            <DivisionBadge division={division} size={38} />
            <Text style={styles.stepName}>{DIVISION_LABEL[division]}</Text>
            <Text style={styles.stepCount}>
              {mine?.division === division ? 'You’re here' : `${players} ${players === 1 ? 'player' : 'players'}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({
  row,
  place,
  move,
  isMe,
}: {
  row: LeagueRow;
  place: number;
  move: Move;
  isMe: boolean;
}) {
  const wide = useWide();
  const returnPct = row.returnPpm / PPM_PER_PERCENT;
  const fall = `${(row.maxFallPpm / PPM_PER_PERCENT).toFixed(2)}%`;
  return (
    <View {...hover('line')} style={[styles.row, isMe && styles.me]}>
      <Text style={[styles.rank, place <= PODIUM && styles.rankPodium]}>{place}</Text>
      {wide ? (
        <DivisionBadge division={row.division} size={26} />
      ) : (
        <View style={styles.badgeBox}>
          <DivisionBadge division={row.division} size={24} />
          <Text style={styles.badgeName}>{DIVISION_LABEL[row.division]}</Text>
        </View>
      )}
      <View style={styles.player}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name.replace(BOT_SUFFIX, '')}
            {isMe ? ' (you)' : ''}
          </Text>
          {row.bot ? <Text style={styles.botTag}>bot</Text> : null}
        </View>
        {wide ? null : (
          <Text style={styles.meta}>
            <Text style={[styles.strong, { color: changeColor(returnPct) }]}>{percent(returnPct)}</Text>
            {'  '}Max fall {fall}
          </Text>
        )}
        {move ? (
          <Text style={[styles.meta, styles.strong, { color: changeColor(move === 'up' ? 1 : -1) }]}>
            {MOVE_TEXT[move]}
          </Text>
        ) : null}
      </View>
      {wide ? (
        <>
          <Text style={[styles.cell, styles.cellDivision]}>{DIVISION_LABEL[row.division]}</Text>
          <Text style={[styles.cell, styles.strong, { color: changeColor(returnPct) }]}>
            {percent(returnPct)}
          </Text>
          <Text style={styles.cell}>{fall}</Text>
        </>
      ) : null}
      <Text style={[styles.score, !wide && styles.scorePhone]}>{row.score.toFixed(0)}</Text>
    </View>
  );
}

function TableHead() {
  return (
    <View style={styles.head}>
      <Text style={[styles.headText, styles.headPlayer]}>Player</Text>
      <Text style={[styles.headText, styles.cellDivision]}>Division</Text>
      <Text style={[styles.headText, styles.headCell]}>Return</Text>
      <Text style={[styles.headText, styles.headCell]}>Max fall</Text>
      <Text style={[styles.headText, styles.headScore]}>Score</Text>
    </View>
  );
}

export default function LeagueScreen() {
  const { me } = useGame();
  const wide = useWide();
  const [week, setWeek] = useState<Week>('this');
  const [picked, setPicked] = useState<Shown | null>(null);
  const { table: current, previous, failed } = useLeague();

  if (!current) {
    return (
      <View style={styles.loading}>
        {failed ? (
          <Text style={styles.meta}>Can’t load the table right now.</Text>
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
      </View>
    );
  }

  const table = week === 'last' && previous ? previous : current;
  const finished = table === previous;
  const mine = table.rows.find((row) => row.id === me?.uid);
  const shown = picked ?? mine?.division ?? 'everyone';
  const byDivision = shown !== 'everyone';
  const rows = byDivision ? table.rows.filter((r) => r.division === shown) : table.rows;
  const moveOf = movesOf(table, finished);

  return (
    <Page maxWidth={880}>
      <Hero style={styles.hero}>
        <View style={styles.heroText}>
          <Eyebrow>{week === 'last' ? 'Last week' : 'This week'}</Eyebrow>
          <Text style={[styles.heroTitle, !wide && styles.heroTitlePhone]}>
            {mine ? `${DIVISION_LABEL[mine.division]} division` : 'You’re not on the table yet'}
          </Text>
          {mine ? (
            <Text style={styles.heroStrong}>
              #{mine.rank} of {table.total} overall
            </Text>
          ) : (
            <Text style={styles.heroLabel}>
              Hold a security this week to join. The table updates at each market open and close.
            </Text>
          )}
          {week === 'this' && table.weekEndsAt ? <Countdown weekEndsAt={table.weekEndsAt} /> : null}
        </View>
        {mine ? <DivisionBadge division={mine.division} size={wide ? 120 : 64} /> : null}
      </Hero>

      <Card ruled style={styles.divisions}>
        <View style={styles.divisionsTop}>
          <Text style={styles.title}>Divisions</Text>
          <Pressable
            accessibilityRole="button"
            aria-selected={shown === 'everyone'}
            onPress={() => setPicked('everyone')}
            {...hover('link')}>
            <Text style={[styles.everyone, shown === 'everyone' && styles.everyoneActive]}>
              Show everyone
            </Text>
          </Pressable>
        </View>
        <Ladder table={table} mine={mine} shown={shown} onShow={setPicked} />
        {mine && week === 'this' ? (
          <Text style={styles.standing}>{standingText(table, mine, moveOf(mine))}</Text>
        ) : null}
        <Text style={styles.meta}>
          Your score is 85% return rank and 15% stability rank. When the week ends, the top 25% of
          each division move up and the bottom 25% move down. A new week starts everyone’s score
          again, but your division stays.
        </Text>
      </Card>

      <TopThree previous={previous} />

      {previous ? (
        <Segments
          value={week}
          onChange={setWeek}
          options={[
            { value: 'this', label: 'This week' },
            { value: 'last', label: 'Last week' },
          ]}
        />
      ) : null}

      {table.rows.length === 0 ? (
        <Card>
          <Text style={styles.meta}>The table starts at the next market open.</Text>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <Text style={styles.meta}>Nobody is in this division yet.</Text>
        </Card>
      ) : (
        <View style={styles.rows}>
          {wide ? <TableHead /> : null}
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              place={byDivision ? rows.indexOf(row) + 1 : row.rank}
              move={moveOf(row)}
              isMe={row.id === me?.uid}
            />
          ))}
        </View>
      )}

      {table.total > table.rows.length ? (
        <Text style={styles.meta}>
          Showing the top {table.rows.length} of {table.total} players.
        </Text>
      ) : null}
      <View style={styles.links}>
        <Link href="/guide" style={styles.link} {...hover('link')}>
          Full rules
        </Link>
        <Link href="/admin" style={styles.link} {...hover('link')}>
          World clock
        </Link>
      </View>
    </Page>
  );
}

const CELL = 84;
const SCORE = 56;
const LEAD = 70; // the place number and the trophy before each name

const styles = StyleSheet.create({
  loading: { backgroundColor: colors.page, flex: 1, padding: 16 },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  heroText: { flex: 1, gap: 4, minWidth: 0 },
  heroLabel: { color: colors.onDeep, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  heroTitle: { color: colors.ink, fontFamily: font.display, fontSize: 60, fontWeight: '400', lineHeight: 70 },
  heroTitlePhone: { fontSize: 36, lineHeight: 44 },
  heroStrong: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  divisions: { gap: 14 },
  divisionsTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  everyone: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
  everyoneActive: { color: colors.ink, fontWeight: '600', textDecorationLine: 'underline' },
  ladder: { flexDirection: 'row', gap: 6 },
  step: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 12,
  },
  stepActive: { backgroundColor: colors.raised, borderColor: colors.brand },
  stepName: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  stepCount: { color: colors.muted, fontFamily: font.body, fontSize: 12, textAlign: 'center' },
  standing: { color: colors.ink, fontFamily: font.body, fontSize: 15, fontWeight: '500', lineHeight: 22 },
  rows: { borderTopColor: colors.line, borderTopWidth: 1 },
  head: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headText: { color: colors.muted, fontFamily: font.body, fontSize: 12, fontWeight: '500' },
  headPlayer: { flex: 1, paddingLeft: LEAD },
  headCell: { textAlign: 'right', width: CELL },
  headScore: { textAlign: 'right', width: SCORE },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  me: { backgroundColor: colors.raised },
  rank: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    textAlign: 'right',
    width: 24,
  },
  rankPodium: { color: colors.brassInk, fontWeight: '600' },
  badgeBox: { alignItems: 'center', gap: 1, width: 42 },
  badgeName: { color: colors.muted, fontFamily: font.body, fontSize: 11, fontWeight: '500' },
  player: { flex: 1, minWidth: 0 },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  name: {
    color: colors.ink,
    flexShrink: 1,
    fontFamily: font.body,
    fontSize: 15,
    fontWeight: '500',
  },
  botTag: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  meta: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    lineHeight: 19,
  },
  strong: { fontWeight: '600' },
  cell: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    width: CELL,
  },
  cellDivision: { textAlign: 'left', width: CELL },
  score: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    textAlign: 'right',
    width: SCORE,
  },
  scorePhone: { width: 32 },
  links: { flexDirection: 'row', gap: 20 },
  link: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
});
