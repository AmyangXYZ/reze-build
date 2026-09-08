"use client"

// What the selected bone or material actually IS, straight off the document.
//
// The field set is PMXEditor's, deliberately and almost field for field. Anyone
// reaching for this tool already knows that panel, and a model editor that
// renames 付与親 to something friendlier only makes them translate back. The
// names here are the English ones PMXEditor itself uses; the values are the
// document's own, unrounded except for display.
//
// Every field that writes goes through a named transform in lib/pmx-edits —
// setMaterials, setBones — never by mutating the document here. The panel is a
// form that fills in that call's parameters and nothing more, which is what
// keeps the same edit available to a script, a test, or a pasted batch.
//
// What stays read-only is what would need a transform this app does not have
// yet: everything that is an INDEX into another list. A parent bone, a tail, an
// append source, an IK link — typing over one of those without an operation
// that re-points the references around it is how a document gets corrupted, and
// this tool's whole promise is that it does not do that.

import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { PmxBone, PmxDocument, PmxMaterial } from "reze-engine"
import type { BonePatch, MaterialPatch } from "@/lib/pmx-edits"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ColorField } from "@/components/color-picker"
import { rgbToHex, hexToRgba } from "@/lib/color"
import { assetUrl } from "@/lib/scene"
import { cn } from "@/lib/utils"

/** One labelled value, in the shape reze-design's SliderRow/ColorRow rows
 *  use — a FIXED label column so a stack of them lines up on one axis, not
 *  Section's own heading style (that stays untouched; this is the row inside
 *  a section, not the section itself). w-28 fits this panel's longest labels
 *  ("Specular power", "External key") the way SliderRow's w-16 fits its own. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-1.5 flex min-h-4 items-center gap-1.5 px-4 first:mt-0">
      <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-[11px] text-foreground">{children}</span>
    </div>
  )
}

/** SliderRow's own VALUE_BOX, unchanged — a typed number looks the same here
 *  as it does in the scene dock. Short on purpose: h-4/w-10 is the box a
 *  single value earns, not the Input primitive's form-sized default. */
const VALUE_BOX =
  "block h-4 w-10 shrink-0 rounded border border-transparent bg-transparent p-0 text-right text-[11px] leading-4 tabular-nums shadow-none outline-none " +
  "hover:border-line-strong hover:bg-white/[0.04] focus-visible:border-line-strong focus-visible:bg-white/[0.04]"

/** A name or a memo needs room prose does — VALUE_BOX's 40px would make a
 *  rename box unusable. Same height and text size, width left to fill the row. */
const TEXT_BOX =
  "h-4 min-w-0 flex-1 rounded border-transparent bg-transparent p-0 text-right text-[11px] leading-4 shadow-none " +
  "hover:border-line-strong hover:bg-white/[0.04] focus-visible:border-line-strong focus-visible:bg-white/[0.04] focus-visible:ring-0"

/**
 * A text field that commits on blur and on Enter, not on every keystroke.
 *
 * Per-keystroke would put a document through the transform once per character
 * and make "左足" three undo steps. Escape abandons, which is the only way to
 * back out of a half-typed name without knowing what it used to be.
 */
function TextCell({ value, onCommit, box = TEXT_BOX }: { value: string; onCommit: (v: string) => void; box?: string }) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  if (!editing && draft !== value) setDraft(value)
  return (
    <Input
      className={box}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false)
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setDraft(value)
          setEditing(false)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** The same, for a number. A field that will not parse commits nothing rather
 *  than committing NaN — a document with NaN in a position writes a file that
 *  loads as a model folded into the origin. */
function NumCell({ value, onCommit, box = VALUE_BOX }: { value: number; onCommit: (v: number) => void; box?: string }) {
  return (
    <TextCell
      box={box}
      value={num(value, 4)}
      onCommit={(v) => {
        const n = Number(v)
        if (Number.isFinite(n)) onCommit(n)
      }}
    />
  )
}

/** Three of them, each narrower than a standalone NumCell so the triple still
 *  fits the row. PMX positions are three independent numbers, so they are
 *  three independent commits — editing Y should not re-write X. */
function VecCell({ v, onCommit }: { v: readonly number[]; onCommit: (v: [number, number, number]) => void }) {
  return (
    <span className="flex min-w-0 flex-1 justify-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <NumCell
          key={i}
          box="block h-4 w-9 shrink-0 rounded border border-transparent bg-transparent p-0 text-right text-[11px] leading-4 tabular-nums shadow-none outline-none hover:border-line-strong hover:bg-white/[0.04] focus-visible:border-line-strong focus-visible:bg-white/[0.04]"
          value={v[i]}
          onCommit={(n) => {
            const next: [number, number, number] = [v[0], v[1], v[2]]
            next[i] = n
            onCommit(next)
          }}
        />
      ))}
    </span>
  )
}

/** Every flag the field has, on or off — the read-only view could hide the off
 *  ones because an absent chip meant "off", but a chip you can CLICK has to be
 *  there to click. Grid, not flex-wrap: a bitfield's names vary wildly in
 *  length, and wrapping left them landing wherever the last one happened to
 *  end — two even columns read as a field, not a paragraph. */
function FlagCells({ bits, names, onCommit }: { bits: number; names: string[]; onCommit: (bits: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {names.map((n, i) =>
        n === "" ? null : (
          <button
            key={n}
            aria-pressed={((bits >> i) & 1) === 1}
            onClick={() => onCommit(bits ^ (1 << i))}
            className={cn(
              "truncate rounded-chip border px-1 py-0.5 text-left text-[10px] leading-3 transition-colors",
              (bits >> i) & 1
                ? "border-blue-400/40 bg-blue-400/15 text-blue-400"
                : "border-line-strong text-muted-foreground hover:border-white/25 hover:text-foreground",
            )}
          >
            {n}
          </button>
        ),
      )}
    </div>
  )
}

/** The app's own picker, so a colour is chosen the same way here as in the
 *  scene dock — ColorRow's own row shape. PMX keeps alpha beside the triple;
 *  the picker does not, so alpha stays its own number rather than being
 *  smuggled into the hex. */
function ColorCell({
  c,
  alpha,
  onCommit,
}: {
  c: readonly number[]
  alpha?: boolean
  onCommit: (c: number[]) => void
}) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      <ColorField value={rgbToHex(c)} onChange={(hex) => onCommit(hexToRgba(hex, alpha ? c[3] : 1))} />
      {alpha && <NumCell value={c[3]} onCommit={(a) => onCommit([c[0], c[1], c[2], a])} />}
    </span>
  )
}

/** A group of fields under a heading, in the dock's own label style — Field's
 *  rows changed to match reze-design's SliderRow; this did not. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">
      <div className="px-4 pt-3 pb-1.5">
        <span className="font-mono text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <div className="pb-2">{children}</div>
    </div>
  )
}

/** Numbers are mono and fixed-width so a column of them lines up on the decimal
 *  — three vectors in proportional digits is three different widths. */
function num(n: number, places = 3): string {
  if (!Number.isFinite(n)) return "—"
  return n.toFixed(places).replace(/\.?0+$/, "") || "0"
}

function Vec({ v, places = 3 }: { v: readonly number[]; places?: number }) {
  return <span className="font-mono text-[11px]">{v.map((n) => num(n, places)).join("  ")}</span>
}

/**
 * A texture slot: the file the material points at, and a look at it.
 *
 * PMX stores a path relative to the .pmx, in Shift-JIS-era Windows form —
 * backslashes, mixed case, sometimes a folder that no longer matches what the
 * archive actually shipped. So the lookup falls back to the basename, which is
 * what makes a model whose author moved its textures still show them.
 */
function TextureSlot({ label, path, src }: { label: string; path: string; src: string | null }) {
  const [open, setOpen] = useState(false)
  const name = path.split(/[\\/]/).pop() || path
  return (
    <>
      <button
        disabled={!src}
        onClick={() => setOpen(true)}
        className={cn(
          "mt-1.5 flex w-full items-center gap-1.5 px-4 text-left first:mt-0",
          src ? "hover:bg-white/[0.04]" : "cursor-default",
        )}
      >
        {/* Label left and value right, like every other row here — the panel is
            read down its labels, and a slot that moved its own somewhere else
            would be the one row you have to stop and parse. */}
        <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-foreground" title={path}>
          {name}
        </span>
        {/* The thumbnail is the point of the row. A filename says which file is
            bound; the picture says whether it is the RIGHT one, which is the
            question anyone opens this panel to answer. */}
        <span className="size-5 shrink-0 overflow-hidden rounded-chip border border-line-strong" style={CHECKER}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && <img src={src} alt="" className="size-full object-contain" />}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Sized to the IMAGE, capped to the window. A texture is looked at to
            judge its content and its resolution, and a fixed box that letterboxes
            a 2048² atlas next to a 64² toon ramp hides the difference. */}
        {/* No chrome. An image viewer is the picture and a way out of it —
            every title bar, toolbar and caption is something between you and the
            thing you opened it to look at. Escape and a click outside close it,
            which is what people already try. */}
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none sm:max-w-none"
        >
          {/* Radix needs a title for the a11y tree even when the design has no
              place to put one. */}
          <DialogTitle className="sr-only">{name}</DialogTitle>
          {/* object-contain, capped against the viewport: a 2048² atlas and a
              32×1 toon ramp both have to be legible, and only one of them
              survives being shown at 1:1. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && (
            <img
              src={src}
              alt={name}
              className="max-h-[85dvh] max-w-[90vw] rounded-surface object-contain"
              style={CHECKER}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Alpha is unreadable without it: half of these files are cutouts, and a
 *  transparent PNG on a dark panel just looks like a dark PNG. */
const CHECKER = {
  backgroundImage:
    "linear-gradient(45deg,#2a2a2e 25%,transparent 25%),linear-gradient(-45deg,#2a2a2e 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2e 75%),linear-gradient(-45deg,transparent 75%,#2a2a2e 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
  backgroundColor: "#1e1e21",
} as const

/**
 * Every texture the document names, resolved to something an <img> can load.
 *
 * Two sources, because a model gets here two ways. Opened off disk it arrives
 * as a bundle of Files and the texture is one of them; served from a folder it
 * has no Files at all and the texture sits beside the .pmx, exactly where the
 * engine resolved it from. A panel that only handled the first showed empty
 * slots for the model the app boots with.
 *
 * Matching is by BASENAME, lowercased. PMX paths are Windows-era — backslashes,
 * mixed case, and often a folder that no longer matches what the archive
 * actually shipped — so the full path is the wrong key to insist on.
 *
 * Built for the whole document at once rather than per slot: the URLs are
 * created in one place, which is what lets them be revoked in one place. A
 * per-slot object URL leaks one image for the life of the tab every time you
 * select a material.
 */
function useTextureSrc(doc: PmxDocument, files: File[], baseDir: string | null): Map<string, string> {
  return useMemo(() => {
    const byBase = new Map<string, File>()
    for (const f of files) {
      const base = f.name.split(/[\\/]/).pop()?.toLowerCase()
      if (base && !byBase.has(base)) byBase.set(base, f)
    }
    const out = new Map<string, string>()
    for (const path of doc.textures) {
      const file = byBase.get(path.split(/[\\/]/).pop()?.toLowerCase() ?? "")
      if (file) {
        out.set(path, URL.createObjectURL(file))
      } else if (baseDir) {
        // The engine resolves against the .pmx's own directory, so this has to
        // agree with it or the panel shows a texture the canvas is not using.
        const rel = path.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")
        out.set(path, assetUrl(baseDir, rel))
      }
    }
    return out
  }, [doc, files, baseDir])
}

const BONE_FLAGS = [
  "tail is bone",
  "rotatable",
  "movable",
  "visible",
  "operable",
  "IK",
  "",
  "local append",
  "append rotate",
  "append move",
  "fixed axis",
  "local axes",
  "after physics",
  "external parent",
]

const MATERIAL_FLAGS = [
  "double-sided",
  "ground shadow",
  "to shadow map",
  "from self-shadow",
  "edge",
  "vertex colour",
  "point draw",
  "line draw",
]

function BoneFields({ bone, doc, edit }: { bone: PmxBone; doc: PmxDocument; edit: EditBone }) {
  const boneName = (i: number | undefined) =>
    i === undefined || i < 0 || i >= doc.bones.length ? "—" : doc.bones[i].name
  return (
    <>
      <Section label="Bone">
        <Field label="Name">
          <TextCell value={bone.name} onCommit={(v) => edit({ rename: v })} />
        </Field>
        <Field label="English">
          <TextCell value={bone.nameEn} onCommit={(v) => edit({ nameEn: v })} />
        </Field>
        <Field label="Position">
          <VecCell v={bone.position} onCommit={(v) => edit({ position: v })} />
        </Field>
        {/* Read-only: an index into the bone list. Re-parenting has to move the
            bone in document order and repair every reference that follows it,
            which is its own transform. */}
        <Field label="Parent">{boneName(bone.parentIndex)}</Field>
        <Field label="Deform layer">
          <NumCell value={bone.layer} onCommit={(v) => edit({ layer: Math.round(v) })} />
        </Field>
        <Field label="Flags">
          <FlagCells bits={bone.flags} names={BONE_FLAGS} onCommit={(v) => edit({ flags: v })} />
        </Field>
        {/* 表示先: a bone, or a raw offset. PMX stores one or the other and the
            flag says which, so showing the field that is not in use would be
            showing a number the file does not mean. */}
        <Field label="Tail">
          {bone.tailBoneIndex !== undefined ? boneName(bone.tailBoneIndex) : <Vec v={bone.tailPosition ?? [0, 0, 0]} />}
        </Field>
      </Section>

      {bone.appendParentIndex !== undefined && (
        <Section label="Append">
          <Field label="Parent">{boneName(bone.appendParentIndex)}</Field>
          <Field label="Ratio">{num(bone.appendRatio ?? 0)}</Field>
        </Section>
      )}

      {(bone.fixedAxis || bone.localAxisX || bone.externalKey !== undefined) && (
        <Section label="Axis">
          {bone.fixedAxis && (
            <Field label="Fixed">
              <Vec v={bone.fixedAxis} />
            </Field>
          )}
          {bone.localAxisX && (
            <Field label="Local X">
              <Vec v={bone.localAxisX} />
            </Field>
          )}
          {bone.localAxisZ && (
            <Field label="Local Z">
              <Vec v={bone.localAxisZ} />
            </Field>
          )}
          {bone.externalKey !== undefined && <Field label="External key">{bone.externalKey}</Field>}
        </Section>
      )}

      {bone.ik && (
        <Section label="IK">
          <Field label="Target">{boneName(bone.ik.targetIndex)}</Field>
          <Field label="Loop">{bone.ik.loopCount}</Field>
          <Field label="Angle limit">{num(bone.ik.limitAngle, 4)}</Field>
          {bone.ik.links.map((l, i) => (
            <Field key={i} label={i === 0 ? "Links" : ""}>
              <span className="flex flex-col items-end">
                <span>{boneName(l.boneIndex)}</span>
                {l.hasLimit && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {(l.limitMin ?? []).map((n) => num(n, 2)).join(" ")} → {(l.limitMax ?? []).map((n) => num(n, 2)).join(" ")}
                  </span>
                )}
              </span>
            </Field>
          ))}
        </Section>
      )}
    </>
  )
}

function MaterialFields({
  material,
  doc,
  src,
  edit,
}: {
  material: PmxMaterial
  doc: PmxDocument
  src: Map<string, string>
  edit: EditMaterial
}) {
  const tex = (i: number) => (i < 0 || i >= doc.textures.length ? null : doc.textures[i])
  const texture = tex(material.textureIndex)
  const sphere = tex(material.sphereIndex)
  // A shared toon is one of MMD's own ten ramps, which live in the app and not
  // in the model — so it has a number, never a file.
  const toon = material.toonShared ? null : tex(material.toonIndex)
  return (
    <>
      <Section label="Material">
        <Field label="Name">
          <TextCell value={material.name} onCommit={(v) => edit({ rename: v })} />
        </Field>
        <Field label="English">
          <TextCell value={material.nameEn} onCommit={(v) => edit({ nameEn: v })} />
        </Field>
        {/* Faces, not indices. The document counts indices because that is what
            a material owns, but nobody thinks in threes. */}
        <Field label="Faces">{(material.indexCount / 3).toLocaleString()}</Field>
        <Field label="Flags">
          <FlagCells bits={material.drawFlags} names={MATERIAL_FLAGS} onCommit={(v) => edit({ drawFlags: v })} />
        </Field>
        <Field label="Memo">
          <TextCell value={material.memo} onCommit={(v) => edit({ memo: v })} />
        </Field>
      </Section>

      <Section label="Shading">
        <Field label="Diffuse">
          <ColorCell c={material.diffuse} alpha onCommit={(c) => edit({ diffuse: c as [number, number, number, number] })} />
        </Field>
        <Field label="Specular">
          <ColorCell c={material.specular} onCommit={(c) => edit({ specular: [c[0], c[1], c[2]] })} />
        </Field>
        <Field label="Power">
          <NumCell value={material.specularPower} onCommit={(v) => edit({ specularPower: v })} />
        </Field>
        <Field label="Ambient">
          <ColorCell c={material.ambient} onCommit={(c) => edit({ ambient: [c[0], c[1], c[2]] })} />
        </Field>
        <Field label="Edge">
          <ColorCell c={material.edgeColor} alpha onCommit={(c) => edit({ edgeColor: c as [number, number, number, number] })} />
        </Field>
        <Field label="Edge size">
          <NumCell value={material.edgeSize} onCommit={(v) => edit({ edgeSize: v })} />
        </Field>
      </Section>

      <Section label="Textures">
        {texture ? (
          <TextureSlot label="Texture" path={texture} src={src.get(texture) ?? null} />
        ) : (
          <Field label="Texture">—</Field>
        )}
        {sphere ? (
          <TextureSlot label="Sphere" path={sphere} src={src.get(sphere) ?? null} />
        ) : (
          <Field label="Sphere">—</Field>
        )}
        {material.toonShared ? (
          <Field label="Toon">shared {String(material.toonIndex + 1).padStart(2, "0")}</Field>
        ) : toon ? (
          <TextureSlot label="Toon" path={toon} src={src.get(toon) ?? null} />
        ) : (
          <Field label="Toon">—</Field>
        )}
      </Section>
    </>
  )
}

/** What a field commits: the patch without the `name`, since the panel already
 *  knows which subject it is showing. One field is a patch of one — the batch
 *  shape is still there underneath, in setMaterials/setBones. */
type EditMaterial = (patch: Omit<MaterialPatch, "name">) => void
type EditBone = (patch: Omit<BonePatch, "name">) => void

/**
 * The right dock. Summoned by a selection and gone with it — the on-demand half
 * of the layout, against the left dock's constant one.
 */
export function PmxInspector({
  doc,
  bone,
  material,
  files,
  baseDir,
  onEditBone,
  onEditMaterial,
  onClose,
  closeLabel,
}: {
  doc: PmxDocument
  bone: string | null
  material: string | null
  /** Everything that arrived with the .pmx — the disk-opened case. */
  files: File[]
  /** The .pmx's own directory — the served case. */
  baseDir: string | null
  onEditBone: (patch: BonePatch) => void
  onEditMaterial: (patch: MaterialPatch) => void
  onClose: () => void
  closeLabel: string
}) {
  const src = useTextureSrc(doc, files, baseDir)
  // The object URLs among them are this panel's to release. Keyed on the map,
  // so a new document revokes the old one's images and nothing else does.
  useEffect(
    () => () => {
      for (const u of src.values()) if (u.startsWith("blob:")) URL.revokeObjectURL(u)
    },
    [src],
  )

  const boneEntry = bone ? (doc.bones.find((b) => b.name === bone) ?? null) : null
  const materialEntry = material ? (doc.materials.find((m) => m.name === material) ?? null) : null
  const subject = boneEntry ?? materialEntry
  if (!subject) return null

  return (
    <>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={subject.name}>
          {subject.name}
        </span>
        <button
          onClick={onClose}
          aria-label={closeLabel}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {boneEntry ? (
          <BoneFields bone={boneEntry} doc={doc} edit={(p) => onEditBone({ ...p, name: boneEntry.name })} />
        ) : (
          <MaterialFields
            material={materialEntry!}
            doc={doc}
            src={src}
            edit={(p) => onEditMaterial({ ...p, name: materialEntry!.name })}
          />
        )}
      </div>
    </>
  )
}
