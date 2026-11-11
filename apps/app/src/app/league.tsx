import { type Division, divisionMoves, divisionRace, DIVISIONS, type Race } from '@portfolio-league/engine';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeagueRow, LeagueTable } from '@/api/client';
import { DivisionBadge, DivisionTag } from '@/components/division-badge';
import { TopThree } from '@/components/league-cards';
import {
  Card,
  changeColor,
  changeColorOnDeep,
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

/** The one big message: where you'd be next week if it ended now. */
function outcomeText(race: Race) {
  if (race.outcome === 'up') return `You’re on track for promotion to ${DIVISION_LABEL[race.next]}`;
  if (race.outcome === 'down') return `You’re currently dropping to ${DIVISION_LABEL[race.next]}`;
  const top = race.division === DIVISIONS[DIVISIONS.length - 1];
  return `You’re ${top ? '' : 'currently '}staying in ${DIVISION_LABEL[race.division]}`;
}

const pointsText = (points: number) =>
  points < 1 ? 'Less than 1 point' : `${Math.round(points)} ${Math.round(points) === 1 ? 'point' : 'points'}`;

/** How far you are from the one place that would change the message. */
function gapText(race: Race) {
  const { rival } = race;
  if (!rival) return null;
  const them = `#${rival.place}`;
  if (rival.points === 0) return `Tied on points with ${them}`;
  const points = pointsText(rival.points);
  if (race.outcome === 'up') return `${points} ahead of ${them}`;
  if (race.outcome === 'down') return `${points} behind ${them} to stay in ${DIVISION_LABEL[race.division]}`;
  if (rival.ahead) return `${points} ahead of ${them}, who would drop`;
  const higher = DIVISIONS[DIVISIONS.indexOf(race.division) + 1];
  return `${points} behind ${them} for ${DIVISION_LABEL[higher]}`;
}

/** Last week's result, as it was saved when the week ended. */
function resultText(row: LeagueRow) {
  const next = row.nextDivision ?? row.division;
  const step = DIVISIONS.indexOf(next) - DIVISIONS.indexOf(row.division);
  if (step > 0) return `You moved up to ${DIVISION_LABEL[next]}`;
  if (step < 0) return `You dropped to ${DIVISION_LABEL[next]}`;
  return `You stayed in ${DIVISION_LABEL[next]}`;
}

const OUTCOME_SIGN = { up: 1, stay: 0, down: -1 };

/** Answers one question at a glance: am I on track to move up? Places count inside your division. */
function RaceCard({ table, mine, finished }: { table: LeagueTable; mine: LeagueRow; finished: boolean }) {
  const wide = useWide();
  const race = divisionRace(table.rows, mine.id);
  if (!race) return null;
  const sign = finished
    ? DIVISIONS.indexOf(mine.nextDivision ?? mine.division) - DIVISIONS.indexOf(mine.division)
    : OUTCOME_SIGN[race.outcome];
  const color = sign ? changeColorOnDeep(sign) : colors.ink;
  const gap = finished ? null : gapText(race);
  return (
    <View style={styles.heroText}>
      <Eyebrow>{finished ? 'Last week' : 'This week'}</Eyebrow>
      <Text style={styles.heroStrong}>
        {DIVISION_LABEL[race.division]} division · #{race.place} of {race.size}
      </Text>
      {/* Keyed by the outcome, so the gold glow plays again when you reach a promoting place. */}
      <Text
        key={finished ? 'finished' : race.outcome}
        {...(!finished && race.outcome === 'up' ? { dataSet: { glow: 'true' } } : {})}
        style={[styles.outcome, !wide && styles.outcomePhone, { color }]}>
        {finished ? resultText(mine) : outcomeText(race)}
      </Text>
      {gap ? <Text style={styles.heroStrong}>{gap}</Text> : null}
      {!finished && table.weekEndsAt ? <Countdown weekEndsAt={table.weekEndsAt} /> : null}
    </View>
  );
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.name}`}
      onPress={() => router.push(`/profile/${row.id}`)}
      {...hover('line')}
      style={[styles.row, isMe && styles.me]}>
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
    </Pressable>
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
  const { me, guest } = useGame();
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
        {mine ? (
          <RaceCard table={table} mine={mine} finished={finished} />
        ) : (
          <View style={styles.heroText}>
            <Eyebrow>{week === 'last' ? 'Last week' : 'This week'}</Eyebrow>
            <Text style={[styles.heroTitle, !wide && styles.heroTitlePhone]}>
              You’re not on the table yet
            </Text>
            <Text style={styles.heroLabel}>
              {guest
                ? 'Join free and buy a security to get on the table. It updates at each market open and close.'
                : 'Hold a security this week to join. The table updates at each market open and close.'}
            </Text>
            {week === 'this' && table.weekEndsAt ? <Countdown weekEndsAt={table.weekEndsAt} /> : null}
          </View>
        )}
        {mine ? <DivisionBadge division={mine.division} size={wide ? 120 : 64} /> : null}
      </Hero>

      <Card ruled style={styles.divisions}>
        <View style={styles.divisionsTop}>
          <Text style={styles.title}>Divisions</Text>
          {/* Once everyone is shown, it's a label, not a link: pressing it again did nothing. */}
          {shown === 'everyone' ? (
            <Text style={[styles.everyone, styles.everyoneActive]}>Showing everyone</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicked('everyone')}
              {...hover('link')}>
              <Text style={styles.everyone}>Show everyone</Text>
            </Pressable>
          )}
        </View>
        <Ladder table={table} mine={mine} shown={shown} onShow={setPicked} />
        <Text style={styles.meta}>
          When the week ends, the top quarter of each division moves up and the bottom quarter moves down.
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
  // The link looks like a link. Once everyone is shown, it turns into plain grey text.
  everyone: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  everyoneActive: { color: colors.muted, fontWeight: '500', textDecorationLine: 'none' },
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
  outcome: { fontFamily: font.display, fontSize: 36, fontWeight: '400', lineHeight: 44, marginVertical: 4 },
  outcomePhone: { fontSize: 26, lineHeight: 32 },
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
  scorePhone: { width: 44 }, // fits 100
  links: { flexDirection: 'row', gap: 20 },
  link: { color: colors.muted, fontFamily: font.body, fontSize: 14, fontWeight: '500' },
});
