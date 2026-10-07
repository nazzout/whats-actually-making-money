# Project rules

## iOS Safari: status bar and bottom toolbar must always stay clear (DO NOT REGRESS)
On iPhone/iPad, the status bar (clock area) and Safari's bottom toolbar must always show the page through them, on Explore AND Board, including after switching between them. The Explore/Board glass toggle must never pick up a white tint. This is final; do not change it.

iOS Safari 26 paints a solid strip behind the status bar/toolbar whenever a fixed element roughly 80%+ of the screen wide (with or without visible background, even `visibility:hidden`) sits at the top or bottom edge. So:
- Never add a full-width (or near full-width) `position:fixed` element at the top or bottom on phones/iPads. Hidden is not enough; it must be `display:none` or not in the DOM.
- Keep the current mechanics in `app/globals.css` untouched: `.nav{display:contents}` on touch devices with individually fixed pills, `#explore` not fixed on touch devices, `--peek` + `pinExplore` (in `components/app/legacy-app.js`), and `#explore{height:calc(100% + var(--peek))}`.
- Do not add `html` background colors or change `#explore`/`html`/`body` heights (`dvh`/`lvh`/`min-height`) without testing on a real iPhone.
- Third-party widgets/scripts (e.g. Ko-fi) must not inject fixed edge bars. Ko-fi's floating wrappers stay `display:none!important`, and the Ko-fi script only loads when the footer is near view (`components/SupportKofi.tsx`), never on Explore.
- Any change touching fixed elements, the nav, Explore sizing, or third-party scripts must be checked on an iPhone (Board, Explore, and switching back and forth) before pushing.
