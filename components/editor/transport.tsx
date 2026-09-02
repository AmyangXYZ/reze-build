"use client"

// Play the loaded motion, to see the rig move.
//
// Bottom-centre and NOT expandable, deliberately: this is not a timeline and
// will not become one. reze.studio owns curve editing and reze.build owns
// scheduling — what a model editor needs is "does this rig deform correctly",
// which is a play button and a scrub bar. Anything more would be a second
// timeline to keep in step with theirs.
//
// Absent until a motion is loaded. A transport with nothing to play is a strip
// of screen the canvas should have.

import { useEffect, useRef, useState } from "react"
import { Pause, Play, SkipBack } from "lucide-react"
import type { Model } from "reze-engine"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Surface } from "./surface"

const FPS = 30

export function Transport({ model, clip }: { model: Model | null; clip: string | null }) {
  const [progress, setProgress] = useState({ current: 0, duration: 0, playing: false })
  const scrubbing = useRef(false)

  // Polled on a frame loop rather than pushed from the render callback: the
  // engine draws at 60fps and React does not need to hear about every one of
  // them. State is set only when the displayed frame actually changes.
  useEffect(() => {
    if (!model || !clip) return
    let raf = 0
    let lastFrame = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (scrubbing.current) return
      const p = model.getAnimationProgress()
      const frame = Math.round(p.current * FPS)
      if (frame === lastFrame && p.playing === progress.playing) return
      lastFrame = frame
      setProgress({ current: p.current, duration: p.duration, playing: p.playing })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [model, clip, progress.playing])

  if (!model || !clip) return null

  const frames = Math.max(1, Math.round(progress.duration * FPS))
  const frame = Math.round(progress.current * FPS)

  return (
    <Surface placement="sheet" className="pointer-events-auto flex h-10 w-[26rem] items-center gap-2 px-2 text-xs">
      <Button
        variant="ghost"
        size="icon"
        aria-label={progress.playing ? "Pause" : "Play"}
        onClick={() => (progress.playing ? model.pause() : model.play(clip, { loop: true }))}
        className="size-7 shrink-0 rounded-lg text-foreground hover:bg-white/5"
      >
        {progress.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Rewind"
        onClick={() => {
          model.stop()
          model.play(clip, { loop: true })
          model.pause()
        }}
        className="size-7 shrink-0 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <SkipBack className="size-4" />
      </Button>

      <Slider
        min={0}
        max={frames}
        step={1}
        value={[frame]}
        onPointerDown={() => (scrubbing.current = true)}
        onPointerUp={() => (scrubbing.current = false)}
        onValueChange={([f]) => {
          setProgress((p) => ({ ...p, current: f / FPS }))
          model.seek(f / FPS)
        }}
        className="min-w-0 flex-1"
      />

      {/* Frames, not seconds: a VMD is authored in frames at 30fps and every
          other MMD tool counts them, so a second reading would be the one number
          nobody could cross-reference. */}
      <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {frame} / {frames}
      </span>
    </Surface>
  )
}
