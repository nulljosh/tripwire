# Tripwire brand kit and design system

a drifting wire

## The mark
One bold flat white glyph on an accent gradient tile. No text, no outline, no emblem.

- `../Tripwire.icon` is the source of truth (Icon Composer). Light and dark fills are set in it.
- `../icon.svg` is the flat copy for READMEs (shown at 80 px). `icon-1024.png` is the App Store icon, no alpha.
- `mark.svg` is the glyph alone in `currentColor` for your own background.
- Clear space equal to the width of the glyph's thickest stroke. Smallest size 16 px.

## Colour
One accent, flat surfaces, no gradients except the icon tile. The landing wears the house layout Hermes set: a thin red frame, full-bleed red bands, and tripwire's own diff cards as band art.

| Role | Light | Dark |
|---|---|---|
| Accent (actions, links, bands) | `#b3122f` | `#ff7088` links, `#c8193a` buttons, `#8c0d24` bands |
| Icon tile | `#f5405f` to `#b3122f` | same |
| Background | `#fdfdfd` | `#110a0b` |
| Surface | `#f5f3f4` | `#1d1416` |
| Line | `#e3dddf` | `#35262a` |
| Text | `#1a1a1a` | `#f5f2f3` |
| Secondary text | `#5d5a5c` | `#b1a6a9` |
| Added / removed in diffs | `#1a7f37` / `#c0392b` | `#4caf6e` / `#ff6b6b` |

Never brown, beige, purple or teal. `tokens.css` here and `web/tokens.css` are the same file.

## Type
The system font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", Lato, "Helvetica Neue", Helvetica, Arial, sans-serif`. Scale 34/41 bold, 22/28, 17/24, 15/20, 13/18.

## Space and shape
- Space on the 8 point grid: 4, 8, 12, 16, 24, 32, 48. Side margin 20. Reading column 680.
- Radii: cards 28, grouped lists 20, landing buttons and panels 2, icon 22 percent.
- Controls are 48 points tall capsules, one height in a row. Focus is a 4 point ring at 30 percent accent.
- Motion is 0.2 s ease and honours reduced motion.

`tokens.css` holds the app's accent. Everything else comes from the shared token file.
