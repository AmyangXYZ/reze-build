// The bundled demo — the scene a first-time visitor lands on.

import { FOLLOW_BONE } from "@/components/scene/scene-sidebar"
import { builtinEffect } from "@/lib/effects"
import { libraryGraph } from "@/lib/materials"
import { parseSceneDoc, type Scene, type SceneDoc } from "@/lib/scene"
import { DEFAULT_AUDIO, DEFAULT_DOF, DEFAULT_OUTLINE, DEFAULT_PHYSICS, DEFAULT_VIEW } from "@/lib/scene-settings"

/**
 * Whether this build boots into the demo scene.
 *
 * `NEXT_PUBLIC_USE_DEFAULT_SCENE=true` opts in, and the deployments at
 * reze.build set it. Everything else — a clone, a fork, a packaged desktop
 * build — boots `EMPTY_SCENE_DOC` instead.
 *
 * It picks between two whole scenes rather than emptying the cast out of one.
 * The demo's magenta world, purple ground and two background effects are a
 * stage set built around one character; leaving them standing with nobody in
 * them is a stranger first impression than either scene on its own.
 *
 * Off by default because the demo's assets are not in this repository. They
 * stream from `DEMO` below, one account's bucket behind an origin allowlist, so
 * a clone that loaded them would be serving its pages off someone else's
 * infrastructure, and a fork on any other origin would fail the CORS check.
 *
 * Read at build time (the NEXT_PUBLIC_ prefix inlines it), so a downstream
 * packager sets it in the environment rather than patching this file.
 */
// Parsed leniently, so a `1` or an `on` opts in as readily as a `true`.
const YES = ["true", "1", "on", "yes"]
export const USE_DEFAULT_SCENE = YES.includes((process.env.NEXT_PUBLIC_USE_DEFAULT_SCENE ?? "").trim().toLowerCase())

/**
 * Where the demo model, motion and music are served from.
 *
 * R2, whose egress is free, so the ~18MB a first-time visitor downloads costs
 * nothing to serve and never touches the deployment's transfer budget. Keys are
 * versioned by path, which is what lets them carry a one-year immutable cache
 * header: rename, never overwrite in place.
 *
 * Upload with `scripts/r2-upload-demo.mjs` — see its header.
 */
// The cast, shared by every site rather than copied into each one's folder.
const MODEL = "https://assets.reze.one/demo/reze"

const EMPTY_SETTINGS: SceneDoc["settings"] = {
  // A model editor frames the whole figure and holds still: no follow bone,
  // because nothing is travelling — the model stands in bind pose and you turn
  // the camera around it. alpha/beta in RADIANS, which is what the engine takes.
  camera: {
    distance: 28,
    alpha: Math.PI,
    beta: Math.PI / 2.5,
    target: [0, 11.5, 0],
    follow: null,
  },
  world: { color: "#aabbd2", strength: 0.3 },
  sun: { color: "#ffffff", strength: 2.0, azimuth: 205, elevation: 26.6 },
  bloom: { enabled: true, threshold: 0.5, knee: 0.5, radius: 4.0, intensity: 0.05, color: "#ffddd3" },
  dof: DEFAULT_DOF,
  outline: { enabled: true },
  view: DEFAULT_VIEW,
  audio: DEFAULT_AUDIO,
  background: { color: "#f6cfff", effects: [] },
  grade: { preset: "Neutral", intensity: 1 },
  ground: { color: "#ed6aff", size: 160, opacity: 1, shadow: true, grid: "#ededed", gridEnabled: true },
  physics: DEFAULT_PHYSICS,
}

const BUILD_SCENE_DOC: SceneDoc = {
  version: 1,
  name: "Untitled model",
  assets: {
    models: [
      {
        model: `${MODEL}/reze.pmx`,
        // No motion and no music: what this app opens on is a model in bind
        // pose, which is the pose you inspect a rig in. A take is something you
        // load to test the rig, not something the editor arrives playing.
        animation: null,
        morph: null,
        // reze.design's curated list, verbatim — it is the same figure, so the
        // grouping that was tuned for it there is right here too.
        //
        // Groups are keyed BY MODEL ID (use-engine reads
        // scene.state.groups?.[id] and only falls through to autoStyleGroups
        // when there is no entry), so this applies to the boot figure and to
        // nothing else. Every model you open afterwards auto-styles.
        materials: {
          groups: [
            { label: "Body", materials: ["skin"], graph: "AG Body" },
            {
              label: "Smooth Cloth",
              materials: ["shirt", "shorts", "ribbon", "choker", "bozi", "cloth01", "cloth01.001"],
              graph: "AG Smooth Cloth",
            },
            { label: "Rough Cloth", materials: ["Rubber", "Leather"], graph: "AG Rough Cloth" },
            { label: "Stockings", materials: ["socks"], graph: "AG Stockings" },
            { label: "Hair", materials: ["头发"], graph: "AG Hair", role: "hair" },
            { label: "Face", materials: ["face01", "唇", "齿", "口腔", "舌"], graph: "AG Face" },
            {
              label: "Eye",
              // The brows and lashes ride with the eyes: they are drawn as eye
              // features rather than as skin.
              materials: ["目白", "瞳1", "瞳2", "eyebrow", "eyelash", "eyelash_crease"],
              graph: "AG Eye",
              role: "eye",
            },
          ],
        },
      },
    ],
    cameraAnimation: null,
    audio: null,
    midi: null,
    lyrics: null,
    backdrop: null,
    skybox: null,
  },
  settings: EMPTY_SETTINGS,
}


export const EMPTY_SCENE_DOC: SceneDoc = {
  version: 1,
  name: "Untitled scene",
  assets: { models: [], cameraAnimation: null, audio: null, midi: null, lyrics: null, backdrop: null, skybox: null },
  settings: EMPTY_SETTINGS,
}

export const EMPTY_SCENE: Scene = parseSceneDoc(EMPTY_SCENE_DOC, builtinEffect, libraryGraph)

/**
 * The curated scene: one character, the dance, the track and the look built
 * around them. What Reset restates, whether or not this build OPENS on it —
 * "reset to default" names the scene that was designed, and a build that boots
 * empty still has one.
 */
export const DEMO_SCENE: Scene = parseSceneDoc(BUILD_SCENE_DOC, builtinEffect, libraryGraph)

/** The scene this build opens on. */
export const DEFAULT_SCENE_DOC: SceneDoc = USE_DEFAULT_SCENE ? BUILD_SCENE_DOC : EMPTY_SCENE_DOC
export const DEFAULT_SCENE: Scene = parseSceneDoc(DEFAULT_SCENE_DOC, builtinEffect, libraryGraph)
