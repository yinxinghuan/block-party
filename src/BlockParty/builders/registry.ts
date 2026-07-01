// ============================================================================
//  BUILDER REGISTRY — named, swappable visuals a generated cartridge can pick
//  from by string key. The cartridge GENERATOR (an LLM) emits a pure-JSON spec
//  that references these keys; the resolver (cartridge/resolve.ts) binds them to
//  actual builders. Hand-written cartridges (zombie.ts) call builders directly
//  and don't need this — it exists so a JSON spec can become a running game.
//
//  v1 visual strategy: pick an existing house-style creature per role and shift
//  its colour to the theme. True per-theme silhouettes (gen-image sprites) are
//  a later upgrade; until then, recolour + rename + new palette + your face on
//  the hero is what makes one sentence feel like a different game.
// ============================================================================

import * as THREE from 'three';
import {
  makeZombie, makeWerewolf, makeSkeleton, makeMummy, makeGhost,
  type ZombieGroup,
} from './monsters';

/** Non-boss creatures a spec can assign to a gameplay role. Boss visuals are
 *  selected separately from boss behaviour via CartridgeSpec.bossLadder.skin. */
export type CreatureKey = 'zombie' | 'werewolf' | 'skeleton' | 'mummy' | 'ghost';

export const CREATURE_BUILDERS: Record<CreatureKey, () => ZombieGroup> = {
  zombie:   () => makeZombie('lurker'),
  werewolf: () => makeWerewolf() as ZombieGroup,
  skeleton: () => makeSkeleton() as ZombieGroup,
  mummy:    () => makeMummy()    as ZombieGroup,
  ghost:    () => makeGhost()    as ZombieGroup,
};

export const CREATURE_KEYS = Object.keys(CREATURE_BUILDERS) as CreatureKey[];

/** Shift every material's HUE toward `hex` while keeping each material's own
 *  saturation/lightness, so the creature reads as the SAME model in a new
 *  colour family (team-colour reskin) rather than a flat repaint. Materials are
 *  cloned so the shared geometry/material cache isn't mutated across instances.
 *  Emissive (glowing eyes etc.) is hue-nudged but keeps its brightness. */
export function recolorGroup(root: THREE.Object3D, hex: string): void {
  const target = new THREE.Color(hex);
  const t = { h: 0, s: 0, l: 0 };
  target.getHSL(t);
  const hsl = { h: 0, s: 0, l: 0 };

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const raw = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!raw) return;
    const mats = Array.isArray(raw) ? raw : [raw];
    mesh.material = mats.map((mat) => {
      const m = mat as THREE.MeshStandardMaterial;
      if (!m.color) return m;
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.color.getHSL(hsl);
      // keep this material's own lightness (so light stays light), blend its
      // saturation toward the theme so the whole figure shares a colour family
      c.color.setHSL(t.h, Math.min(1, hsl.s * 0.5 + t.s * 0.5), hsl.l);
      if (c.emissive && (c.emissive.r || c.emissive.g || c.emissive.b)) {
        const e = { h: 0, s: 0, l: 0 };
        c.emissive.getHSL(e);
        c.emissive.setHSL(t.h, e.s, e.l);
      }
      return c;
    });
    if (!Array.isArray(raw)) mesh.material = (mesh.material as THREE.Material[])[0];
  });
}
