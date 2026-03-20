# Animated LetterGrid SVG — How It Works

The `generate-svg.ts` script ports the interactive LetterGrid canvas component from [yannickwenger.de](https://yannickwenger.de) into a pure SVG with SMIL animations — no JavaScript needed. This makes it work in GitHub profile READMEs, which strip all scripts.

## The Problem

The original LetterGrid is a 720-line React canvas component with spring physics, mouse tracking, and `requestAnimationFrame`. GitHub READMEs allow no JavaScript — only static markup. But SVG with SMIL `<animate>` elements does work.

## The Approach: Visibility-Switching

### 1. Font + Layout — Ported 1:1

The bitmap font definitions (each letter as `"XX..XX"` row patterns), `generatePattern()`, and the grid layout come directly from `letter-grid.tsx` in the yannickwenger.de repo. Each letter is 7 columns wide (6 pattern + 1 gap), with `topCap`, `body`, `midBar`, and `bottomCap` sections that stretch based on height.

### 2. Lissajous Path — Pre-Computed

The idle animation on the website moves an invisible focus point in a figure-eight pattern (`sin(t)` for X, `sin(2t)` for Y). The script samples this path at 36 evenly spaced time points across a 6-second cycle.

### 3. Height Per Letter Per Frame — Gaussian Distance

For each of the 13 letters at each frame, the target height is computed via a Gaussian distribution: letters near the focus point grow to `MAX_H=18`, letters far away shrink to `MIN_H=8`. This is the same math as the original component.

```
gaussian = exp(-0.5 * ((centerX - focusX) / SIGMA_X)² + ((wordIdx - focusY) / SIGMA_Y)²))
height   = MIN_H + (MAX_H - MIN_H) * gaussian * IDLE_BLEND
```

### 4. Multiple Height Variants Per Letter

Each letter gets pre-rendered at every unique integer height it reaches across all frames. For example, the letter "E" might need variants at heights 8, 9, 10, 11, and 12. Each variant is a separate `<g>` group containing all the star/shadow cells at that height.

### 5. SMIL Discrete Animation

Each `<g>` group has an `<animate attributeName="visibility">` that switches between `visible` and `hidden` per frame using `calcMode="discrete"`. At any given moment, exactly one height variant per letter is visible:

```xml
<g class="cell" visibility="hidden">
  <animate attributeName="visibility"
    values="hidden;hidden;visible;visible;hidden;..."
    keyTimes="0;0.0278;0.0556;0.0833;0.1111;..."
    dur="6s" repeatCount="indefinite" calcMode="discrete"/>
  <use href="#star" x="12" y="19" width="6" height="6"/>
  ...
</g>
```

### 6. Star/Shadow Tiles as Reusable Symbols

The asterisk tiles (8-pointed star with dots) and shadow tiles (diagonal line) are each defined once as a `<symbol>` and referenced everywhere via `<use>`. This keeps the file size manageable despite 4000+ cell instances.

### 7. Dark Mode via CSS

A `<style>` block with `@media (prefers-color-scheme: dark)` switches the cell color between `#2e4a3a` (moss green for light) and `#7db895` (light green for dark). GitHub respects this in rendered SVGs.

## What's Preserved

- The Lissajous figure-eight wave pattern
- Letters growing/shrinking with proper body-row stretching
- The pixel-art bitmap font with star and shadow tiles
- Bottom-aligned letters within word bands
- Light/dark mode color adaptation

## What's Lost

- Spring physics (no soft easing/overshoot — discrete height steps instead)
- Mouse/touch interaction
- Scramble animation on language switch
- Smooth interpolation between heights (steps between integer values)

## Stats

- **65** height variant groups across 13 letters
- **4205** total cell instances (via `<use>`)
- **36** animation frames over a **6-second** loop
- **~280 KB** file size
- **2 symbols** reused everywhere (star + shadow)

## Usage

```bash
bun run generate-svg.ts
```

Outputs `assets/lettergrid.svg`. Tweak constants at the top of the script to adjust cell size, frame count, animation duration, or physics parameters.
