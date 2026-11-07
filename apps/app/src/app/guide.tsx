// The rules and a short guide to the app. Every line here is a rule the engine or the server
// enforces, so a change to the rules has to change this page too.

import { DIVISIONS } from '@portfolio-league/engine';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DivisionTag } from '@/components/division-badge';
import { Card, colors, Eyebrow, font, Page, useWide } from '@/components/ui';
import { Steps } from '@/components/welcome';

type Line = { term: string; text: string };

const COMPETITION: Line[] = [
  { term: 'The week', text: 'Runs Monday to Friday and ends at the Friday US close.' },
  { term: 'Score', text: '0.85 × Return rank + 0.15 × Stability rank.' },
  {
    term: 'Return rank',
    text: 'How your return this week compares with other players. 100 is the highest return.',
  },
  {
    term: 'Stability rank',
    text: 'How your largest fall this week, from a peak to the low after it, compares with other players. 100 is the smallest fall.',
  },
  {
    term: 'Who’s on the table',
    text: 'Players who held a security that week. If you join midweek, you’re measured from when you joined.',
  },
  { term: 'A new week', text: 'Your portfolio and division carry over. Only the score starts again.' },
];

const DIVISION_RULES: Line[] = [
  { term: 'Starting out', text: 'Everyone starts in Bronze.' },
  {
    term: 'Moving',
    text: 'When the week ends, the top 25% of each division move up and the bottom 25% move down. You’re compared only with players in your own division.',
  },
  {
    term: 'Small divisions',
    text: 'The top quarter rounds up and the bottom quarter rounds down, so a very small division still sends one player up.',
  },
  { term: 'Sitting out', text: 'If you held nothing all week, you stay where you are.' },
];

const TRADING: Line[] = [
  { term: 'Starting cash', text: '₪1,000,000 of virtual money. There are no fees.' },
  {
    term: 'Amounts',
    text: 'You buy and sell by shekel amount, and can own part of a unit. The smallest order is ₪100, except when selling everything.',
  },
  {
    term: 'Order price',
    text: 'Sent while the market is open: that day’s closing price. Sent while it’s closed: the next trading day’s opening price.',
  },
  { term: 'No cancelling', text: 'Once you send an order, it can’t be cancelled.' },
  {
    term: 'The 20% limit',
    text: 'One security can’t be more than 20% of your portfolio when you buy it. If a buy would break the limit when it fills, it fills up to the limit and the rest of your cash comes back.',
  },
  {
    term: 'No borrowing',
    text: 'You can’t short or use leverage. Cash for a buy is set aside when you send the order, and money from a sale can’t be spent until the sale fills.',
  },
  { term: 'US securities', text: 'Priced in dollars and converted at the dollar rate when the order fills.' },
  { term: 'Waiting orders', text: 'You can have up to 50 at a time.' },
];

const CLOCK: Line[] = [
  { term: 'Tel Aviv', text: 'Monday to Thursday 10:00–17:30, Friday 10:00–13:50, Israel time.' },
  { term: 'US', text: 'Monday to Friday 9:30–16:00, New York time.' },
  {
    term: 'Game time',
    text: 'All players share one clock. It normally runs 7× faster than real time, so a game week takes about one real day.',
  },
];

const APP: Line[] = [
  {
    term: 'Market',
    text: 'Your cash, goal and last day, plus every security. Search and sort the list, or press a name to see its chart.',
  },
  { term: 'Portfolio', text: 'What you own, what it’s worth, and your waiting and filled orders.' },
  { term: 'League', text: 'Your division, this week’s table and last week’s top 3.' },
  {
    term: 'World clock',
    text: 'At the bottom of the League page. Moving the clock needs a code, because it changes the time for everyone.',
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </Card>
  );
}

function Lines({ lines }: { lines: Line[] }) {
  const wide = useWide();
  return (
    <View>
      {lines.map(({ term, text }) => (
        <View key={term} style={[styles.line, wide && styles.lineWide]}>
          <Text style={[styles.term, wide && styles.termWide]}>{term}</Text>
          <Text style={styles.text}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function GuideScreen() {
  return (
    <Page maxWidth={880}>
      <View style={styles.head}>
        <Eyebrow>Portfolio League</Eyebrow>
        <Text style={styles.heading}>Rules and guide</Text>
      </View>
      <Section title="How to play">
        <Steps />
      </Section>
      <Section title="The competition">
        <Lines lines={COMPETITION} />
      </Section>
      <Section title="Divisions">
        <View style={styles.badges}>
          {DIVISIONS.map((division) => (
            <DivisionTag key={division} division={division} size={26} />
          ))}
        </View>
        <Lines lines={DIVISION_RULES} />
      </Section>
      <Section title="Trading rules">
        <Lines lines={TRADING} />
      </Section>
      <Section title="Market hours">
        <Lines lines={CLOCK} />
      </Section>
      <Section title="Using the app">
        <Lines lines={APP} />
      </Section>
    </Page>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  heading: { color: colors.ink, fontFamily: font.display, fontSize: 38, fontWeight: '400' },
  section: { gap: 12 },
  title: { color: colors.ink, fontFamily: font.display, fontSize: 24, fontWeight: '500' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  line: { borderTopColor: colors.line, borderTopWidth: 1, gap: 3, paddingVertical: 10 },
  lineWide: { flexDirection: 'row', gap: 16 },
  term: { color: colors.ink, fontFamily: font.body, fontSize: 14, fontWeight: '600' },
  termWide: { width: 150 },
  text: { color: colors.muted, flex: 1, fontFamily: font.body, fontSize: 14, lineHeight: 21 },
});
