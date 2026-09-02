"use client"

import { useMemo, useState } from "react"
import type { PmxBone, PmxDocument } from "reze-engine"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

/**
 * The bone list — browse and select, nothing else.
 *
 * A table, not a form, because that is what a PMXEditor user reads fluently:
 * every bone at once, searchable, index visible. Editing lives in the right
 * dock; this side answers "which one", and the two are different questions.
 */
export function BonePanel({
  document,
  selected,
  onSelect,
}: {
  document: PmxDocument
  selected: string | null
  onSelect: (boneName: string | null) => void
}) {
  const [query, setQuery] = useState("")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return document.bones
      .map((bone, index) => ({ bone, index }))
      .filter(({ bone }) => !q || bone.name.toLowerCase().includes(q) || bone.nameEn.toLowerCase().includes(q))
  }, [document.bones, query])

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${document.bones.length} bones`}
        className="h-7"
      />
      {/* A fixed height, not flex-1: the dock hugs its rows, so a list that grew
          to fit would push every section below it off the bottom. */}
      <ScrollArea className="-mx-1 h-48 rounded-interior border border-line">
        {rows.map(({ bone, index }) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(bone.name === selected ? null : bone.name)}
            className={`flex w-full items-baseline gap-2 px-2 py-1 text-left hover:bg-accent ${
              bone.name === selected ? "text-blue-400" : ""
            }`}
          >
            <span className="w-7 shrink-0 text-[11px] text-muted-foreground tabular-nums">{index}</span>
            <span className="truncate">{bone.name}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="px-2 py-2 text-muted-foreground">No bone matches.</p>}
      </ScrollArea>
    </div>
  )
}

/** The selected bone's fields, and what can be done to it. */
export function BoneInspector({
  document,
  bone,
  onRename,
}: {
  document: PmxDocument
  bone: PmxBone
  onRename: (from: string, to: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? bone.name
  const dirty = draft !== null && draft !== bone.name && draft.trim().length > 0

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter commits and Escape abandons, so the common case never needs
          // the mouse. The button stays for discoverability.
          if (e.key === "Enter" && dirty) {
            onRename(bone.name, value)
            setDraft(null)
          }
          if (e.key === "Escape") setDraft(null)
        }}
        className="h-7"
      />
      <div className="flex gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={!dirty}
          onClick={() => {
            onRename(bone.name, value)
            setDraft(null)
          }}
        >
          Rename
        </Button>
        <Button size="xs" variant="ghost" disabled={draft === null} onClick={() => setDraft(null)}>
          Reset
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">English</dt>
        <dd className="truncate">{bone.nameEn || "—"}</dd>
        <dt className="text-muted-foreground">Parent</dt>
        <dd className="truncate">{bone.parentIndex >= 0 ? document.bones[bone.parentIndex]?.name : "—"}</dd>
        <dt className="text-muted-foreground">Position</dt>
        <dd className="tabular-nums">{bone.position.map((n) => n.toFixed(3)).join(", ")}</dd>
        <dt className="text-muted-foreground">Layer</dt>
        <dd className="tabular-nums">{bone.layer}</dd>
        <dt className="text-muted-foreground">Flags</dt>
        <dd className="tabular-nums">0x{bone.flags.toString(16).padStart(4, "0")}</dd>
        {bone.ik && (
          <>
            <dt className="text-muted-foreground">IK</dt>
            <dd>
              {document.bones[bone.ik.targetIndex]?.name ?? "?"} · {bone.ik.links.length} links ·{" "}
              {bone.ik.loopCount} loops
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
