"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react"
import { Engine, Vec3, parsePmxFolderInput, type Model } from "reze-engine"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { hexToLinear, hexToSrgb } from "@/lib/color"

/** The three live overlay layers the engine rebuilds from the pose each frame. */
type Layer = "bones" | "rigidbodies" | "vertices"

const LAYERS: { id: Layer; label: string; hint: string }[] = [
  { id: "bones", label: "Bones", hint: "Coloured by what drives them" },
  { id: "rigidbodies", label: "Rigidbodies", hint: "The volumes the solver collides" },
  { id: "vertices", label: "Vertices", hint: "The posed mesh and its topology" },
]

const MODEL_KEY = "subject"

/** The family's demo figure, so the viewport opens on a scene instead of an
 *  empty grid. Nothing about it is special — the folder picker replaces it. */
const DEMO_MODEL = "https://assets.reze.one/demo/reze/reze.pmx"

const BACKGROUND = "#f6cfff"
const GROUND = "#ed6aff"

/**
 * Group the materials by what they ARE — hair, skin, cloth, eye — so they render
 * through the NPR graphs rather than the neutral default. Hidden across the
 * compile: the graphs swap in asynchronously, and a frame of flat plastic before
 * they land is the one thing worse than waiting for them.
 *
 * The engine carries the JP/CN/EN name hints, so a standard-named model needs no
 * overrides here. Anything it cannot place stays ungrouped.
 */
async function autoStyle(engine: Engine, key: string): Promise<void> {
  engine.setModelTransform(key, { visible: false })
  try {
    await engine.autoStyleGroups(key)
  } finally {
    engine.setModelTransform(key, { visible: true })
  }
}

function countsOf(model: Model) {
  return {
    bones: model.getSkeleton().bones.length,
    rigidbodies: model.getRigidbodies().length,
    vertices: model.getGeometry().positions.length / 3,
  }
}

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelName, setModelName] = useState<string | null>(null)
  const [counts, setCounts] = useState({ bones: 0, rigidbodies: 0, vertices: 0 })
  const [shown, setShown] = useState<Record<Layer, boolean>>({
    bones: true,
    rigidbodies: false,
    vertices: false,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    let engine: Engine | null = null

    const boot = async () => {
      try {
        const created = new Engine(canvas, {
          camera: { distance: 31.5, target: new Vec3(0, 11.5, 0) },
          sun:{
            direction: new Vec3(0.0, -0.5, 1),
          },
        })
        await created.init()
        if (disposed) {
          created.dispose()
          return
        }
        engine = created
        engineRef.current = created
        created.setBackgroundColor(hexToSrgb(BACKGROUND))
        created.setOutlineEnabled(true)
        created.addGround({ diffuseColor: hexToLinear(GROUND) })
        created.runRenderLoop()
        setReady(true)

        const model = await created.loadModel(MODEL_KEY, DEMO_MODEL)
        if (disposed) return
        await autoStyle(created, MODEL_KEY)
        if (disposed) return
        setModelName("reze")
        setCounts(countsOf(model))
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void boot()

    return () => {
      disposed = true
      engineRef.current = null
      engine?.dispose()
    }
  }, [])

  // The engine holds the layers AND their colours, so pushing the toggles here
  // is the whole binding — no second copy of the state, and no palette to drift
  // out of step with what design, rig and studio draw.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const name = modelName ? MODEL_KEY : null
    engine.setBoneOverlay(shown.bones ? name : null)
    engine.setRigidbodyOverlay(shown.rigidbodies ? name : null)
    engine.setVertexOverlay(shown.vertices ? name : null)
  }, [shown, modelName, ready])

  const openFolder = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const engine = engineRef.current
    const picked = parsePmxFolderInput(event.target.files)
    event.target.value = ""
    if (!engine || picked.status === "empty") return
    if (picked.status === "not_directory") {
      setError("Select a folder, not individual files.")
      return
    }
    if (picked.status === "no_pmx") {
      setError("No .pmx file in that folder.")
      return
    }
    // A folder with several .pmx files needs a chooser; take the first for now.
    const pmxFile = picked.status === "single" ? picked.pmxFile : picked.files.find((f) => f.name.endsWith(".pmx"))
    if (!pmxFile) return

    setError(null)
    setLoading(true)
    try {
      engine.removeModel(MODEL_KEY)
    } catch {
      /* nothing loaded yet */
    }
    try {
      const model = await engine.loadModel(MODEL_KEY, { files: picked.files, pmxFile })
      await autoStyle(engine, MODEL_KEY)
      setModelName(pmxFile.name.replace(/\.pmx$/i, ""))
      setCounts(countsOf(model))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Every overlay is a list of named, bounded parameters — the pass is one
  // reader of it and the clipboard is another.
  const copyLayers = useCallback(async () => {
    const engine = engineRef.current
    if (!engine) return
    const active = LAYERS.filter((l) => l.id !== "vertices" && shown[l.id]).map(
      (l) => [l.id, engine.getOverlayPrimitives(l.id as "bones" | "rigidbodies")] as const,
    )
    await navigator.clipboard.writeText(JSON.stringify(Object.fromEntries(active), null, 2))
  }, [shown])

  const anyShown = LAYERS.some((l) => shown[l.id])

  return (
    // The canvas is the whole surface and the dock floats on it, so the figure
    // stays where the camera framed it however many docks open. No backdrop
    // blur: it re-samples the viewport every frame the scene animates, which is
    // exactly when the dock is open. bg-surface-raised is opaque enough.
    <main className="relative h-dvh w-screen select-none overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      <aside className="absolute top-3 left-3 flex w-60 flex-col overflow-hidden rounded-surface border border-line-strong bg-surface-raised">
        <div className="flex h-10 items-center px-3 text-[13px] font-medium">Reze Build</div>
        <Separator className="bg-line" />

        <div className="flex flex-col gap-2 p-3">
          <Button size="sm" variant="outline" disabled={!ready} onClick={() => folderInputRef.current?.click()}>
            {loading ? "Opening…" : "Open model folder"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {modelName ?? (ready ? "Loading the demo figure…" : "Starting the viewport…")}
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <Separator className="bg-line" />

        <div className="flex flex-col gap-3 p-3">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Overlays</div>
          {LAYERS.map((layer) => (
            <label key={layer.id} className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px]">
                  {layer.label}
                  {modelName && <span className="text-muted-foreground"> · {counts[layer.id]}</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">{layer.hint}</span>
              </span>
              <Switch
                size="sm"
                className="mt-0.5"
                checked={shown[layer.id]}
                disabled={!modelName}
                onCheckedChange={(on) => setShown((prev) => ({ ...prev, [layer.id]: on }))}
              />
            </label>
          ))}
          <Button size="xs" variant="ghost" disabled={!modelName || !anyShown} onClick={copyLayers}>
            Copy as JSON
          </Button>
        </div>
      </aside>

      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="fixed top-0 left-0 -z-10 h-px w-px opacity-0"
        tabIndex={-1}
        {...({ webkitdirectory: "", mozdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
        onChange={openFolder}
      />
    </main>
  )
}
