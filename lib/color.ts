import { Vec3 } from "reze-engine"

/**
 * Two conversions, because the engine takes colour in two different spaces and
 * the same hex means a different Vec3 in each. Getting it wrong is not an error
 * anywhere — the scene just renders a lighter version of the colour you picked.
 *
 *   · display space — what a CSS background of that hex shows, applied after
 *     tonemapping. setBackgroundColor.
 *   · linear light — what a material's albedo is. addGround's diffuseColor and
 *     gridLineColor, world/sun/bloom colour.
 *
 * Same pair as reze-design's lib/scene-settings.
 */
export function hexToSrgb(hex: string): Vec3 {
  const n = parseInt(hex.replace("#", ""), 16)
  return new Vec3(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255)
}

export function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.replace("#", ""), 16)
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return new Vec3(toLinear(((n >> 16) & 0xff) / 255), toLinear(((n >> 8) & 0xff) / 255), toLinear((n & 0xff) / 255))
}

/** Display-space rgba tuple for an overlay primitive's `color`. The overlay pass
 *  draws after the composite, so what is set here is what appears — no tonemap
 *  between. */
export function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16)
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255, alpha]
}
