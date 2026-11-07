// The price chart. Points sit side by side, so nights and weekends don't leave gaps. Moving over
// it shows the price at that moment, and a new range draws in from the left.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import type { PricePoint, Range } from '@/api/client';
import { changeColor, colors, font } from '@/components/ui';
import { axisDate } from '@/game/view';

const TOP = 14;
const BOTTOM = 26;
const RIGHT = 56; // room for the price labels
const GRID_LINES = 4;
const DATE_LABELS = 4;
const DRAW_MS = 700;

const round = (n: number) => Math.round(n * 10) / 10;

export function PriceChart({
  points,
  range,
  height = 340,
  format,
  onScrub,
}: {
  points: PricePoint[];
  range: Range;
  height?: number;
  format: (price: number) => string;
  onScrub: (point: PricePoint | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState<number | null>(null);
  const box = useRef<HTMLElement | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, { duration: DRAW_MS, toValue: 1, useNativeDriver: false }).start();
  }, [points, reveal]);

  const plotWidth = Math.max(width - RIGHT, 1);
  const plotHeight = height - TOP - BOTTOM;

  const shape = useMemo(() => {
    const prices = points.map((p) => p.price);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const spread = high - low || high * 0.01 || 1;
    const x = (i: number) => round((i / Math.max(points.length - 1, 1)) * plotWidth);
    const y = (price: number) => round(TOP + ((high - price) / spread) * plotHeight);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.price)}`).join(' ');
    const area = `${line} L${x(points.length - 1)} ${TOP + plotHeight} L0 ${TOP + plotHeight} Z`;
    const grid = Array.from({ length: GRID_LINES }, (_, i) => high - (spread * i) / (GRID_LINES - 1));
    return { x, y, line, area, grid };
  }, [points, plotHeight, plotWidth]);

  const first = points[0]?.price ?? 0;
  const last = points.at(-1)?.price ?? 0;
  const color = changeColor(last - first);
  const picked = index === null ? null : points[index];
  const dates = Array.from({ length: DATE_LABELS }, (_, i) =>
    Math.round((i * (points.length - 1)) / (DATE_LABELS - 1)),
  );

  const pick = (offset: number) => {
    const share = Math.min(Math.max(offset / plotWidth, 0), 1);
    const next = Math.round(share * (points.length - 1));
    setIndex(next);
    onScrub(points[next] ?? null);
  };
  const leave = () => {
    setIndex(null);
    onScrub(null);
  };

  // The mouse is read against the box, because the event's own target is whatever part of the
  // drawing it happens to be over. A finger on a phone gets its position from the responder.
  const webMove = (event: { clientX: number }) => {
    if (box.current) pick(event.clientX - box.current.getBoundingClientRect().left);
  };
  const handlers =
    Platform.OS === 'web'
      ? { onPointerMove: webMove, onPointerLeave: leave }
      : {
          onStartShouldSetResponder: () => true,
          onResponderGrant: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
          onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
          onResponderRelease: leave,
        };

  return (
    <View
      ref={box as never}
      style={[styles.box, { height }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      {...(handlers as object)}>
      {width > 0 && points.length > 1 ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.2} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {shape.grid.map((price) => (
              <Line
                key={price}
                x1={0}
                x2={plotWidth}
                y1={shape.y(price)}
                y2={shape.y(price)}
                stroke={colors.line}
                strokeWidth={1}
              />
            ))}
            <Line
              x1={0}
              x2={plotWidth}
              y1={shape.y(first)}
              y2={shape.y(first)}
              stroke={colors.faint}
              strokeDasharray="2 5"
              strokeWidth={1}
            />
            <Path d={shape.area} fill="url(#fade)" />
            <Path d={shape.line} fill="none" stroke={color} strokeLinejoin="round" strokeWidth={1.8} />
            {picked && index !== null ? (
              <>
                <Line
                  x1={shape.x(index)}
                  x2={shape.x(index)}
                  y1={TOP}
                  y2={TOP + plotHeight}
                  stroke={colors.muted}
                  strokeWidth={1}
                />
                <Circle cx={shape.x(index)} cy={shape.y(picked.price)} r={9} fill={color} opacity={0.2} />
                <Circle cx={shape.x(index)} cy={shape.y(picked.price)} r={4} fill={color} />
              </>
            ) : (
              <>
                <Circle cx={plotWidth} cy={shape.y(last)} r={9} fill={color} opacity={0.2} />
                <Circle cx={plotWidth} cy={shape.y(last)} r={3.5} fill={color} />
              </>
            )}
          </Svg>

          {shape.grid.map((price) => (
            <Text key={price} style={[styles.price, { top: shape.y(price) - 8 }]}>
              {format(price)}
            </Text>
          ))}
          {dates.map((at, i) => (
            <Text
              key={at}
              style={[
                styles.date,
                i === 0 && styles.dateFirst,
                i === dates.length - 1 && { right: RIGHT },
                i > 0 && i < dates.length - 1 && { left: shape.x(at) - 40, width: 80 },
              ]}>
              {axisDate(points[at]?.at ?? 0, range)}
            </Text>
          ))}

          {/* A cover that slides away, so the line seems to draw itself. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.cover,
              {
                left: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }),
                height: height - BOTTOM,
              },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

/** Takes the chart's place while its prices load, so the page doesn't jump. */
export function ChartLoading({ height = 340 }: { height?: number }) {
  return (
    <View style={[styles.box, { height }]}>
      <View {...({ dataSet: { breathe: 'true' } } as object)} style={styles.loadingLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', touchAction: 'pan-y', width: '100%' } as object,
  cover: { backgroundColor: colors.page, position: 'absolute', right: 0, top: 0 },
  price: {
    color: colors.faint,
    fontFamily: font.body,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    position: 'absolute',
    right: 0,
    textAlign: 'right',
  },
  date: {
    bottom: 4,
    color: colors.faint,
    fontFamily: font.body,
    fontSize: 11,
    position: 'absolute',
    textAlign: 'center',
  },
  dateFirst: { left: 0 },
  loadingLine: { backgroundColor: colors.line, height: 1, marginTop: 170, width: '100%' },
});
