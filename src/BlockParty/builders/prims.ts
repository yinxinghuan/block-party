// Minimal prims helper — ported subset of _lowpoly_lab/lib/prims.js so that
// Block Party can instantiate the same imperative builders (zombies, survivors,
// street props) directly inside its react-three/fiber Scene without pulling the
// full lab. Same look-and-feel guarantees as the lab (flat-shaded, cast/receive
// shadow, voxel-snap optional).

import * as THREE from 'three';

// Locked palette excerpt — the values Block Party's builders actually need.
export const P = {
  // metal / stone
  ironD: 0x3b3b44, ironM: 0x5c5c68, steel: 0x8b8f98, slate: 0x5b626b,
  stone: 0x9aa1a8, stoneD: 0x6f757c,
  // warm neutrals
  white: 0xf4f1e8, panel: 0xdcd7c9, panelD: 0xc2bba9, cream: 0xf3ead4,
  // accents
  accent: 0x3fb6ac, gold: 0xf2c14e, glass: 0xbfe6ff,
  // primary swatches (zombie clothing tint, survivor clothing, etc.)
  red: 0xe0483b, orange: 0xffb13b, green: 0x4fae44, blue: 0x36a3ec,
  purple: 0xb05de8, coral: 0xff7a4d, petal: 0xff85a8,
  // wood + amber — for the V4 cultural archetype pack (cowboy / firefighter
  // / biker tool belts + Stetson). amber is the saturated honey base the
  // cowboy hat darkens from; woodD/woodM are leather + boot browns.
  amber: 0xe0a830, woodD: 0x4a3526, woodM: 0x8b6f47,
  // skin + hair
  skin: 0xf2c79a, skinD: 0xe2a877, skinTan: 0xc68642, skinDk: 0x8d5524,
  hairDark: 0x3a2f28, hairGrey: 0xd2d0d4, hairBlond: 0xf2c531, hairBrown: 0x6b4423,
};

// Horror palette — extracted from _lowpoly_lab/builders/monsters.js MP so
// all the ported builders (werewolf / skeleton / mummy / etc.) share the
// same tints they were tuned to.
export const MP_HORROR = {
  pale: 0xcdd2cf, paleD: 0xb0b6b2,
  suit: 0x1b1b22, suitD: 0x12121a,
  blood: 0x7d1820, bloodD: 0x521017,
  bone:  0xe9e2cd, boneD: 0xcdc4a7,
  rot:   0x83a05a, rotD:  0x5f7a3e, rotG: 0x4a6230,
  fur:   0x5b4a3b, furD:  0x3f3327, furL: 0x6f5a46,
  spectre: 0xbcd6e2,
  band:  0xd9cdb0, bandD: 0xb6a988,
  glowRed: 0xff3322, glowYel: 0xffd23f, glowGrn: 0x9bff5a, glowPale: 0xd8ecff,
};

// Cached materials so 24 zombies don't allocate 24× the same materials.
const matCache = new Map<string, THREE.MeshStandardMaterial>();

interface MatOpt {
  r?: number;       // roughness
  e?: number;       // emissive hex
  ei?: number;      // emissive intensity
  o?: number;       // opacity
}

function M(hex: number, opt?: MatOpt): THREE.MeshStandardMaterial {
  const r = opt?.r ?? 0.9;
  const e = opt?.e ?? 0;
  const ei = opt?.ei ?? 0;
  const o = opt?.o ?? 1;
  const k = `${hex}|${r}|${e}|${ei}|${o}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: 0, flatShading: true });
    if (e) { m.emissive = new THREE.Color(e); m.emissiveIntensity = ei; }
    if (o < 1) { m.transparent = true; m.opacity = o; }
    matCache.set(k, m);
  }
  return m;
}

export function box(
  w: number, h: number, d: number, hex: number,
  x: number, y: number, z: number,
  opt?: MatOpt,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(hex, opt));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(
  rt: number, rb: number, h: number, seg: number, hex: number,
  x: number, y: number, z: number,
  opt?: MatOpt,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(hex, opt));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cone(
  r: number, h: number, seg: number, hex: number,
  x: number, y: number, z: number,
  opt?: MatOpt,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), M(hex, opt));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function darken(hex: number, f = 0.66): number {
  const r = ((hex >> 16) & 255) * f;
  const g = ((hex >> 8) & 255) * f;
  const b = (hex & 255) * f;
  return ((r << 16) | (g << 8) | b) | 0;
}

// Walk through every mesh in a group and mark it ready for shadow casting.
// Mirrors the lab's finish() helper.
export function finish(g: THREE.Group) {
  g.traverse(o => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });
}
