// A picture of your week to send to friends, with a link to join. It's drawn in the browser,
// so it costs the server nothing. Only results show on it, never what you hold.

import type { Division } from "@portfolio-league/engine";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DIVISION_LABEL } from "@/game/view";

import { BADGES } from "./division-badge";
import { Button, colors, font, hover } from "./ui";

const SIZE = 1080;
const FILE_NAME = "portfolio-league.png";

export type WeekCard = {
  name: string;
  division: Division;
  rank: number;
  total: number;
  returnPercent: number;
  score: number;
};

const joinLink = () =>
  globalThis.location?.origin ?? "https://million-game-three.vercel.app";

const sign = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;

const loadImage = (uri: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = uri;
  });

/** Draws the card and returns it as a PNG data address. */
async function drawCard(card: WeekCard): Promise<string> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("No canvas");

  g.fillStyle = colors.page;
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = colors.brand;
  g.lineWidth = 6;
  g.strokeRect(40, 40, SIZE - 80, SIZE - 80);

  // The game's mark and name.
  g.save();
  g.translate(130, 140);
  g.rotate(Math.PI / 4);
  g.fillStyle = colors.brand;
  g.fillRect(-22, -22, 44, 44);
  g.restore();
  g.fillStyle = colors.brand;
  g.font = `600 34px ${font.body}`;
  g.fillText("PORTFOLIO LEAGUE", 180, 152);

  g.drawImage(await loadImage(BADGES[card.division]), SIZE - 330, 90, 220, 220);

  g.fillStyle = colors.muted;
  g.font = `500 40px ${font.body}`;
  g.fillText("This week", 100, 330);
  g.fillStyle = colors.ink;
  g.font = `500 92px ${font.display}`;
  g.fillText(
    card.name.length > 16 ? `${card.name.slice(0, 15)}…` : card.name,
    100,
    430,
  );

  g.font = `500 230px ${font.display}`;
  g.fillText(`#${card.rank}`, 100, 680);
  g.fillStyle = colors.muted;
  g.font = `500 44px ${font.body}`;
  g.fillText(
    `of ${card.total} in the ${DIVISION_LABEL[card.division]} division`,
    108,
    750,
  );

  g.fillStyle = card.returnPercent >= 0 ? colors.up : colors.down;
  g.font = `600 64px ${font.body}`;
  g.fillText(sign(card.returnPercent), 100, 860);
  g.fillStyle = colors.ink;
  g.fillText(`Score ${card.score.toFixed(0)}`, 520, 860);

  g.fillStyle = colors.brand;
  g.font = `600 36px ${font.body}`;
  g.fillText(
    `Play free with ₪1,000,000: ${joinLink().replace(/^https?:\/\//, "")}`,
    100,
    970,
  );

  return canvas.toDataURL("image/png");
}

const shareText = (card: WeekCard) =>
  `I'm #${card.rank} of ${card.total} in the ${DIVISION_LABEL[card.division]} division of Portfolio League this week. Join me: ${joinLink()}`;

/** A button that opens the card, with ways to send or save it. Web only. */
export function ShareWeek({ card }: { card: WeekCard }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS !== "web") return null;
  return (
    <>
      <Button
        variant="quiet"
        label="Share my week"
        onPress={() => setOpen(true)}
      />
      {open ? <ShareSheet card={card} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ShareSheet({
  card,
  onClose,
}: {
  card: WeekCard;
  onClose: () => void;
}) {
  const [picture, setPicture] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const key = JSON.stringify(card); // the parent makes a new object on every refresh
  useEffect(() => {
    drawCard(JSON.parse(key)).then(setPicture, () =>
      setDone("This browser can’t make the picture."),
    );
  }, [key]);

  // Phones open their own share menu (WhatsApp, Instagram…). Elsewhere the picture is saved.
  const share = async () => {
    if (!picture) return;
    const blob = await (await fetch(picture)).blob();
    const file = new File([blob], FILE_NAME, { type: "image/png" });
    const text = shareText(card);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch {
      return; // closed the share menu
    }
    save();
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setDone(
      "Picture saved, and the invite text is copied. Paste it with the picture.",
    );
  };

  const save = () => {
    if (!picture) return;
    const link = document.createElement("a");
    link.href = picture;
    link.download = FILE_NAME;
    link.click();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View style={styles.holder} pointerEvents="box-none">
        <View style={styles.sheet}>
          {picture ? (
            <Image
              accessibilityLabel="Your week as a picture"
              source={{ uri: picture }}
              style={styles.picture}
            />
          ) : (
            <View style={styles.picture} />
          )}
          {done ? <Text style={styles.done}>{done}</Text> : null}
          <Button label="Share" onPress={share} disabled={!picture} />
          <Button
            variant="quiet"
            label="Save picture"
            onPress={save}
            disabled={!picture}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            {...hover("link")}
            style={styles.closeBox}
          >
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(3, 6, 5, 0.74)",
  },
  holder: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 6,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 16,
    width: "100%",
  },
  picture: {
    aspectRatio: 1,
    backgroundColor: colors.page,
    borderRadius: 4,
    width: "100%",
  },
  done: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
  },
  closeBox: { alignSelf: "center", padding: 6 },
  close: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 14,
    fontWeight: "600",
  },
});
