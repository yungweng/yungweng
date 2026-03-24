#!/usr/bin/env bun
/**
 * Generates an animated SVG of the LetterGrid "EINFACH MACHEN" animation.
 * Letters grow/shrink with the Lissajous idle wave — the signature stretchy effect.
 *
 * Each letter is pre-rendered at discrete heights (MIN_H..MAX_H).
 * SMIL <animate> switches visibility between height variants per frame.
 *
 * Run: bun run generate-svg.ts
 * Output: assets/lettergrid.svg
 */

import { writeFileSync } from "node:fs";

// ── Font ────────────────────────────────────────────────────────
interface LetterDef {
  topCap: string[];
  body: string;
  bottomCap: string[];
  midBar?: string[];
  upperBody?: string;
}

const FONT: Record<string, LetterDef> = {
  A: {
    topCap: [".XXXX.", "XXXXXX"],
    body: "XX..XX",
    midBar: ["XXXXXX", "XXXXXX"],
    bottomCap: ["XX..XX"],
  },
  B: {
    topCap: ["XXXXX.", "XXXXXX"],
    body: "XX..XX",
    midBar: ["XXXXXX", "XXXXXX"],
    bottomCap: ["XXXXXX", "XXXXX."],
  },
  C: {
    topCap: [".XXXX.", "XXXXXX", "XX..XX"],
    body: "XX....",
    bottomCap: ["XX..XX", "XXXXXX", ".XXXX."],
  },
  D: {
    topCap: ["XXXXX.", "XXXXXX"],
    body: "XX..XX",
    bottomCap: ["XXXXXX", "XXXXX."],
  },
  E: {
    topCap: [".XXXXX", "XXXXXX"],
    body: "XX....",
    midBar: ["XXXXX.", "XXXXX."],
    bottomCap: ["XXXXXX", ".XXXXX"],
  },
  F: {
    topCap: [".XXXXX", "XXXXXX"],
    body: "XX....",
    midBar: ["XXXXX.", "XXXXX."],
    bottomCap: ["XX....", "XX...."],
  },
  G: {
    topCap: [".XXXX.", "XXXXXX", "XX..XX"],
    body: "XX....",
    midBar: [".XXXXX", ".XXXXX"],
    bottomCap: ["XX..XX", "XXXXXX", ".XXXX."],
  },
  H: {
    topCap: ["XX..XX"],
    body: "XX..XX",
    midBar: ["XXXXXX", "XXXXXX"],
    bottomCap: ["XX..XX"],
  },
  I: {
    topCap: ["XXXXXX", "XXXXXX"],
    body: "..XX..",
    bottomCap: ["XXXXXX", "XXXXXX"],
  },
  N: {
    topCap: ["XX..XX"],
    body: "XX..XX",
    midBar: ["XXX.XX", "XXXXXX", "XX.XXX"],
    bottomCap: ["XX..XX"],
  },
  M: {
    topCap: ["X....X", "XX..XX", "XXXXXX", "XXXXXX"],
    body: "XX..XX",
    bottomCap: [],
  },
};

const COLS = 7;
const SHADOW_DY = 1;

// ── Layout ──────────────────────────────────────────────────────
const words = ["EINFACH", "MACHEN"];
const offsets = [0, 4];
const totalCols = 49;

// ── Physics ─────────────────────────────────────────────────────
const MIN_H = 8;
const MAX_H = 18;
const SIGMA_X = 0.22;
const SIGMA_Y = 0.55;
const IDLE_PERIOD = 6000;
const IDLE_BLEND = 0.45;
const WORD_GAP = 2;

// ── Animation ───────────────────────────────────────────────────
const NUM_FRAMES = 36; // frames per cycle
const DURATION_S = 6;

// ── SVG sizing ──────────────────────────────────────────────────
const CELL_SIZE = 6;
const CELL_GAP = 1;
const CELL_STEP = CELL_SIZE + CELL_GAP;

// ── Pattern generation ──────────────────────────────────────────
function generatePattern(ch: string, height: number): { data: Int8Array; rows: number } {
  const def = FONT[ch];
  if (!def) return { data: new Int8Array(0), rows: 0 };

  const { topCap, body, bottomCap } = def;
  const midBar = def.midBar || [];
  const upper = def.upperBody || body;

  const fixed = topCap.length + midBar.length + bottomCap.length;
  const minBody = midBar.length > 0 ? 2 : 1;
  const h = Math.max(height, fixed + minBody);

  const rowStrs: string[] = [];
  for (const r of topCap) rowStrs.push(r);

  if (midBar.length > 0) {
    const bodyTotal = h - fixed;
    const upperCount = Math.ceil(bodyTotal / 2);
    const lowerCount = bodyTotal - upperCount;
    for (let i = 0; i < upperCount; i++) rowStrs.push(upper);
    for (const r of midBar) rowStrs.push(r);
    for (let i = 0; i < lowerCount; i++) rowStrs.push(body);
  } else {
    const bodyTotal = h - fixed;
    for (let i = 0; i < bodyTotal; i++) rowStrs.push(body);
  }

  for (const r of bottomCap) rowStrs.push(r);

  const totalRows = rowStrs.length + SHADOW_DY;
  const data = new Int8Array(totalRows * COLS);

  for (let r = 0; r < rowStrs.length; r++) {
    for (let c = 0; c < 6 && c < rowStrs[r].length; c++) {
      if (rowStrs[r][c] === "X") {
        data[r * COLS + c] = 1;
      }
    }
  }

  // Shadow cells
  for (let r = 0; r < rowStrs.length; r++) {
    for (let c = 0; c < COLS; c++) {
      if (data[r * COLS + c] !== 1) continue;
      for (const [dr, dc] of [
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < totalRows && nc < COLS && data[nr * COLS + nc] === 0) {
          data[nr * COLS + nc] = 2;
        }
      }
    }
  }

  return { data, rows: totalRows };
}

// ── Build letter info ───────────────────────────────────────────
interface LetterInfo {
  char: string;
  wordIdx: number;
  letterIdx: number;
  startCol: number;
  centerX: number;
}

const letterInfos: LetterInfo[][] = words.map((word, wi) => {
  let col = offsets[wi];
  return [...word].map((ch, li) => {
    const info: LetterInfo = {
      char: ch,
      wordIdx: wi,
      letterIdx: li,
      startCol: col,
      centerX: (col + 3) / totalCols,
    };
    col += COLS;
    return info;
  });
});

// ── Lissajous focus ─────────────────────────────────────────────
function lissajousFocus(t: number): [number, number] {
  const angle = (t / IDLE_PERIOD) * Math.PI * 2;
  const fx = (Math.sin(angle - Math.PI / 2) + 1) / 2;
  const fy = ((Math.sin(2 * angle) + 1) / 2) * (words.length - 1);
  return [fx, fy];
}

// ── Compute letter height at a given focus position ─────────────
function letterHeight(centerX: number, wordIdx: number, fx: number, fy: number): number {
  const sx = (centerX - fx) / SIGMA_X;
  const sy = (wordIdx - fy) / SIGMA_Y;
  const gaussian = Math.exp(-0.5 * (sx * sx + sy * sy));
  return MIN_H + (MAX_H - MIN_H) * gaussian * IDLE_BLEND;
}

// ── Pre-compute heights per letter per frame ────────────────────
// heights[wi][li][frame] = integer height
const heights: number[][][] = letterInfos.map((wordLetters) =>
  wordLetters.map((letter) => {
    const h: number[] = [];
    for (let f = 0; f <= NUM_FRAMES; f++) {
      const t = (f / NUM_FRAMES) * IDLE_PERIOD;
      const [fx, fy] = lissajousFocus(t);
      h.push(Math.round(letterHeight(letter.centerX, letter.wordIdx, fx, fy)));
    }
    h[NUM_FRAMES] = h[0]; // loop
    return h;
  }),
);

// ── Find max rows at MAX_H for grid sizing ──────────────────────
const maxRowsPerWord = [0, 0];
for (const wordLetters of letterInfos) {
  for (const letter of wordLetters) {
    const { rows } = generatePattern(letter.char, MAX_H);
    if (rows > maxRowsPerWord[letter.wordIdx]) {
      maxRowsPerWord[letter.wordIdx] = rows;
    }
  }
}

const gridW = totalCols * CELL_STEP - CELL_GAP;
const totalGridRows = maxRowsPerWord[0] + WORD_GAP + maxRowsPerWord[1];
const gridH = totalGridRows * CELL_STEP - CELL_GAP;

const PADDING = 12;
const svgW = gridW + PADDING * 2;
const svgH = gridH + PADDING * 2;

// ── Generate SVG ────────────────────────────────────────────────
const svgParts: string[] = [];

svgParts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">`,
);

// ── Defs: star and shadow tile symbols ──────────────────────────
svgParts.push(`<defs>`);
const s = CELL_SIZE;
const cxS = s / 2;
const cyS = s / 2;
const starR = s * 0.38;
const innerR = s * 0.08;
const dotR = s * 0.055;
const lw = Math.max(0.5, s * 0.09);

let starPath = "";
for (let i = 0; i < 4; i++) {
  const a = (i * Math.PI) / 4;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x1 = cxS - cos * starR + cos * innerR;
  const y1 = cyS - sin * starR + sin * innerR;
  const x2 = cxS + cos * starR - cos * innerR;
  const y2 = cyS + sin * starR - sin * innerR;
  starPath += `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`;
}

let dotCircles = "";
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4;
  const dx = cxS + Math.cos(a) * starR;
  const dy = cyS + Math.sin(a) * starR;
  dotCircles += `<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="${dotR.toFixed(2)}"/>`;
}

svgParts.push(
  `<symbol id="star" viewBox="0 0 ${s} ${s}">` +
    `<path d="${starPath}" stroke="inherit" stroke-width="${lw.toFixed(2)}" stroke-linecap="round" fill="none"/>` +
    `<g fill="inherit">${dotCircles}` +
    `<circle cx="${cxS}" cy="${cyS}" r="${(dotR * 1.3).toFixed(2)}"/>` +
    `</g></symbol>`,
);

const sm = s * 0.22;
svgParts.push(
  `<symbol id="shadow" viewBox="0 0 ${s} ${s}">` +
    `<line x1="${(s - sm).toFixed(2)}" y1="${sm.toFixed(2)}" x2="${sm.toFixed(2)}" y2="${(s - sm).toFixed(2)}" ` +
    `stroke="inherit" stroke-width="${lw.toFixed(2)}" stroke-linecap="round"/>` +
    `</symbol>`,
);

svgParts.push(`</defs>`);

// ── Render letters with height animation ────────────────────────
// Strategy: For each letter, find all unique heights across frames.
// Create a <g> per height variant with all cells at that height.
// Use SMIL <animate> on visibility to show the right variant per frame.

const COLOR_LIGHT = "#2e4a3a";
const COLOR_DARK = "#7db895";

// Use CSS class + prefers-color-scheme for light/dark mode
svgParts.push(`<style>`);
svgParts.push(`.cell { stroke: ${COLOR_LIGHT}; fill: ${COLOR_LIGHT}; }`);
svgParts.push(`@media (prefers-color-scheme: dark) { .cell { stroke: ${COLOR_DARK}; fill: ${COLOR_DARK}; } }`);
svgParts.push(`</style>`);

for (const wordLetters of letterInfos) {
  for (const letter of wordLetters) {
    const { wordIdx, letterIdx, startCol, char: ch } = letter;
    const frameHeights = heights[wordIdx][letterIdx];

    // Get unique heights
    const uniqueHeights = [...new Set(frameHeights)].sort((a, b) => a - b);

    // Word Y offset
    let wordY = 0;
    if (wordIdx > 0) {
      wordY = (maxRowsPerWord[0] + WORD_GAP) * CELL_STEP;
    }

    for (const h of uniqueHeights) {
      const { data, rows } = generatePattern(ch, h);

      // Bottom-align within word band
      const wordMaxRows = maxRowsPerWord[wordIdx];
      const letterTopOffset = (wordMaxRows - rows) * CELL_STEP;

      // Build visibility values: "visible" when this height matches, "hidden" otherwise
      const visValues = frameHeights.map((fh) => (fh === h ? "visible" : "hidden")).join(";");

      // Build keyTimes: evenly spaced
      const keyTimes = frameHeights.map((_, i) => (i / NUM_FRAMES).toFixed(4)).join(";");

      svgParts.push(`<g class="cell" visibility="hidden">`);
      svgParts.push(
        `<animate attributeName="visibility" values="${visValues}" keyTimes="${keyTimes}" dur="${DURATION_S}s" repeatCount="indefinite" calcMode="discrete"/>`,
      );

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = data[r * COLS + c];
          if (val === 0) continue;
          const px = PADDING + (startCol + c) * CELL_STEP;
          const py = PADDING + wordY + letterTopOffset + r * CELL_STEP;
          const symbolId = val === 1 ? "star" : "shadow";
          svgParts.push(`<use href="#${symbolId}" x="${px}" y="${py}" width="${s}" height="${s}"/>`);
        }
      }

      svgParts.push(`</g>`);
    }
  }
}

svgParts.push(`</svg>`);

const svg = svgParts.join("\n");
writeFileSync("assets/lettergrid.svg", svg);

// Stats
let totalGroups = 0;
let totalCells = 0;
for (const wordLetters of letterInfos) {
  for (const letter of wordLetters) {
    const uniqueH = new Set(heights[letter.wordIdx][letter.letterIdx]);
    totalGroups += uniqueH.size;
    for (const h of uniqueH) {
      const { data, rows } = generatePattern(letter.char, h);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          if (data[r * COLS + c] !== 0) totalCells++;
        }
      }
    }
  }
}

console.log(`Generated assets/lettergrid.svg`);
console.log(`  ${totalGroups} height variants, ${totalCells} total cells`);
console.log(`  ${svgW}×${svgH} viewBox, ${NUM_FRAMES} frames, ${DURATION_S}s loop`);
console.log(`  File size: ${(svg.length / 1024).toFixed(1)} KB`);
