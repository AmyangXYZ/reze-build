import { hexToRgba } from "@/lib/color"
import type { BoneOverlayOptions, RigidbodyOverlayOptions } from "reze-engine"

/**
 * Overlay colours for this viewport.
 *
 * Built on a rule rather than picked one at a time: chroma runs at ~95% of what
 * sRGB can hold at each hue, and the hues stay clear of the scene's own magenta
 * (~320) so the rig never sits on top of its own colour. Lightness is high,
 * which is a deliberate trade — this scene runs from a white shirt to black
 * stockings, no single lightness reads on both, and bright lines carry against
 * the dark cloth where the pale background separates them by chroma instead.
 *
 * Bones lead on MMD's blue, which is the rig's character: `plain` is most of the
 * skeleton, so whatever colour it takes is the colour the overlay reads as. The
 * five that carry meaning sit clear of it on the hue circle.
 *
 * Two classes break the pattern on purpose. `static` bodies drop to 45% chroma
 * because they are the many and should recede. `selected` keeps a vivid blue of
 * its own, the app's one accent for selection, so it never reads as another
 * category.
 */
export const BONE_PALETTE: BoneOverlayOptions["palette"] = {
  /** Nothing in particular drives it — most of the skeleton, in MMD's blue. */
  plain: hexToRgba("#4f49d4"),
  /** Has an IK chain (ikLinks): 足ＩＫ and friends. */
  ik: hexToRgba("#e3831d"),
  /** A dynamic rigidbody moves it — hair, skirt, anything the solver owns. */
  physics: hexToRgba("#1da751"),
  /** 付与親: inherits rotation or translation from another bone. */
  append: hexToRgba("#a222ac"),
  /** 軸制限: fixed-axis, turns about one axis only — the twist bones. */
  twist: hexToRgba("#f41f46"),
  /** The one you picked — it lights up rather than changing family. */
  selected: hexToRgba("#2bd5e5"),
}

/**
 * Solid volumes, so alpha does the work colour used to: low enough to see the
 * body through them and the rig behind them.
 *
 * Cool against warm, which is the oldest reading of this pair and the one every
 * physics debug view uses: the pale blue follows its bone, the hot orange is
 * driven by the solver. Blue-300 rather than a mid blue — light enough that it
 * never reads as the same thing as the blue-violet the rig is drawn in.
 */
export const RIGIDBODY_PALETTE: RigidbodyOverlayOptions["palette"] = {
  /** Follows its bone (PMX mode 0). The many, so they sit pale and recede. */
  static: hexToRgba("#93c5fd", 0.28),
  /** The solver drives it, and drives the bone back (PMX modes 1 and 2). */
  dynamic: hexToRgba("#f04e14", 0.38),
  selected: hexToRgba("#ffd200", 0.5),
}



/** The mesh itself. Amber, because it has to carry over pale skin and black
 *  cloth alike and the rig owns the blues and greens. */
export const VERTEX_COLOR = hexToRgba("#ffd200", 0.95)
