# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# What this is

A model editor for PMX, in the browser. It replaces the parts of PMXEditor that
people still open a 2008 desktop app for, so a fix that takes thirty seconds
stops costing a Blender round trip.

**It never leaves PMX.** That is the product, not a detail of it. Blender's
import/export is what actually costs people time — bone names mangled, physics
gone, morphs needing re-setup — so every edit here happens on a document that
round-trips byte-for-byte. Correctness of that document outranks every feature.

**Nothing is uploaded.** Models open off the user's disk. MMD models carry
redistribution terms, and a browser tool that ships someone's model to a server
is one a lot of creators will not touch.

# Every edit is data

An edit that exists only as a gesture cannot be scripted, tested, diffed, or
handed to anything else. So every operation is a pure named transform on the
document — `(document, params) -> document` — and the UI is one caller of it,
never the only one.

That makes the tool AI-friendly without an AI feature in it. A user describes a
job, has a model produce the params, and pastes them in. Batch-binding a dress is
the obvious case: hundreds of rigidbodies and joints is exactly the shape of work
a person does not want to click through and a model is good at emitting.

What it demands:

- **Parameters are named, quantified and bounded.** Units and valid ranges stated
  where they are declared — the way the engine's `#param float <name> <default>
  <min> <max>` already does for effects. "damping 0.8" means nothing on its own.
- **Names are the key, never indices.** `{"bone": "左足"}`, not `{"bone": 47}`.
  The family's id/name rule, and indices shift under edits anyway.
- **Operations are batch-shaped.** The unit of work is a list; one rigidbody is a
  list of one.
- **Every panel can show its state as JSON and take it back.**

Pasted input is untrusted, so two rules travel with it:

- **Preview before apply.** Never let a paste silently rewrite two hundred bodies.
- **One paste is one undo.**

The payoff is not only AI. Pure transforms are directly testable, which is what a
tool whose whole promise is byte-exact round-tripping needs most.

# Editor chrome

The tokens are defined and explained in `app/globals.css` under "Editor chrome
tokens". The rules, short enough to hold in your head:

**Two text colours.** `text-foreground` and `text-muted-foreground`. Never an
opacity on either — a dimmer muted is not a third tier, it is the same tier
rendered inconsistently. If something needs to recede further, it probably
should not be on screen.

**Three accents, one meaning each.** `blue-400` selected/active/focus ·
`amber-400` warning (it still works, but read this) · `red-400` destructive
(this removes something).

**Two surfaces, two edges.** `bg-surface` for chrome, `bg-surface-raised` for
anything stacked on it. `border-line` divides inside a surface,
`border-line-strong` bounds the surface. Nothing dimmer — a past review called
unclear borders out by name.

**Radii: `rounded-surface` (10) · `rounded-interior` (6) · `rounded-chip` (4).**
Avoid 12+; smaller reads as more professional.

**No `backdrop-blur` on chrome that floats over the 3D canvas.** It re-samples
the viewport every frame the scene animates, which is precisely when the chrome
is open. `bg-surface` is opaque enough without it. Blur is fine over something
static.

**Never a raw `<button>`, `<input>` or `<textarea>`.** Use the `components/ui`
primitives — they carry the focus handling, disabled states and sizing, and
`lib/last-input.ts` fixes Radix's sticky focus ring for every overlay. A bare
element silently opts out of all of it. If a primitive does not fit, extend the
primitive.

**Placement carries meaning.** `components/editor/surface.tsx` — a scrim means
the canvas is not part of this task; no scrim means you are watching the canvas
while you work. Wanting a scrim on a side panel means the placement is wrong.
