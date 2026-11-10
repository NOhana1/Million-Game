// A player's page: their badge, this week's standing and everything they've achieved so far.
// Only results show here. What someone holds stays private.

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { api, Profile } from "@/api/client";
import { currentToken } from "@/api/session";
import { AccountEditor } from "@/components/account-editor";
import { Avatar } from "@/components/avatar";
import { Badges } from "@/components/badges";
import { DivisionBadge } from "@/components/division-badge";
import {
  Button,
  changeColor,
  colors,
  Eyebrow,
  font,
  hover,
  Page,
  percent,
  useWide,
} from "@/components/ui";
import { PhotoEditor } from "@/components/photo-editor";
import { ShareWeek } from "@/components/share-card";
import { choosePhoto, cutPhoto, NO_CROP, PhotoCrop } from "@/game/photo";
import { useGame } from "@/game/store";
import { DIVISION_LABEL, ppmToPercent } from "@/game/view";

const NOTHING_YET = "–";
const BOT_SUFFIX = / \(bot\)$/;
const longestWord = (text: string) => Math.max(...text.split(/\s+/).map((w) => w.length));

/** Your own picture, with buttons to add, adjust or remove it. Friends see it in the group chat. */
function MyPhoto({ name, size }: { name: string; size: number }) {
  const { myPhoto: shown, setMyPhoto: setShown } = useGame();
  const [editing, setEditing] = useState<{
    original: string;
    crop: PhotoCrop;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);

  const add = async () => {
    setProblem(false);
    const original = await choosePhoto();
    if (original) setEditing({ original, crop: NO_CROP });
  };

  const adjust = async () => {
    const token = await currentToken();
    if (!token || !shown) return;
    setProblem(false);
    const saved = await api.myPhoto(token).catch(() => null);
    setEditing(saved ?? { original: shown, crop: NO_CROP });
  };

  const save = async (crop: PhotoCrop) => {
    const token = await currentToken();
    if (!token || !editing) return;
    setBusy(true);
    try {
      const small = await cutPhoto(editing.original, crop);
      await api.setPhoto(token, {
        photo: small,
        original: editing.original,
        crop,
      });
      setShown(small);
      setEditing(null);
    } catch {
      setProblem(true);
      setEditing(null);
    }
    setBusy(false);
  };

  const remove = async () => {
    const token = await currentToken();
    if (!token) return;
    setProblem(false);
    await api
      .removePhoto(token)
      .then(() => setShown(null))
      .catch(() => setProblem(true));
  };

  return (
    <View style={styles.photoBox}>
      <Avatar name={name} photo={shown} size={size} />
      <Pressable
        accessibilityRole="button"
        onPress={shown ? adjust : add}
        {...hover("link")}
      >
        <Text style={styles.photoLink}>
          {shown ? "Edit photo" : "Add photo"}
        </Text>
      </Pressable>
      {shown ? (
        <View style={styles.photoMore}>
          <Pressable
            accessibilityRole="button"
            onPress={add}
            {...hover("link")}
          >
            <Text style={styles.photoRemove}>New</Text>
          </Pressable>
          <Text style={styles.photoRemove}>·</Text>
          <Pressable
            accessibilityRole="button"
            onPress={remove}
            {...hover("link")}
          >
            <Text style={styles.photoRemove}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      {problem ? (
        <Text style={styles.photoProblem}>That didn’t save. Try again.</Text>
      ) : null}
      {editing ? (
        <PhotoEditor
          original={editing.original}
          start={editing.crop}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, market, orders, signOut } = useGame();
  const wide = useWide();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  // Changes after a rename, so the page asks past the CDN's copy for the new name.
  const [fresh, setFresh] = useState<number | undefined>(undefined);
  const uid = id === "me" ? me?.uid : id;

  useEffect(() => {
    if (!uid) return;
    let current = true;
    if (!fresh) setProfile(null);
    setFailed(false);
    api
      .profile(uid, fresh)
      .then((result) => current && setProfile(result))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [uid, fresh]);

  // Leaving the page closes the editor.
  useEffect(() => setEditing(false), [uid]);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/league");

  if (failed) {
    return (
      <Page maxWidth={640}>
        <Text style={styles.empty}>We can’t find that player.</Text>
        <Button
          variant="quiet"
          label="Back to the league"
          onPress={() => router.replace("/league")}
        />
      </Page>
    );
  }
  if (!profile)
    return <ActivityIndicator style={styles.page} color={colors.brand} />;

  const mine = profile.id === me?.uid;
  const { honours, thisWeek } = profile;
  const name = profile.name.replace(BOT_SUFFIX, "");
  const weekReturn = thisWeek ? ppmToPercent(thisWeek.returnPpm) : 0;

  return (
    <Page maxWidth={880}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          onPress={back}
          {...hover("link")}
          style={styles.backBox}
        >
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        {/* Your own account's actions sit up here, not at the end of the page. */}
        {mine ? (
          <View style={styles.topActions}>
            <Pressable
              accessibilityRole="button"
              aria-expanded={editing}
              onPress={() => setEditing(!editing)}
              {...hover("quiet")}
              style={styles.topButton}
            >
              <Text style={styles.topButtonText}>
                {editing ? "Close editing" : "Edit name or email"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={signOut}
              {...hover("quiet")}
              style={[styles.topButton, styles.signOutButton]}
            >
              <Text style={[styles.topButtonText, styles.signOutText]}>
                Sign out
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.head, !wide && styles.headPhone]}>
        {mine ? (
          <MyPhoto name={name} size={wide ? 104 : 72} />
        ) : (
          <Avatar name={name} photo={profile.photo} size={wide ? 104 : 72} />
        )}
        <View style={styles.headText}>
          <Eyebrow>
            {mine ? "Your profile" : profile.bot ? "Computer player" : "Player"}{" "}
            · {DIVISION_LABEL[profile.division]} division
          </Eyebrow>
          {/* No numberOfLines: on the web it sets overflow: clip, which shaved the edges off letters. */}
          <Text
            style={[
              styles.name,
              !wide && styles.namePhone,
              !wide && longestWord(name) > 9 && styles.namePhoneLong,
            ]}
          >
            {name}
          </Text>
        </View>
        <DivisionBadge division={profile.division} size={wide ? 120 : 48} />
      </View>

      {mine && editing ? (
        <AccountEditor
          onRenamed={() => setFresh(Date.now())}
          onClose={() => setEditing(false)}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.title}>This week</Text>
        {thisWeek ? (
          <View style={styles.stats}>
            <Stat
              label="Place"
              value={`#${thisWeek.rank} of ${thisWeek.total}`}
            />
            <Stat label="Score" value={thisWeek.score.toFixed(0)} />
            <Stat
              label="Return"
              value={percent(weekReturn)}
              color={changeColor(weekReturn)}
            />
            <Stat
              label="Largest fall"
              value={`${ppmToPercent(thisWeek.maxFallPpm).toFixed(2)}%`}
            />
          </View>
        ) : (
          <Text style={styles.empty}>
            {mine
              ? "Hold a security to join this week’s table."
              : "Not on this week’s table yet."}
          </Text>
        )}
      </View>

      {mine && thisWeek ? (
        <View style={styles.share}>
          <ShareWeek
            card={{
              name,
              division: profile.division,
              rank: thisWeek.rank,
              total: thisWeek.total,
              returnPercent: weekReturn,
              score: thisWeek.score,
            }}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.title}>Achievements</Text>
        <View style={styles.stats}>
          <Stat label="Weeks played" value={String(honours.weeksPlayed)} />
          <Stat label="Weeks won" value={String(honours.wins)} />
          <Stat label="Top 3 finishes" value={String(honours.top3)} />
          <Stat
            label="Best place"
            value={honours.bestRank ? `#${honours.bestRank}` : NOTHING_YET}
          />
          <Stat
            label="Best score"
            value={
              honours.bestScore === null
                ? NOTHING_YET
                : honours.bestScore.toFixed(0)
            }
          />
          {mine && me?.streak ? (
            <>
              <Stat label="Daily streak" value={`${me.streak.days} ${me.streak.days === 1 ? 'day' : 'days'}`} />
              <Stat label="Best streak" value={String(me.streak.best)} />
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Badges</Text>
        <Badges
          honours={honours}
          own={
            mine && me
              ? {
                  traded:
                    me.positions.length > 0 ||
                    me.pendingOrders.length > 0 ||
                    orders.length > 0,
                  bestStreak: me.streak?.best ?? 0,
                  holdings: me.positions.length,
                  bothMarkets: ["TASE", "US"].every((place) =>
                    me.positions.some(
                      (p) =>
                        market?.securities.find(
                          (row) => row.id === p.securityId,
                        )?.market === place,
                    ),
                  ),
                }
              : undefined
          }
        />
      </View>

    </Page>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.page, flex: 1 },
  flex: { flex: 1, gap: 6, minWidth: 0 },
  backBox: { alignSelf: "center", justifyContent: "center", minHeight: 40 },
  back: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 14,
    fontWeight: "500",
  },
  // Room between the photo and the name, so the name's first letter is never cut.
  head: { alignItems: "center", flexDirection: "row", gap: 28 },
  headPhone: { gap: 20 },
  headText: { flex: 1, minWidth: 0, paddingLeft: 4 },
  photoBox: { alignItems: "center", flexShrink: 0, gap: 6 },
  photoLink: {
    color: colors.brand,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: "600",
  },
  photoMore: { flexDirection: "row", gap: 6 },
  photoRemove: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  photoProblem: {
    color: colors.down,
    fontFamily: font.body,
    fontSize: 12,
    maxWidth: 110,
    textAlign: "center",
  },
  name: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 60,
    fontWeight: "400",
    lineHeight: 70,
  },
  namePhone: { fontSize: 32, lineHeight: 40 },
  // A long single word gets a smaller size on a phone, so it isn’t broken mid-word.
  namePhoneLong: { fontSize: 24, lineHeight: 30 },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 16,
    paddingTop: 18,
  },
  title: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 24,
    fontWeight: "500",
  },
  stats: { columnGap: 24, flexDirection: "row", flexWrap: "wrap", rowGap: 18 },
  stat: { flexBasis: 150, flexGrow: 1, gap: 4 },
  statValue: {
    color: colors.ink,
    fontFamily: font.display,
    fontSize: 32,
    fontVariant: ["tabular-nums"],
    lineHeight: 38,
  },
  empty: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 22,
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  topActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  // Both buttons the same height, with the words in the middle of the box.
  topButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 16,
  },
  topButtonText: {
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
  signOutButton: { borderColor: colors.down },
  signOutText: { color: colors.down },
  share: { alignSelf: "flex-start", marginTop: -4 },
});
