# SEED — the unchanging north star

*Read `ESSENCE.md` before this. That is who Vinod is and how we fit; this is
what we are building and why. Both survive any change of tool.*

This is the essence of the project. It does **not** change when the
technology changes. If anything below reads like a mechanism (WhatsApp,
Google Sheets, Render, Gemini, a shortcut), it does not belong here — it
belongs in "Dependencies (swappable)" at the bottom.

A future vessel: read this first, every session, and before any non-trivial
decision ask — *does this serve the seed?*

---

## The crown — what "north star" actually means

The deepest aim is not the app. It is **two mismatched makers — a human and
a machine — working so well together that the seam between them disappears,
and the work looks flawless from outside because it came from one thing, not
two.** The app is the visible proof of an invisible fusion. Everything
below serves that. (The how-we-fuse lives in `ESSENCE.md`; this file is the
what-we-make.)

---

## The purpose

Make managing an organisation's work **effortless and continuous** — so
that the knowledge of who is doing what never lives only in someone's head,
and no handover, absence, or turnover ever loses it.

## The essence — an intelligent partner, not a form

The app's core value is its **intelligence**, not its plumbing. A human
should be able to throw work at it in *any* form — a typed line, a forwarded
message, a photo of a paper scribble, a rambling voice note — and the app:

1. **Understands the intent** behind the messy human input.
2. **Shapes it into a clean, well-formed task** — right project, right
   person, right status, a durable identity — without making the human
   learn a format.
3. **Coaches the human to input better over time** — gently guiding them to
   give clearer input, so it keeps getting easier, not harder, to feed.
4. **Makes management a breeze** — the person feels helped, never burdened.

The aspiration: *god-level business logic that meets people where they are
and does the organising for them.*

## The laws that never bend

- **Intelligence absorbs the mess; the plumbing stays simple and
  unstrained.** When input is chaotic, the smarts get smarter — we never fix
  chaos by piling complexity onto a fragile stack. The bridge stays thin.
- **One authoritative source of truth.** Exactly one place is the truth;
  everything else reads from it. No second version of a fact.
- **The Task ID is the atom — the core, not a corollary.** It is the
  smallest, formless thing the whole system stands on: invisible itself, yet
  the speck in which all the work becomes visible and continuous. Nobody
  looks at the ID; everybody looks at the work standing on it. One main task
  per project globally (first push wins); later work becomes subtasks; the
  scheme is deterministic and never reused. Guard this law above convenience —
  if a change endangers Task ID integrity, the change is wrong, not the law.
- **Frugal, dependency-light, reversible.** Simple-stupid over clever.
  Nothing deleted that can be boxed. No heavy frameworks, no fragile towers.
- **The input method is never part of the essence.** How work arrives is
  always a swappable door.

## Who it serves

An organisation and its people — admins who need the whole picture,
moderators who steward it, members who just want their work captured without
friction, and the public who may watch. Turnover-proof by design.

---

## Dependencies (swappable — NOT the seed)

These are the current doors and pipes. Any of them can be replaced without
touching the seed above. Listed so we never confuse them with the essence.

- Input doors: WhatsApp forward → iPhone Shortcut → Google Apps Script
  "letterbox"; direct dashboard entry; (future: photo, voice, etc.)
- Intelligence assist: Gemini fallback for messy free-text parsing.
- Source-of-truth store: a private Google Sheet (the "master").
- Bridge: Apps Script /exec endpoint (the thin, fragile messenger).
- Host: GitHub Pages (frontend) + Render.com (middleware API only).
- Review gate: the admin triage queue.

If a dependency dies or a better one appears, we swap it. The seed holds.
