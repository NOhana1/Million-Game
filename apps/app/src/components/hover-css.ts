// Hover and keyboard-focus looks for the web build. An element opts in with hover('kind') from
// ui.tsx. "(hover: hover)" keeps a hover from sticking after a tap on a phone.

import { colors } from './palette';

const on = (kind: string) => `[data-hover="${kind}"]:not([aria-disabled="true"]):hover`;
const idle = (kind: string) =>
  `[data-hover="${kind}"]:not([aria-disabled="true"]):not([aria-selected="true"]):hover`;

export const HOVER_CSS = `
[data-hover], [data-hover] *, input {
  transition: background-color .16s ease, border-color .16s ease, box-shadow .16s ease,
    color .16s ease, opacity .16s ease, transform .16s ease;
}
[data-hover]:focus-visible { outline: 2px solid ${colors.brass}; outline-offset: 2px; }
[data-hover]:active { transform: translateY(0); }

@media (hover: hover) {
  ${on('solid')} { background-color: ${colors.deepSoft} !important; box-shadow: 0 2px 8px rgba(15, 43, 36, .22); }
  ${on('quiet')} { background-color: ${colors.page} !important; border-color: ${colors.muted} !important; }
  ${idle('segment')} { background-color: ${colors.brandSoft} !important; }
  ${idle('segment')} * { color: ${colors.ink} !important; }
  ${on('row')} { background-color: ${colors.page} !important; }
  ${on('row')} [data-hover-part="buy"] { background-color: ${colors.brand}; border-color: ${colors.brand} !important; }
  ${on('row')} [data-hover-part="buy"] * { color: #FFFFFF !important; }
  ${on('line')} { background-color: ${colors.page}; }
  ${idle('lift')} { border-color: ${colors.brass} !important; box-shadow: 0 3px 10px rgba(15, 43, 36, .09); transform: translateY(-1px); }
  ${on('link')} * , ${on('link')} { color: ${colors.ink} !important; text-decoration-line: underline; }
  ${on('deep')} { opacity: .82; }
  ${idle('tab')} { background-color: rgba(255, 255, 255, .05); border-bottom-color: ${colors.brass} !important; }
  ${idle('tab')} * { color: #FFFFFF !important; }
  input:hover { border-color: ${colors.muted} !important; }
}

@media (prefers-reduced-motion: reduce) {
  [data-hover], [data-hover] *, input { transition: none; }
  [data-hover]:hover { transform: none !important; }
}
`;
