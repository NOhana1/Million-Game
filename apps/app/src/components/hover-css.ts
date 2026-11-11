// The looks that only CSS can give the web build: hovers, focus rings, the page's entrance and
// the moving ticker. An element opts in with hover('kind') from ui.tsx. "(hover: hover)" keeps
// a hover from sticking after a tap on a phone.

import { colors } from './palette';

const on = (kind: string) => `[data-hover="${kind}"]:not([aria-disabled="true"]):hover`;
const idle = (kind: string) =>
  `[data-hover="${kind}"]:not([aria-disabled="true"]):not([aria-selected="true"]):hover`;

export const HOVER_CSS = `
:root { color-scheme: dark; }
html, body { background: ${colors.page}; }
::selection { background: ${colors.brand}; color: ${colors.onBrand}; }
* { scrollbar-color: ${colors.deepSoft} transparent; scrollbar-width: thin; }
input:-webkit-autofill { -webkit-text-fill-color: ${colors.ink}; box-shadow: 0 0 0 40px ${colors.card} inset; }

[data-hover], [data-hover] *, input {
  transition: background-color .18s ease, border-color .18s ease, box-shadow .18s ease,
    color .18s ease, opacity .18s ease, transform .18s ease;
}
[data-hover]:focus-visible { outline: 2px solid ${colors.brand}; outline-offset: 2px; }

/* A game screen loads straight into the task: one quick fade, no sections sliding in one by one. */
@keyframes rise { from { opacity: .6; } }
[data-rise] { animation: rise .15s ease-out both; }

@keyframes glow { 35% { text-shadow: 0 0 18px rgba(217, 181, 106, .85), 0 0 2px rgba(217, 181, 106, .6); } }
[data-glow] { animation: glow 1.8s ease-out 1; }

@keyframes tape { to { transform: translateX(-50%); } }
[data-tape] { animation: tape 70s linear infinite; }
[data-news] { animation: tape 130s linear infinite; }
[data-tape]:hover, [data-news]:hover { animation-play-state: paused; }

@keyframes breathe { 50% { opacity: .35; } }
[data-breathe] { animation: breathe 1.4s ease-in-out infinite; }

@media (hover: hover) {
  ${on('solid')} { background-color: ${colors.brandBright} !important; box-shadow: 0 6px 22px rgba(217, 181, 106, .22); }
  ${on('quiet')} { background-color: ${colors.raised} !important; border-color: ${colors.faint} !important; }
  ${idle('segment')} { background-color: ${colors.raised} !important; }
  ${idle('segment')} * { color: ${colors.ink} !important; }
  ${on('row')} { background-color: ${colors.raised} !important; }
  ${on('row')} [data-hover-part="name"] { color: ${colors.brandBright} !important; }
  ${on('line')} { background-color: ${colors.raised}; }
  ${on('buy')} { background-color: ${colors.brand} !important; border-color: ${colors.brand} !important; }
  ${on('buy')} * { color: ${colors.onBrand} !important; }
  ${idle('lift')} { border-color: ${colors.brand} !important; transform: translateY(-2px); }
  ${on('link')} * , ${on('link')} { color: ${colors.brandBright} !important; }
  ${on('deep')} { opacity: .8; }
  ${idle('tab')} { border-bottom-color: ${colors.faint} !important; }
  ${idle('tab')} * { color: ${colors.ink} !important; }
  input:hover { border-color: ${colors.faint} !important; }
}

@media (prefers-reduced-motion: reduce) {
  [data-hover], [data-hover] *, input { transition: none; }
  [data-hover]:hover { transform: none !important; }
  [data-rise], [data-tape], [data-news], [data-breathe], [data-glow] { animation: none; }
}
`;
