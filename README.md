# reze.build

A PMX model editor that runs in the browser.

It covers the edits people still open PMXEditor for — physics bodies and joints,
bone names and hierarchy, morphs, display frames, material flags, weights — so a
thirty-second fix stops costing a Blender round trip.

**It never leaves PMX.** Blender's import and export are what actually cost time:
bone names mangled, physics gone, morphs needing re-setup. Every edit here happens
on a document that round-trips byte-for-byte.

**Nothing is uploaded.** Models open off your own disk.

Part of the reze family — [reze.design](https://reze.design) composes and publishes
scenes, [reze.studio](https://reze.studio) handles materials and animation curves,
reze-rig retargets motion, and all of them run on
[reze-engine](https://github.com/AmyangXYZ/reze-engine).

## The shape of the app

Not a port of PMXEditor's windows. What people are fluent in there is not the
chrome — it is the loop: pick an object type, find the row, read every field as a
number, change it, see the model move. That survives. The three floating windows,
the modal dialogs and the 2008 tab strip do not.

**One surface.** The canvas is the whole window; the docks float over it, so the
model stays where the camera framed it however many panels are open. A left dock
browses objects, a right dock inspects the selection, a thin strip along the
bottom reports the document's health. No dialog covers the viewport for an edit
you are meant to watch.

**Selection is one thing.** Clicking a bone in the viewport, clicking its row in
the list, and pasting its name all select the same bone. The engine holds it and
the overlays reflect it; no panel keeps its own copy.

**Every panel is data.** Each one shows its state as JSON and takes it back. That
is what makes the tool scriptable, testable and AI-friendly without an AI feature
in it: describe a job, have a model emit the parameters, paste them in. Two rules
travel with pasted input — **preview before apply**, and **one paste is one
undo**.

**Batch is the default shape.** The unit of work is a list; one rigidbody is a
list of one. Multi-select and edit the field once.

**Round-tripping is visible.** Byte-exact output is the product, not the
plumbing, so the status strip says whether the document still round-trips and the
save path can diff against the bytes that were opened.

## Functions

### Tier 1 — the document and its panels

Needs only a lossless `PmxDocument` and its writer. Blender cannot do any of
these, which is why they come first.

| Panel | Fields |
| --- | --- |
| **Model info** | name, English name, comment, English comment, version, encoding, additional UV count |
| **Materials** | diffuse, specular + power, ambient, draw flags (double-sided, ground shadow, to/from self-shadow, edge, vertex colour, point, line), edge colour and size, texture, sphere texture and mode, toon (shared or texture), memo |
| **Bones** | name and English name, position, parent, deform layer and after-physics, tail (bone or offset), flags (rotatable, movable, visible, operable), append parent + ratio + rotate/move, fixed axis, local axes, external parent |
| **IK** | target bone, loop count, limit angle per loop, link list with per-link angle limits |
| **Morphs** | panel assignment, type, and the offset table for vertex, bone, UV, material, group, flip and impulse morphs |
| **Display frames** | frame list and order, membership, special-frame flag |
| **Rigidbodies** | shape and size, position, rotation, bone binding, mass, linear and angular damping, restitution, friction, group, non-collide mask, physics mode |
| **Joints** | type, bodies A and B, position, rotation, position and rotation limits, spring constants |
| **Textures** | list, and replace a texture with a file off disk |

Cross-cutting, and built once rather than per panel: search and filter, multi-
select, batch field edit, undo/redo, and JSON in and out.

And one that has to be built before anything can delete: **PMX references
everything by INDEX**, not by name. Display frame entries, rigidbody bone
bindings, IK links, bone and material morph targets are all indices into the
lists they point at. So renaming is free and reordering is not — removing one
bone shifts every index above it, and an edit that does not remap them produces a
file that opens fine and is wrong. Deletion and reordering go through one
remapping step or they do not ship.

Two operations earn their own surface here:

- **Standard-name repair.** Match bones against the standard MMD names and fix
  the ones that drifted, which is what makes a model work with everyone's motions.
- **Physics generation.** Bodies and joints down a chain from a parameterised
  region — the skirt case, where hundreds of bodies is exactly the work nobody
  wants to click through.

### Tier 2 — the surface brush

One query — screen point to posed mesh to affected set with falloff — behind
every one of these.

| | |
| --- | --- |
| **Vertex and face selection** | click, marquee, brush; by material, by bone, by weight |
| **Weight paint** | brush and table, with normalise and prune |
| **Weight transfer** | between bones, for a renamed or re-parented rig |
| **UV view** | a 2D canvas over the geometry the engine already hands back |

### Tier 3 — merge

Document merge with bone-name remapping. Swap a dress, swap a head, and bind one
skeleton to another are all the same operation with different arguments.

Then the compositions, which are not new subsystems: **put on a dress** is merge
plus lattice plus physics generation, and **skirt auto-bind** parameterises a
region by height and angle to derive bones, weights, bodies and joints at once —
and simulates while you tune it, where PMXEditor makes you save and reload MMD to
see a mass change.

### Not in scope

Texture painting from scratch and mesh modelling from nothing. Replace a texture,
yes; artists paint in Clip Studio. For a new garment the MMD-real path derives it
from the body, so it arrives already fitted, UV'd and weighted.
