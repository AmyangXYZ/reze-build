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

import type { PmxBone, PmxDocument } from "reze-engine"

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
