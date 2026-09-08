// Every edit, as a pure named transform: (document, params) -> document.
//
// The UI is one caller of these and never the only one. An edit that exists only
// as a gesture cannot be scripted, tested, diffed, or handed to anything else —
// so the gesture ends here, at a function with named parameters, and the panel
// above it is a form that fills them in.
//
// That is also what makes the tool AI-friendly with no AI feature in it: describe
// a job, have a model emit these parameters, paste them in. Which is why the
// parameters are named and bounded rather than positional, and why they key on
// NAMES — `{"bone": "左足"}`, never `{"bone": 47}`. Indices shift under edits.
//
// Each returns a NEW document sharing everything it did not touch. Cheap to
// apply, trivial to undo (keep the previous one), and safe to preview.

import type { PmxBone, PmxDocument, PmxMaterial } from "reze-engine"

/** What an edit did, so a panel can report it and a preview can show it. */
export interface EditResult {
  document: PmxDocument
  /** One line, past tense, for the undo stack and the status strip. */
  summary: string
  /** Names the edit was asked to touch and could not find. */
  missing: string[]
}

export interface RenameBonesParams {
  /** Old name to new name. Batch-shaped: one rename is a list of one. */
  renames: { from: string; to: string }[]
}

/**
 * Renames bones.
 *
 * Safe in a way that deletion is not: PMX references bones by INDEX everywhere
 * — display frames, rigidbody bindings, IK links, bone morph targets — so a
 * rename moves nothing and repairs nothing. What it does change is VMD
 * compatibility, since motion files key on the bone's name, and that is the
 * whole point: a model whose bones carry the standard MMD names takes everyone
 * else's motions.
 */
export function renameBones(doc: PmxDocument, params: RenameBonesParams): EditResult {
  const byName = new Map(doc.bones.map((b, i) => [b.name, i]))
  const missing: string[] = []
  const applied: { index: number; to: string }[] = []

  for (const { from, to } of params.renames) {
    const index = byName.get(from)
    if (index === undefined) {
      missing.push(from)
      continue
    }
    applied.push({ index, to })
  }

  if (applied.length === 0) {
    return { document: doc, summary: "Renamed nothing", missing }
  }

  const bones: PmxBone[] = doc.bones.slice()
  for (const { index, to } of applied) bones[index] = { ...bones[index], name: to }

  return {
    document: { ...doc, bones },
    summary:
      applied.length === 1
        ? `Renamed ${params.renames[0].from} to ${applied[0].to}`
        : `Renamed ${applied.length} bones`,
    missing,
  }
}

/**
 * Two bones sharing a name, which PMX permits and MMD cannot address.
 *
 * Worth surfacing rather than preventing: a model can arrive this way, and the
 * user needs to see it before a motion silently drives the wrong one.
 */
export function duplicateBoneNames(doc: PmxDocument): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const b of doc.bones) {
    if (seen.has(b.name)) duplicates.add(b.name)
    seen.add(b.name)
  }
  return [...duplicates]
}

/**
 * A patch against one named material. Every field optional: the unit of work is
 * "change these, leave the rest", which is what makes a panel of forty fields
 * one transform rather than forty.
 */
export interface MaterialPatch {
  /** Which material. Names, never indices — indices shift under edits. */
  name: string
  /** The new name, when the edit is a rename. */
  rename?: string
  nameEn?: string
  /** 0-1 display-space RGBA, exactly as the file stores it. */
  diffuse?: [number, number, number, number]
  specular?: [number, number, number]
  /** Shininess. PMX writes it unbounded; MMD's own UI stops at 100. */
  specularPower?: number
  ambient?: [number, number, number]
  /** Bit 0 double-sided · 1 ground shadow · 2 to self-shadow map · 3 from
   *  self-shadow · 4 edge · 5 vertex colour · 6 point draw · 7 line draw. */
  drawFlags?: number
  edgeColor?: [number, number, number, number]
  /** 0-unbounded; MMD's slider stops at 2. */
  edgeSize?: number
  memo?: string
}

export interface SetMaterialsParams {
  /** Batch-shaped: one material is a list of one. */
  materials: MaterialPatch[]
}

/**
 * Edits materials in place.
 *
 * Nothing here moves an index. A material owns a contiguous run of the index
 * buffer and its position in the list IS the draw order, so changing what a
 * material looks like is the one class of material edit that cannot break the
 * document — which is why it is the first one to exist.
 *
 * A rename is included because a material's name is how everything downstream
 * addresses it, this panel included, and renaming through the same call keeps
 * "change the name and the colour" one undo instead of two.
 */
export function setMaterials(doc: PmxDocument, params: SetMaterialsParams): EditResult {
  const byName = new Map(doc.materials.map((m, i) => [m.name, i]))
  const missing: string[] = []
  const materials = doc.materials.slice()
  let changed = 0

  for (const patch of params.materials) {
    const index = byName.get(patch.name)
    if (index === undefined) {
      missing.push(patch.name)
      continue
    }
    const before = materials[index]
    const after: PmxMaterial = { ...before }
    if (patch.rename !== undefined) after.name = patch.rename
    if (patch.nameEn !== undefined) after.nameEn = patch.nameEn
    if (patch.diffuse) after.diffuse = [...patch.diffuse]
    if (patch.specular) after.specular = [...patch.specular]
    if (patch.specularPower !== undefined) after.specularPower = patch.specularPower
    if (patch.ambient) after.ambient = [...patch.ambient]
    if (patch.drawFlags !== undefined) after.drawFlags = patch.drawFlags
    if (patch.edgeColor) after.edgeColor = [...patch.edgeColor]
    if (patch.edgeSize !== undefined) after.edgeSize = patch.edgeSize
    if (patch.memo !== undefined) after.memo = patch.memo
    materials[index] = after
    changed++
  }

  if (changed === 0) return { document: doc, summary: "Changed nothing", missing }
  return {
    document: { ...doc, materials },
    summary: changed === 1 ? `Edited ${params.materials[0].name}` : `Edited ${changed} materials`,
    missing,
  }
}

/**
 * A patch against one named bone.
 *
 * Deliberately narrower than the material one. Position, name and the display
 * flags are self-contained; the parent, the tail, the append source and every
 * IK link are INDICES into the bone list, and an editor that lets those be typed
 * before there is a transform that re-points the references around them is an
 * editor that corrupts documents. They stay read-only until each has its own
 * named operation.
 */
export interface BonePatch {
  name: string
  rename?: string
  nameEn?: string
  position?: [number, number, number]
  /** 変形階層. Higher layers deform after lower ones. */
  layer?: number
  /** The bone flags bitfield — see PmxBone. */
  flags?: number
}

export interface SetBonesParams {
  bones: BonePatch[]
}

export function setBones(doc: PmxDocument, params: SetBonesParams): EditResult {
  const byName = new Map(doc.bones.map((b, i) => [b.name, i]))
  const missing: string[] = []
  const bones = doc.bones.slice()
  let changed = 0

  for (const patch of params.bones) {
    const index = byName.get(patch.name)
    if (index === undefined) {
      missing.push(patch.name)
      continue
    }
    const after: PmxBone = { ...bones[index] }
    if (patch.rename !== undefined) after.name = patch.rename
    if (patch.nameEn !== undefined) after.nameEn = patch.nameEn
    if (patch.position) after.position = [...patch.position]
    if (patch.layer !== undefined) after.layer = patch.layer
    if (patch.flags !== undefined) after.flags = patch.flags
    bones[index] = after
    changed++
  }

  if (changed === 0) return { document: doc, summary: "Changed nothing", missing }
  return {
    document: { ...doc, bones },
    summary: changed === 1 ? `Edited ${params.bones[0].name}` : `Edited ${changed} bones`,
    missing,
  }
}
