# Branding & Rainbow Theme — Design Document

**Status:** Shipped on `main`, 2026-07-08.

## Motivation

The app's original visual identity was a single purple accent color and an abstract
placeholder favicon — functional, but generic, requested to get "some pop" once a real
hand-drawn logo was supplied. The brief was open-ended ("adjust colours to match a
rainbow theme"), so the design decisions below are about translating that into something
concrete and consistent rather than following an existing spec.

## The logo: processing, not just importing

The supplied artwork was a JPEG on a white/near-white background. Two problems with
using it as-is: it wouldn't sit cleanly on the app's dark theme, and a rectangular white
box is a poor favicon.

- **Transparency, not just cropping:** a flood-fill script (starting from the image's
  corners, walking contiguous near-white pixels) turned the background transparent
  without eating into interior whites (highlights, the character's paper, a clock face)
  that aren't contiguous with the outer background. A naive "make all white pixels
  transparent" approach would have punched holes in the artwork itself.
- **Favicon:** a separate tight crop of just the circular badge (excluding the wordmark
  below it), same transparency treatment, resized down to standard favicon/apple-touch
  sizes.
- **File size:** the source JPEG's compression noise produced a very large PNG once
  transparency was added (many near-duplicate colors from JPEG artifacting). Palette
  quantization (reduced to 64 colors) cut the file size substantially with no visible
  quality loss for a mostly-flat cartoon illustration.

## The rainbow palette: sampled from the artwork, not invented

The logo's hammer holds a rainbow-striped handle. Rather than pick six arbitrary "rainbow"
colors, the six accent colors (`--rb1` through `--rb6`) were sampled directly from that
handle, so the UI's rainbow accents visually trace back to the actual logo rather than
being a generic rainbow that happens to share the same name. Light and dark variants
were tuned separately (not just the same hex values against a different background) so
each stays legible on its own surface.

**Used decoratively only, never as text color:** a rainbow color sitting on a light
surface frequently fails WCAG contrast for actual text — computed directly rather than
assumed (`--rb3` yellow against white surface came out around 2:1, well under the 4.5:1
minimum). The rainbow colors are confined to non-text uses: a top accent bar and matching
tinted icon badge cycling per tool card, a gradient ring around the energy pill, the
now-playing equalizer bars, and dividers under page headings. Anywhere a rainbow color
needed to *be* text (e.g. the Reminders list's "Warning:" label, sampled from `--rb3`),
it was deliberately darkened for light mode specifically to pass contrast, with the
brighter original value kept for dark mode where it already had enough contrast against
a dark surface.

## The grounding accent: purple → teal

A rainbow theme still needs one consistent color for actual interactive elements
(buttons, links, focus rings) — an "everything is a different color" UI would be chaotic,
not lively. The single `--accent` moved from a generic purple to a teal sampled from the
logo's own wordmark text color, so the app's one "brand color" is literally from the
logo, with a secondary `--accent-2` (a darkened burnt orange, from the logo's tagline
text) used sparingly for things like Call Script's field labels. Both were checked for
contrast against their paired background/text combinations before use, the same
discipline applied to the rainbow colors.

## Layout: iterated live, not planned in one pass

The header (logo + subtitle) went through two rounds of direct feedback in the same
session: the logo was enlarged 10% and moved onto the same row as the subtitle text
(originally stacked, then combined) specifically because the first version read as "too
small" and "the subtitle isolated on its own line." Both changes were verified with
actual Playwright screenshots of the rendered result in both light and dark themes before
being called done, rather than trusted from reading the CSS — this project's general
practice for any UI change, but worth calling out here since the header specifically
needed two passes to get right.

## Testing approach

No unit-testable logic here (this is CSS and static assets) — verification was entirely
visual: Playwright screenshots of Home and representative tool pages in both `light` and
`dark` `prefers-color-scheme`, checked after each iteration, not just once at the end.
`npm run verify` (lint/typecheck/build/test) confirms nothing broke functionally, but
doesn't and can't confirm the actual visual result — that's the reason the screenshot
step exists as a distinct, required part of this kind of change.
