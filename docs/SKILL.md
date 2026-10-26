---
name: human-crafted-ui
description: Use whenever building or restyling any UI (panels, dashboards, forms, components, pages). Produces soft, rounded, hand-crafted-looking interfaces and avoids the typical "AI-generated" look. Apply before writing any markup or CSS.
---

# Human-Crafted UI

Goal: the interface must look like a careful human designer made it: soft, rounded, calm, consistent, with small considered details. It must NOT look like default AI output.

## 0. Process (mandatory)

1. Before writing code, write a short design brief (5 lines max): product mood (e.g. "calm, warm, friendly"), ONE accent color, font pair, radius scale, density (compact / comfortable).
2. Define design tokens FIRST (CSS variables or Tailwind theme). Never hardcode colors, radii, shadows or spacing in components.
3. Build, then run the checklist in section 9 and fix violations before finishing.

## 1. The "AI tells" — NEVER do these

- Purple/indigo/blue-to-violet gradients, or any gradient as the main brand look.
- Gradient text on headings.
- Glassmorphism / backdrop-blur on every card; neon glows; colored glowing shadows.
- Emojis used as icons or decoration (🚀 ✨ 📊 👋). Use a real icon set instead.
- Cards with a thick colored left border, or every card having an icon-in-a-colored-circle on top.
- Rows of 3–4 identical stat cards with big number + tiny green "+12%" arrow as the default dashboard opening.
- Everything centered; perfectly symmetric hero layouts.
- Pure black (#000) text on pure white (#fff) background; pure gray (#808080) palettes.
- Default Tailwind blue-500 / indigo-600 buttons; default Inter-only typography with no hierarchy.
- Generic copy: "Welcome back 👋", "Unlock the power of…", "Seamless", "Elevate", "Revolutionize", "Streamline your workflow". Lorem ipsum or "John Doe / Acme Inc".
- Sharp 1px gray borders on every element (boxy, spreadsheet look).
- Same border-radius on everything, or random mixed radii.
- Hover effects that only scale(1.05) everything. Bouncy animations on everything.
- Over-badging: colored pill badges on every row.

## 2. Shape language: smooth and round

- Use ONE radius scale and nest it correctly (inner radius = outer radius − padding):
  - `--r-xs: 8px` (inputs inside dense areas, small chips)
  - `--r-sm: 12px` (buttons, inputs)
  - `--r-md: 16px` (cards, dropdowns)
  - `--r-lg: 24px` (panels, modals, large containers)
  - `--r-pill: 999px` (tags, toggles, segmented controls, avatars)
- Prefer soft surfaces over borders: separate areas with background tone differences and whitespace first; use a hairline border (1px at ~6–10% opacity of the text color) only when needed.
- Use `corner-shape: squircle` / superellipse-like feel where supported; otherwise generous radii are fine.
- Icons: rounded stroke style (Lucide, Phosphor "regular/rounded", Tabler with round caps). Stroke 1.5–1.75px, round line caps and joins. One icon family only.
- Avatars, toggles, progress bars, and scrollbars are fully rounded. Style the scrollbar (thin, rounded thumb, transparent track).

## 3. Color

- Neutral base is slightly warm or slightly tinted toward the accent (never pure gray). Example light: bg `#F6F4F0`, surface `#FFFFFF`, surface-2 `#FBFAF8`, text `#23211E`, muted `#7A756D`.
- Example dark: bg `#161513`, surface `#1F1E1B`, surface-2 `#272521`, text `#EDEAE4`, muted `#9A958B`. Never pure black.
- ONE accent color, used sparingly (primary button, active nav item, focus ring, key data). Pick something with character (terracotta, forest green, ink blue, muted plum, saffron), NOT default indigo/violet.
- Status colors (success/warn/danger) are desaturated and always used as a soft tinted background + darker text of the same hue, not solid bright fills.
- Contrast: body text ≥ 4.5:1. Check both themes.
- Support dark mode through tokens only.

## 4. Typography

- Two fonts max: a characterful sans for UI (e.g. DM Sans, Manrope, Plus Jakarta Sans, Figtree, Geist, Onest) and optionally one display/serif for headings (e.g. Fraunces, Instrument Serif, Newsreader). Do not default to Inter/Roboto/system-only for everything.
- Use a clear scale: 12 / 13 / 14 / 16 / 20 / 28 / 40. Body in panels is 14px.
- Weights: mostly 400 and 500; 600 for headings. Avoid 700–900 everywhere.
- Tight tracking on large headings (`letter-spacing: -0.02em`), slightly open on small uppercase labels (`0.04em`), and use uppercase labels rarely.
- Numbers in tables/stats: `font-variant-numeric: tabular-nums`.
- Line-height: 1.5 body, 1.15–1.25 headings.

## 5. Layout, spacing, depth

- 4px base spacing scale (4, 8, 12, 16, 20, 24, 32, 48, 64). Generous padding inside containers (16–24px). Whitespace is a feature.
- Break symmetry on purpose: vary card sizes, use an asymmetric grid (e.g. 2/3 + 1/3), let one primary area dominate. Avoid walls of equal cards.
- Establish hierarchy: one clear primary focus per screen, secondary info visually quieter.
- Shadows: soft, layered, low-opacity, neutral-tinted (never colored glow). Example:
  `--shadow-sm: 0 1px 2px rgb(30 25 20 / .06), 0 1px 1px rgb(30 25 20 / .04);`
  `--shadow-md: 0 4px 12px rgb(30 25 20 / .07), 0 1px 3px rgb(30 25 20 / .05);`
  `--shadow-lg: 0 16px 40px rgb(30 25 20 / .10), 0 4px 10px rgb(30 25 20 / .05);`
  Use shadows only for elevation (popovers, modals, floating); resting cards use tone, not shadow.
- Sidebars/panels: no heavy dividers; use spacing and subtle surface changes. Active nav item = soft tinted rounded pill, not a full-width saturated bar.
- Tables: no zebra stripes by default, no full grid lines; use row hover tint, comfortable row height (44–52px), rounded container.

## 6. Motion and interaction

- Duration 150–250ms; easing `cubic-bezier(.2, .8, .2, 1)` (smooth out) for enter, `cubic-bezier(.4, 0, .2, 1)` for state changes.
- Animate transform/opacity only. Subtle: 2–4px translate, 0.98 press scale on buttons, background tint on hover.
- Staggered fade-up on first load for lists (30–40ms steps), once only.
- Respect `prefers-reduced-motion`.
- Every interactive element has all states designed: default, hover, active/pressed, focus-visible (rounded 2px ring in accent at ~40% opacity + offset), disabled, loading.
- Also design: empty state (short friendly sentence + one action, optional simple illustration), loading skeletons (rounded, gently shimmering), error state (specific message + how to fix).

## 7. Content and data realism

- Write specific, plain, human copy in the app's language. Short labels. Sentence case. No exclamation marks spam, no marketing fluff inside a tool.
- Use realistic placeholder data: believable names, uneven numbers (₺1.284,50 not 1000), mixed lengths, real dates. Respect locale formats (tr-TR: `26 Eki 2026`, `1.284,50 ₺`).
- Show imperfection like real products: truncation with ellipsis, long names, zero values, partial data.

## 8. Small details that read as "made by a person"

- Optical alignment: icons visually centered with text; consistent icon size (16/18/20).
- Slight tonal differences between nested surfaces (page → panel → card → input).
- Inputs: filled soft background (surface-2), rounded `--r-sm`, border appears on focus; labels above, helper text below, 40–44px height.
- Buttons: primary (accent fill), secondary (soft tinted fill), ghost. Max one primary per view. Height 36–40px, horizontal padding 14–18px, weight 500.
- Toasts, tooltips, and popovers use `--r-md`, shadow-lg, short text.
- Custom selection color, custom focus ring, custom scrollbar, `accent-color` on native controls.
- One tasteful "signature" touch per product (e.g. a subtle paper grain at 3% opacity, a hand-drawn underline on the active tab, a distinctive empty-state illustration style). Keep it restrained.

## 9. Final checklist (run before finishing)

- [ ] No gradient text, no purple/indigo default look, no glow, no emoji icons.
- [ ] All colors, radii, shadows, spacing come from tokens.
- [ ] One accent color; neutrals are warm/tinted; no pure black/white pairing.
- [ ] Radius scale applied consistently with correct nesting; pills only where intended.
- [ ] One icon family, rounded stroke, consistent size.
- [ ] Two fonts max; clear type hierarchy; tabular numbers where needed.
- [ ] Layout is not a grid of identical cards; one clear focal area.
- [ ] Hover, focus-visible, active, disabled, loading, empty, error states exist.
- [ ] Copy is specific and human; data looks real.
- [ ] Works in light and dark, at mobile and desktop widths, with reduced motion.

## Starter tokens

```css
:root {
  --bg: #F6F4F0;
  --surface: #FFFFFF;
  --surface-2: #FBFAF8;
  --text: #23211E;
  --muted: #7A756D;
  --line: rgb(35 33 30 / .08);
  --accent: #C2603E;          /* change per product; avoid default indigo */
  --accent-soft: rgb(194 96 62 / .12);

  --r-xs: 8px; --r-sm: 12px; --r-md: 16px; --r-lg: 24px; --r-pill: 999px;

  --shadow-sm: 0 1px 2px rgb(30 25 20 / .06), 0 1px 1px rgb(30 25 20 / .04);
  --shadow-md: 0 4px 12px rgb(30 25 20 / .07), 0 1px 3px rgb(30 25 20 / .05);
  --shadow-lg: 0 16px 40px rgb(30 25 20 / .10), 0 4px 10px rgb(30 25 20 / .05);

  --ease-out: cubic-bezier(.2, .8, .2, 1);
  --font-ui: "DM Sans", system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161513; --surface: #1F1E1B; --surface-2: #272521;
    --text: #EDEAE4; --muted: #9A958B; --line: rgb(237 234 228 / .08);
  }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```