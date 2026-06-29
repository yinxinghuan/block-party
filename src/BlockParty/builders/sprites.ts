// ============================================================================
//  Sprite billboard — a flat PlaneGeometry with a texture, for generated
//  cartridge enemies that have a gen-image sprite URL. Always faces the
//  camera (classic billboard). No rig — the Scene Monsters useFrame already
//  guards `if (rig) { ... }` so sprite enemies skip the shamble animation
//  cleanly while still participating in knockback, hit-flash, and death flight.
// ============================================================================

import * as THREE from 'three';

export function makeSpriteBillboard(
  tex: THREE.Texture,
  scale: number = 1.0,
): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.4,
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: true,
  });

  const geo = new THREE.PlaneGeometry(1.0, 1.0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const g = new THREE.Group();
  g.add(mesh);
  g.scale.setScalar(scale);
  // Marker: Scene Monsters useFrame checks for sprite enemies via this flag.
  g.userData.isSprite = true;

  return g;
}
