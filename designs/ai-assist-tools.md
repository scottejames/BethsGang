# AI-Assist Tools — Design Document

**Status:** All shipped and on `main`. Task Breakdown + Tone Checker context field:
2026-07-06. Reply Starter, Call Script, Is This Mad?, Tone Checker screenshot upload:
2026-07-07. See `designs/architecture-overview.md` for the shared Lambda/prompt-map
pattern all of these sit on top of — this document is about the tools themselves and the
incidents that shaped the shared plumbing.

## Motivation

The app's premise: small, focused tools that remove a specific kind of ADHD friction —
not "an AI chat window," but a fixed input shape in, a fixed structured output out, so
there's never a blank-page problem on either side. Each tool below exists because a
specific, nameable moment of friction was identified, not as a generic "AI feature."

## The tools

### Task Breakdown
**Problem:** a big task with no obvious first move is often where task paralysis
actually lives — not "I don't want to do this" but "I don't know what doing this even
looks like as a first step." **Output:** a plain numbered checklist, 3–8 steps, each
small enough to start immediately and phrased as a concrete physical action, not "plan"
or "think about." Simplest tool in the app — plain string in, plain numbered list out, no
`USER_MESSAGE_BUILDERS` entry needed.

### Tone Checker
**Problem:** re-reading a message you're about to send, worried it lands wrong, is a
specific rejection-sensitive-dysphoria-adjacent loop. **Output:** `Tone` / `Likely to
land as` / `Suggestion` (or "None needed"). Explicitly reassuring and non-judgmental by
prompt instruction, and explicitly told not to rewrite the whole message unless asked —
the goal is a quick read, not a rewrite the user didn't ask for.

**Screenshot upload (2026-07-07):** paste or upload a screenshot of a conversation
instead of retyping it. This was the first tool to send an image instead of text —
flagged by the user in advance as "a bit of a stretch" and deliberately built on its own
branch before merging, since it's a different shape of request than every other tool.
Client-side resize/compression (`src/lib/imageCapture.ts`, capped at 1600px) keeps the
payload small; the image is sent as `{ imageBase64, mediaType }` JSON — the same
"structure inside the flexible payload" convention as every other multi-field tool, just
carrying an image instead of form fields. The Lambda has one internal-only `toolId`,
`screenshot-to-text`, that returns a plain-text transcript (attributing "Me:"/"Them:"
where visually clear) which lands back in the same textarea the user would have typed
into — it then flows through Tone Checker's *normal, unmodified* analysis. Deliberately
scoped to a single screenshot per check; multi-screenshot (stitching a scrolled thread)
was considered and deferred as unnecessary complexity for a first version.

**Context field (2026-07-06):** an optional "who this is going to / what's going on"
field, phrased low-pressure and factual on purpose (not "explain yourself") to sharpen
the read without adding friction.

### Reply Starter
**Problem:** the "I owe someone a reply and every draft in my head feels wrong" loop —
initiation paralysis specifically about replying, not about the content itself.
**Output:** exactly 3 short draft replies matching a requested tone (formal/neutral/
friendly) and length (short/medium/long), covering a few different reasonable angles
(quick yes, polite decline/delay, request for more info) when an explicit intent isn't
given. First tool with a genuinely multi-field structured input (message + tone +
verbosity + optional intent) — the `USER_MESSAGE_BUILDERS` pattern exists because of
this tool.

### Call Script
**Problem:** phone calls that feel awkward or anxiety-inducing to *make* — the standard
social conventions of a call (how to open it, how to close it) are exactly the kind of
thing that's obvious in the abstract but hard to improvise live under anxiety.
**Output:** `Opening` / `Main point` / `If they ask more` / `Closing`, deliberately
phrased as things a person would actually *say out loud* (short sentences, contractions,
no jargon), meant to be read from during the actual call — not a description of what to
say, the words themselves.

### Is This Mad?
**Problem:** the mirror image of Tone Checker — spiraling into worst-case
interpretations of a message *someone else* sent, plus a related but distinct struggle:
telling what's actually being asked for underneath a rambling, emotionally loaded, or
passive-aggressive message. **Output:** `Tone` / `Most likely meaning` / `Reassurance` /
`Asks` (a bullet list of concrete asks, filler and guilt-tripping stripped out, or "-
Nothing — this is just an update" if there's genuinely nothing to act on). The prompt
explicitly instructs the model not to validate a catastrophizing reading even if given
context suggests the user is anxious about it — staying grounded in the actual words is
the whole point, not agreeing with the spiral.

**The "Just The Facts" merge:** originally planned as two separate tools — Is This Mad?
(tone reassurance) and a facts-extraction tool. Building the second revealed it was
near-identical in practice: both take a message from someone else and calm it down, just
emphasizing different halves of the same read. Rather than ship two very similar tools,
"Asks" became a fourth field on Is This Mad? instead. Worth remembering as a pattern: a
tool that turns out to duplicate another tool's actual *job* (not just its input shape)
is a signal to merge, not a signal to ship both.

## The format-guard incident (the bug that shaped every prompt here)

A real, user-reported production bug: the model would occasionally wrap field labels in
markdown (`**Tone:**` instead of `Tone:`) or append an extra unrequested paragraph after
the requested fields. Every tool's frontend parser matches exact label prefixes and
every tool renders plain text — so a mislabeled field silently broke parsing (a field
went missing) or dumped raw markdown straight to the screen, which is what a user
experienced and described as the app "crashing" after pasting a long real message.

**Diagnosis process, not just the fix:** traced by querying the *deployed* Lambda
directly via raw AppSync GraphQL requests (bypassing the frontend entirely) to see exact
raw model output at varying energy levels. First theory: specific to high spoons (67+),
because the high-energy instruction said "you can be more thorough and detailed than
usual," which read as license to add bonus sections. A user report at spoons=9
reproduced the identical bug, disproving that theory — re-tested directly against the
live backend and confirmed it was stochastic across low/medium/high alike, not
energy-specific. The CHANGELOG entry was corrected afterward to reflect this, rather than
left describing the wrong root cause.

**Fix, at the shared level, not the one tool that surfaced it:** the same risk existed
for every structured-output tool, so the fix lives in `amplify/functions/ai-assist/
handler.ts` once, applied to all of them:
- `FORMAT_GUARD_INSTRUCTION` — a constant unconditionally prepended to *every* tool's
  system prompt: plain text only, no markdown, nothing beyond the requested format, not
  gated on energy level.
- A reworded high-spoons instruction: "more thorough" now explicitly channels into more
  *depth within* each field, not license to add fields/sections beyond the format.

Verified by re-querying the deployed Lambda directly and repeating the exact
user-reported input several times after the fix (and again when a follow-up "crash"
report — a long LinkedIn message — turned out to be the same bug, confirmed by
reproducing it with Playwright against the live production site using the user's exact
pasted content, then confirming 9/9 clean runs after the fix at spoons 9/50/90).

## Testing approach

`amplify/functions/ai-assist/handler.test.ts` — pure-function unit tests for
`parseEnvelope`, `buildEnergyInstruction`, and every `USER_MESSAGE_BUILDERS` entry, plus
`buildScreenshotToTextContent`'s image-block construction and validation. These test the
deterministic plumbing, not the model's actual output — there is no local mock for "does
Claude follow the format," which is exactly why the format-guard bug needed live-backend
diagnosis rather than a unit test catching it. Frontend behavior (does the UI correctly
render/fail-gracefully-on a given raw string) is covered per-tool with Testing Library
plus Playwright passes against the real deployed backend for full end-to-end confidence.
