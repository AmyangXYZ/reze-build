// Recognising published content by its VALUE.
//
// A scene pins `{ id }` when what it applies is exactly some published item, and
// inlines the value when it isn't. Deciding that by comparison rather
// than by bookkeeping means an edited graph automatically stops matching — it
// genuinely is no longer that item, so it must travel by value. No provenance
// state to keep in sync, and no way for a stale tag to mispin someone else's work.

import type { ShaderGraph } from "reze-engine"
import { EFFECTS } from "@/lib/effects"
import { GRADE_PRESETS, type GradeSpec } from "@/lib/grade"
import { GRAPH_LIBRARY, sameGraphLook } from "@/lib/materials"
import { communityItems } from "@/hooks/use-community"
import type { EffectItem, GradeItem, GraphItem, LibraryKind } from "@/lib/library"
import type { ItemRef } from "@/lib/scene"

/** Built-ins first: they ship in the bundle, so a pin to one resolves offline. */
function candidates<T>(kind: LibraryKind, builtins: T[]): T[] {
  return [...builtins, ...(communityItems(kind) as T[])]
}

const pin = (item: { id: string } | undefined): ItemRef | undefined => (item ? { id: item.id } : undefined)

// Compared by LOOK, not bytes. Opening the editor on a group round-trips its
// graph through ReactFlow, which stamps node layout onto it — so a byte compare
// stops recognising a built-in nobody edited, and the scene inlines a copy of a
// preset it should simply have pinned.
function graphMatch(graph: ShaderGraph): GraphItem | undefined {
  return candidates<GraphItem>("graph", GRAPH_LIBRARY).find((i) => sameGraphLook(i.payload.graph, graph))
}

export function graphRef(graph: ShaderGraph): ItemRef | undefined {
  return pin(graphMatch(graph))
}

/** What the library calls this look, when the look IS some published or built-in
 *  graph. The name a group must wear to be findable in the library it came from. */
export function graphLibraryName(graph: ShaderGraph): string | undefined {
  return graphMatch(graph)?.name
}

export function effectRef(wgsl: string): ItemRef | undefined {
  return pin(candidates<EffectItem>("effect", EFFECTS).find((i) => i.payload.wgsl === wgsl))
}

export function gradeRef(spec: GradeSpec): ItemRef | undefined {
  const json = JSON.stringify(spec)
  return pin(candidates<GradeItem>("grade", GRADE_PRESETS).find((i) => JSON.stringify(i.payload.spec) === json))
}
