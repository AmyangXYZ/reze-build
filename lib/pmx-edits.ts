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

import type { PmxBone, PmxDocument, PmxMaterial, PmxVertex } from "reze-engine"

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

/** How much of a vertex's own blend weight sits on bones IN a set — 0 to 1,
 *  the fraction of it that ought to move with them. BDEF1 is all-or-nothing;
 *  BDEF2 and SDEF split between exactly two bones, the second implied
 *  (1 - the first); BDEF4 and QDEF are four independent pairs. A vertex split
 *  between an affected bone and one that is not gets a PARTIAL fraction, so
 *  a chain's own boundary fades under a scale instead of tearing. */
function weightFractionOnBones(v: PmxVertex, affected: ReadonlySet<number>): number {
  const { bones, weights, weightType } = v
  if (weightType === 0) return affected.has(bones[0]) ? 1 : 0
  if (weightType === 1 || weightType === 3) {
    const w0 = weights[0] ?? 0
    let sum = 0
    if (affected.has(bones[0])) sum += w0
    if (affected.has(bones[1])) sum += 1 - w0
    return sum
  }
  let sum = 0
  for (let i = 0; i < bones.length; i++) if (affected.has(bones[i])) sum += weights[i] ?? 0
  return sum
}

/** What a scale of `boneName` by `scale` moves — the bones and the vertices
 *  alike, as WORLD positions ready to write straight back into the
 *  document (or hand to the engine's live setBoneBindPositions /
 *  setVertexPositions for a preview, which is the other caller: the two
 *  must never compute a different answer for the same drag). Null only when
 *  the bone itself is not found. */
export interface BoneScaleUpdate {
  bones: { index: number; position: [number, number, number] }[]
  vertices: { index: number; position: [number, number, number] }[]
}

export function computeBoneScale(doc: PmxDocument, boneName: string, scale: number): BoneScaleUpdate | null {
  const boneIndex = doc.bones.findIndex((b) => b.name === boneName)
  if (boneIndex < 0) return null
  const bone = doc.bones[boneIndex]

  // The picked bone scales away from its OWN PARENT, not from itself — pick
  // a limb's own root and the limb grows from the joint above it; pick a
  // leaf with nothing below it (a breast bone, almost always exactly this
  // shape in an MMD rig: the mesh is weighted straight to it, not to some
  // child underneath) and IT is what grows, which a pivot-at-itself design
  // has nothing left to move. A root bone (no parent) falls back to its own
  // position: there is nothing else to anchor against.
  const parentIndex = bone.parentIndex
  const pivot = parentIndex >= 0 && parentIndex < doc.bones.length ? doc.bones[parentIndex].position : bone.position

  // PMX's own hierarchy is parent-pointers only — the child lists a scale
  // needs to walk down FROM the picked bone exist nowhere else in the document.
  const childrenOf = new Map<number, number[]>()
  doc.bones.forEach((b, i) => {
    if (b.parentIndex < 0) return
    const list = childrenOf.get(b.parentIndex)
    if (list) list.push(i)
    else childrenOf.set(b.parentIndex, [i])
  })
  const affected = new Set<number>([boneIndex])
  const stack = [...(childrenOf.get(boneIndex) ?? [])]
  while (stack.length) {
    const i = stack.pop()!
    if (affected.has(i)) continue
    affected.add(i)
    for (const c of childrenOf.get(i) ?? []) stack.push(c)
  }

  const scaled = (p: readonly [number, number, number]): [number, number, number] => [
    pivot[0] + (p[0] - pivot[0]) * scale,
    pivot[1] + (p[1] - pivot[1]) * scale,
    pivot[2] + (p[2] - pivot[2]) * scale,
  ]

  const bones = [...affected].map((index) => ({ index, position: scaled(doc.bones[index].position) }))

  const vertices: { index: number; position: [number, number, number] }[] = []
  for (let v = 0; v < doc.vertices.length; v++) {
    const vert = doc.vertices[v]
    const w = weightFractionOnBones(vert, affected)
    if (w <= 0) continue
    const p = vert.position
    const s = scaled(p)
    vertices.push({
      index: v,
      position: [p[0] + (s[0] - p[0]) * w, p[1] + (s[1] - p[1]) * w, p[2] + (s[2] - p[2]) * w],
    })
  }

  return { bones, vertices }
}

export interface ScaleBoneParams {
  /** The bone that scales — see computeBoneScale for why it moves too,
   *  not just what is below it. */
  name: string
  /** 1 = unchanged, 1.5 = 150%, 0.5 = half. Uniform on all three axes. */
  scale: number
}

/**
 * Scales one bone (and its descendant chain), and every vertex weighted to
 * any of them, away from (or toward) the bone's OWN PARENT — PMXEditor's own
 * bone-scale operation. The chain's OWN local offsets stay internally
 * consistent automatically: every affected bone's position is computed
 * straight from the pivot, not accumulated step by step down the chain.
 *
 * Every vertex MORPH offset is a relative delta and is left exactly as it
 * is — moving the base vertex under it and leaving the offset alone is what
 * keeps a morph correct after the body it targets has been resized.
 */
export function scaleBone(doc: PmxDocument, params: ScaleBoneParams): EditResult {
  const { name, scale } = params
  const update = computeBoneScale(doc, name, scale)
  if (!update) return { document: doc, summary: "Changed nothing", missing: [name] }

  return {
    document: applyBoneUpdate(doc, update),
    summary: `Scaled ${name} to ${Math.round(scale * 100)}% (${update.bones.length} bones, ${update.vertices.length} vertices)`,
    missing: [],
  }
}

/** Writes a BoneScaleUpdate's bone and vertex positions into a document —
 *  shared by scaleBone and moveBone, which differ only in how they compute
 *  the update, never in how it lands. */
function applyBoneUpdate(doc: PmxDocument, update: BoneScaleUpdate): PmxDocument {
  const bones = doc.bones.slice()
  for (const { index, position } of update.bones) bones[index] = { ...bones[index], position }
  const vertices = doc.vertices.slice()
  for (const { index, position } of update.vertices) vertices[index] = { ...vertices[index], position }
  return { ...doc, bones, vertices }
}

/** What moving `boneName` by `offset` (a WORLD-space delta) moves — the bone
 *  itself, its descendant chain, and every vertex weighted to any of them,
 *  all by the SAME offset. Unlike a scale there is no pivot to speak of:
 *  every affected position just adds the same vector, blended by weight
 *  fraction for a vertex split between an affected bone and one that is
 *  not — same shape as computeBoneScale, sharing weightFractionOnBones,
 *  differing only in the transform applied to each position. */
export function computeBoneMove(doc: PmxDocument, boneName: string, offset: readonly [number, number, number]): BoneScaleUpdate | null {
  const boneIndex = doc.bones.findIndex((b) => b.name === boneName)
  if (boneIndex < 0) return null

  const childrenOf = new Map<number, number[]>()
  doc.bones.forEach((b, i) => {
    if (b.parentIndex < 0) return
    const list = childrenOf.get(b.parentIndex)
    if (list) list.push(i)
    else childrenOf.set(b.parentIndex, [i])
  })
  const affected = new Set<number>([boneIndex])
  const stack = [...(childrenOf.get(boneIndex) ?? [])]
  while (stack.length) {
    const i = stack.pop()!
    if (affected.has(i)) continue
    affected.add(i)
    for (const c of childrenOf.get(i) ?? []) stack.push(c)
  }

  const moved = (p: readonly [number, number, number]): [number, number, number] => [
    p[0] + offset[0],
    p[1] + offset[1],
    p[2] + offset[2],
  ]

  const bones = [...affected].map((index) => ({ index, position: moved(doc.bones[index].position) }))

  const vertices: { index: number; position: [number, number, number] }[] = []
  for (let v = 0; v < doc.vertices.length; v++) {
    const vert = doc.vertices[v]
    const w = weightFractionOnBones(vert, affected)
    if (w <= 0) continue
    const p = vert.position
    vertices.push({ index: v, position: [p[0] + offset[0] * w, p[1] + offset[1] * w, p[2] + offset[2] * w] })
  }

  return { bones, vertices }
}

export interface MoveBoneParams {
  name: string
  /** WORLD-space delta in PMX units, applied to the bone, its descendant
   *  chain, and every vertex weighted to any of them. */
  offset: [number, number, number]
}

/**
 * Moves one bone (and its descendant chain), and every vertex weighted to
 * any of them, by the same WORLD-space offset — the slider-driven twin of
 * scaleBone, and PMXEditor's own bone-position operation. Every vertex
 * MORPH offset is left exactly as it is, for the same reason scaleBone
 * leaves them: a relative delta stays correct under a moved base vertex.
 */
export function moveBone(doc: PmxDocument, params: MoveBoneParams): EditResult {
  const { name, offset } = params
  const update = computeBoneMove(doc, name, offset)
  if (!update) return { document: doc, summary: "Changed nothing", missing: [name] }

  return {
    document: applyBoneUpdate(doc, update),
    summary: `Moved ${name} (${update.bones.length} bones, ${update.vertices.length} vertices)`,
    missing: [],
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
