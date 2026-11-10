// Small awards on a profile. League badges come from finished weeks, so everyone can see them.
// What you hold and your streak are only known to you, so those show on your own page only.
// Your own page also shows the ones still to earn, as goals.

import { StyleSheet, Text, View } from "react-native";

import { DIVISIONS, type Division } from "@portfolio-league/engine";
import type { Profile } from "@/api/client";

import { DivisionBadge } from "./division-badge";
import { LineIcon, type LineIconName } from "./line-icon";
import { colors, font } from "./ui";

const REGULAR_WEEKS = 4;
const CHAMPION_WINS = 3;
const SPREAD = 5;

// A division badge uses that division's own trophy; the rest are line icons.
type Badge = { icon: LineIconName | Division; name: string; how: string; times: number };

/** Your own facts the server doesn't share: what you hold and your best streak. */
export type OwnFacts = {
  traded: boolean;
  bestStreak: number;
  holdings: number;
  bothMarkets: boolean;
};

const once = (earned: boolean) => (earned ? 1 : 0);

const reached = (honours: Profile["honours"], division: Division) =>
  honours.highestDivision
    ? DIVISIONS.indexOf(honours.highestDivision) >= DIVISIONS.indexOf(division)
    : false;

export function badgesOf(honours: Profile["honours"], own?: OwnFacts): Badge[] {
  const league: Badge[] = [
    {
      icon: "sprout",
      name: "First week",
      how: "Finish a week in the league",
      times: once(honours.weeksPlayed > 0),
    },
    {
      icon: "calendar",
      name: "Regular",
      how: `Play ${REGULAR_WEEKS} weeks`,
      times: once(honours.weeksPlayed >= REGULAR_WEEKS),
    },
    {
      icon: "trendingUp",
      name: "Beat the market",
      how: "Beat every index fund in a week",
      times: honours.beatMarket ?? 0,
    },
    {
      icon: "rocket",
      name: "Big week",
      how: "Make 5% or more in one week",
      times: honours.bigWeeks ?? 0,
    },
    {
      icon: "shield",
      name: "Steady hand",
      how: "End a week up, with no fall over 1%",
      times: honours.steadyWeeks ?? 0,
    },
    {
      icon: "arrowUp",
      name: "Moved up",
      how: "Move up a division",
      times: honours.movedUp ?? 0,
    },
    {
      icon: "silver",
      name: "Silver",
      how: "Reach the Silver division",
      times: once(reached(honours, "silver")),
    },
    {
      icon: "gold",
      name: "Gold",
      how: "Reach the Gold division",
      times: once(reached(honours, "gold")),
    },
    {
      icon: "diamond",
      name: "Diamond",
      how: "Reach the Diamond division",
      times: once(reached(honours, "diamond")),
    },
    {
      icon: "medal",
      name: "Top 3",
      how: "Finish a week in the top 3",
      times: honours.top3,
    },
    { icon: "trophy", name: "Winner", how: "Win a week", times: honours.wins },
    {
      icon: "crown",
      name: "Champion",
      how: `Win ${CHAMPION_WINS} weeks`,
      times: once(honours.wins >= CHAMPION_WINS),
    },
  ];
  if (!own) return league;
  return [
    {
      icon: "cart",
      name: "First trade",
      how: "Place your first order",
      times: once(own.traded),
    },
    {
      icon: "layers",
      name: "Well spread",
      how: `Hold ${SPREAD} different securities at once`,
      times: once(own.holdings >= SPREAD),
    },
    {
      icon: "globe",
      name: "Two markets",
      how: "Hold Tel Aviv and US securities at once",
      times: once(own.bothMarkets),
    },
    ...league,
    {
      icon: "flame",
      name: "7 days in a row",
      how: "Open the game 7 days in a row",
      times: once(own.bestStreak >= 7),
    },
    {
      icon: "zap",
      name: "30 days in a row",
      how: "Open the game 30 days in a row",
      times: once(own.bestStreak >= 30),
    },
  ];
}

const isDivision = (icon: string): icon is Division =>
  (DIVISIONS as readonly string[]).includes(icon);

export function Badges({
  honours,
  own,
}: {
  honours: Profile["honours"];
  own?: OwnFacts;
}) {
  const all = badgesOf(honours, own);
  // Someone else's page shows only what they've earned. Yours shows the rest too, faded.
  // Earned ones come first.
  const shown = (own ? all : all.filter((badge) => badge.times > 0)).sort(
    (a, b) => Number(b.times > 0) - Number(a.times > 0),
  );
  const earned = all.filter((badge) => badge.times > 0).length;
  if (shown.length === 0)
    return <Text style={styles.empty}>No badges yet.</Text>;

  return (
    <View style={styles.box}>
      {own ? (
        <Text style={styles.count}>
          {earned} of {all.length} earned
        </Text>
      ) : null}
      <View style={styles.list}>
        {shown.map((badge) => {
          const got = badge.times > 0;
          return (
            <View
              key={badge.name}
              style={[styles.badge, got ? styles.earned : styles.locked]}
            >
              <View style={[styles.icon, !got && styles.faded]}>
                {isDivision(badge.icon) ? (
                  <DivisionBadge division={badge.icon} size={26} />
                ) : (
                  <LineIcon name={badge.icon} size={24} color={got ? colors.brand : colors.muted} />
                )}
              </View>
              <View style={styles.text}>
                <Text style={[styles.name, !got && styles.lockedText]}>
                  {badge.name}
                  {badge.times > 1 ? ` ×${badge.times}` : ""}
                </Text>
                <Text style={styles.how}>{got ? "Earned" : badge.how}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  count: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    flexBasis: 200,
    flexDirection: "row",
    flexGrow: 1,
    gap: 10,
    padding: 12,
  },
  earned: { backgroundColor: colors.raised, borderColor: colors.brand },
  locked: { borderColor: colors.line, borderStyle: "dashed" },
  icon: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  faded: { opacity: 0.3 },
  text: { flex: 1, gap: 2 },
  name: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    fontWeight: "600",
  },
  lockedText: { color: colors.muted },
  how: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  empty: { color: colors.muted, fontFamily: font.body, fontSize: 15 },
});
