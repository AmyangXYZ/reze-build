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
