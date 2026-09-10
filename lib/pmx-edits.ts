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

export interface SplitMaterialParams {
  /** Which material to carve faces out of. */
  name: string
  /** Faces to move into the new material, LOCAL to this material's own face
   *  list — 0 is its first triangle, exactly what the engine's
   *  selectMaterialFaces returns. Not a name: a face has none to key on. */
  faceIndices: number[]
  /** The new material's name. The caller picks one that does not collide —
   *  this transform does not check, the way renameBones does not either. */
  newName: string
  /** Renames the material's OWN remaining half too. Optional: a caller that
   *  only wants to carve a piece off, leaving what is left behind under its
   *  original name, can omit it. */
  keptName?: string
}

/**
 * Splits a subset of one material's own faces into a new material, appended
 * at the END of the document.
 *
 * Appended there and nowhere else: PMX material MORPHS address a material by
 * INDEX (`{kind: "material", index}`), so inserting the new one anywhere but
 * the end would silently repoint every morph that targets a material after
 * it. A material nothing has referenced yet has nothing to repair.
 *
 * No vertex is touched, moved, or duplicated — only which triangles belong
 * to which material. A material owns a CONTIGUOUS run of the shared index
 * buffer, so splitting is partitioning that run in place (kept faces stay,
 * in order) and appending the carved-out half as its own run at the buffer's
 * end, which is also where the new material's position in the list expects
 * its faces to start.
 */
export function splitMaterial(doc: PmxDocument, params: SplitMaterialParams): EditResult {
  const { name, faceIndices, newName, keptName } = params
  const index = doc.materials.findIndex((m) => m.name === name)
  if (index < 0) return { document: doc, summary: "Changed nothing", missing: [name] }

  const original = doc.materials[index]
  const faceCount = original.indexCount / 3
  const wanted = new Set(faceIndices.filter((f) => f >= 0 && f < faceCount))
  if (wanted.size === 0) return { document: doc, summary: "Changed nothing", missing: [] }

  let start = 0
  for (let i = 0; i < index; i++) start += doc.materials[i].indexCount

  const kept: number[] = []
  const split: number[] = []
  for (let f = 0; f < faceCount; f++) {
    const i = start + f * 3
    const dest = wanted.has(f) ? split : kept
    dest.push(doc.indices[i], doc.indices[i + 1], doc.indices[i + 2])
  }

  const indices = new Uint32Array(doc.indices.length)
  indices.set(doc.indices.subarray(0, start))
  indices.set(kept, start)
  indices.set(doc.indices.subarray(start + original.indexCount), start + kept.length)
  indices.set(split, indices.length - split.length)

  const materials = doc.materials.slice()
  materials[index] = { ...original, indexCount: kept.length, name: keptName ?? original.name }
  materials.push({ ...original, name: newName, nameEn: "", indexCount: split.length })

  return {
    document: { ...doc, indices, materials },
    summary: `Split ${split.length / 3} faces from ${name} into ${newName}`,
    missing: [],
  }
}

export interface DeleteMaterialFacesParams {
  /** Which material to remove faces from. */
  name: string
  /** Faces to remove, LOCAL to this material's own face list — the same
   *  numbers selectMaterialFaces returns and splitMaterial takes. A face has
   *  no name of its own to key on instead. */
  faceIndices: number[]
}

/**
 * Removes a subset of one material's own faces from the document.
 *
 * Vertices are left exactly alone — a face is three INDICES into the vertex
 * array, and removing a face never removes the vertices it pointed to, only
 * the triangle. A vertex no longer referenced by anything is a stray, not a
 * corruption: reindexing the vertex array to drop it would renumber every
 * vertex after it, and vertex morphs store `vertexIndex` — the one thing
 * this document can never let shift under an edit that was not asked to
 * touch it.
 *
 * Only this material's own run of the shared index buffer changes; every
 * other material's faces, and their own position in it, move only insofar
 * as the buffer is now shorter starting from here — the same implicit
 * shift splitMaterial's own comment explains, just backwards.
 */
export function deleteMaterialFaces(doc: PmxDocument, params: DeleteMaterialFacesParams): EditResult {
  const { name, faceIndices } = params
  const index = doc.materials.findIndex((m) => m.name === name)
  if (index < 0) return { document: doc, summary: "Changed nothing", missing: [name] }

  const material = doc.materials[index]
  const faceCount = material.indexCount / 3
  const drop = new Set(faceIndices.filter((f) => f >= 0 && f < faceCount))
  if (drop.size === 0) return { document: doc, summary: "Changed nothing", missing: [] }

  let start = 0
  for (let i = 0; i < index; i++) start += doc.materials[i].indexCount

  const kept: number[] = []
  for (let f = 0; f < faceCount; f++) {
    if (drop.has(f)) continue
    const i = start + f * 3
    kept.push(doc.indices[i], doc.indices[i + 1], doc.indices[i + 2])
  }

  const indices = new Uint32Array(doc.indices.length - drop.size * 3)
  indices.set(doc.indices.subarray(0, start))
  indices.set(kept, start)
  indices.set(doc.indices.subarray(start + material.indexCount), start + kept.length)

  const materials = doc.materials.slice()
  materials[index] = { ...material, indexCount: kept.length }

  return {
    document: { ...doc, indices, materials },
    summary: `Deleted ${drop.size} faces from ${name}`,
    missing: [],
  }
}

/**
 * A patch against the document's own header — the model's name and comment,
 * in both languages PMX carries them. Not batch-shaped like the others: there
 * is exactly one of these per document, so a list of patches would only ever
 * hold one entry.
 */
export interface ModelInfoPatch {
  name?: string
  nameEn?: string
  comment?: string
  commentEn?: string
}

/**
 * Edits the document header. No index to shift, no reference to repair — the
 * name and comment are read by nothing else in the file, which is what makes
 * this the smallest possible edit and still worth its own named transform
 * rather than a raw `{...doc, comment: v}` at the call site: the panel stays a
 * form filling in a call, not a place that knows the document's shape.
 */
export function setModelInfo(doc: PmxDocument, patch: ModelInfoPatch): EditResult {
  const after = { ...doc }
  let changed = false
  if (patch.name !== undefined) {
    after.name = patch.name
    changed = true
  }
  if (patch.nameEn !== undefined) {
    after.nameEn = patch.nameEn
    changed = true
  }
  if (patch.comment !== undefined) {
    after.comment = patch.comment
    changed = true
  }
  if (patch.commentEn !== undefined) {
    after.commentEn = patch.commentEn
    changed = true
  }
  if (!changed) return { document: doc, summary: "Changed nothing", missing: [] }
  return { document: after, summary: "Edited the model's description", missing: [] }
}
