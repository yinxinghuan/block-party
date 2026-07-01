import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CAMERA_FOV, CAMERA_POS, ARENA_HALF,
  PLAYER_SPEED,
  getLevelTuning,
} from '../constants';
import { useGameLoop, GameRef, PickupKind, SfxKey } from '../hooks/useGameLoop';
import type { Stick, Pillar, PillarVariant } from '../types';
import { flashWhite, type ZombieGroup, type ZombieTier } from '../builders/monsters';
import { makeFlashlight, type CharacterGroup } from '../builders/characters';
import { CARTRIDGE, type HeroId } from '../cartridge';
import { makeWeapon, WEAPONS } from '../builders/weapons';
import type { WeaponId } from '../builders/weapons';
import { PERKS } from '../perks';

interface SceneProps {
  state: React.MutableRefObject<GameRef>;
  playing: boolean;
  level: number;            // drives per-level palette
  stickRef: React.MutableRefObject<Stick>;
  survivor: HeroId;     // selected hero for this run
  heroPhotoUrl?: string | null;   // identity hero: face texture URL (avatar / upload)
  onScore: (s: number) => void;
  onDepth: (d: number) => void;
  onLightRadius: (r: number) => void;
  onGameOver: (final: number) => void;
  onPickup?: (kind: PickupKind, value: number) => void;
  onStrikeHit?: () => void;
  playSfx: (k: SfxKey) => void;
  haptic?: (k: 'light' | 'heavy') => void;
}

// Follow camera — anchored to the player, slight lerp. Mirrors penguin-sumo.
function FollowCamera({ state }: { state: React.MutableRefObject<GameRef> }) {
  const { camera, size } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const smoothLook = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  useEffect(() => {
    camera.position.set(CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2]);
    (camera as THREE.PerspectiveCamera).fov = CAMERA_FOV;
    (camera as THREE.PerspectiveCamera).near = 0.1;
    (camera as THREE.PerspectiveCamera).far = 200;
    camera.lookAt(0, 0, 0);
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  useFrame((_, delta) => {
    const d = state.current;
    // Frame-rate-independent follow. A fixed 0.16 per-frame lerp drifts
    // with `delta` — long frames make the camera lag more, then snap when
    // the next short frame happens. `1 - exp(-stiffness * delta)` produces
    // identical dynamics regardless of FPS.
    const STIFFNESS = 9.0;
    const k = 1 - Math.exp(-STIFFNESS * Math.min(delta, 0.05));

    desired.set(d.pos.x + CAMERA_POS[0], CAMERA_POS[1], d.pos.z + CAMERA_POS[2]);
    camera.position.lerp(desired, k);

    // CRUCIAL: also smooth the lookAt target at the SAME rate. The old
    // code lerped position but snapped lookAt straight to d.pos every
    // frame; the asymmetry made the camera visibly swing/pan-correct on
    // every step the player took, which the user read as a constant
    // "shake during movement". Lerping both keeps them in lock-step.
    lookTarget.set(d.pos.x, 0, d.pos.z);
    smoothLook.lerp(lookTarget, k);

    // Shake offset — only ever bumped on player damage + boss kill now
    // so it's invisible 99% of the time and doesn't compound with the
    // follow camera.
    const shake01 = d.cameraShakeT > 0 ? Math.min(1, d.cameraShakeT / 0.3) : 0;
    if (shake01 > 0) {
      const amp = d.cameraShakeMag * shake01 * shake01;
      camera.position.x += (Math.random() - 0.5) * amp * 2;
      camera.position.y += (Math.random() - 0.5) * amp;
      camera.position.z += (Math.random() - 0.5) * amp * 2;
    }
    camera.lookAt(smoothLook);
  });
  return null;
}

// Rain (night 2) — InstancedMesh of thin vertical lines falling at ~24u/s,
// wrapping when they hit the asphalt. Plus a periodic lightning flash that
// briefly punches the ambient light up so the street looks lit by a far
// thunderhead.
function Rain({ visible }: { visible: boolean }) {
  const COUNT = 220;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => {
    const a = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      a[i * 3 + 0] = (Math.random() - 0.5) * 70;
      a[i * 3 + 1] = Math.random() * 12;
      a[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    return a;
  }, []);
  useFrame((_, delta) => {
    const m = meshRef.current;
    if (!m || !visible) return;
    const c = Math.min(delta, 0.05);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 1] -= 24 * c;
      if (positions[i * 3 + 1] < 0.2) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 70;
        positions[i * 3 + 1] = 10 + Math.random() * 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
      }
      dummy.position.set(positions[i * 3 + 0], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.scale.set(0.04, 0.7, 0.04);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  if (!visible) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} castShadow={false} receiveShadow={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#9ab8d0" transparent opacity={0.55} toneMapped={false} />
    </instancedMesh>
  );
}

function Lightning({ visible }: { visible: boolean }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const nextStrike = useRef(2 + Math.random() * 5);
  const strikeT = useRef(0);
  useFrame((_, delta) => {
    if (!visible) return;
    const l = lightRef.current;
    if (!l) return;
    const c = Math.min(delta, 0.05);
    strikeT.current -= c;
    nextStrike.current -= c;
    if (nextStrike.current <= 0) {
      strikeT.current = 0.18;
      nextStrike.current = 4 + Math.random() * 7;
    }
    l.intensity = strikeT.current > 0 ? 4.5 * (strikeT.current / 0.18) : 0;
  });
  if (!visible) return null;
  return <directionalLight ref={lightRef} color="#dde6ff" intensity={0} position={[-8, 28, 12]} />;
}

// Embers (night 3) — floating orange specks rising from the asphalt then
// dissipating overhead. Sells "this street is burning at the edges" without
// any actual fire geometry.
function Embers({ visible }: { visible: boolean }) {
  const COUNT = 90;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => {
    const a = new Float32Array(COUNT * 3);
    const vy = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      a[i * 3 + 0] = (Math.random() - 0.5) * 64;
      a[i * 3 + 1] = Math.random() * 6;
      a[i * 3 + 2] = (Math.random() - 0.5) * 64;
      vy[i] = 0.7 + Math.random() * 1.4;
    }
    return { a, vy };
  }, []);
  useFrame(({ clock }, delta) => {
    const m = meshRef.current;
    if (!m || !visible) return;
    const c = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    for (let i = 0; i < COUNT; i++) {
      positions.a[i * 3 + 1] += positions.vy[i] * c;
      positions.a[i * 3 + 0] += Math.sin(t * 1.2 + i) * 0.01;
      positions.a[i * 3 + 2] += Math.cos(t * 1.4 + i * 0.7) * 0.01;
      if (positions.a[i * 3 + 1] > 9) {
        positions.a[i * 3 + 0] = (Math.random() - 0.5) * 64;
        positions.a[i * 3 + 1] = 0.2;
        positions.a[i * 3 + 2] = (Math.random() - 0.5) * 64;
      }
      const twinkle = 0.5 + Math.sin(t * 2.4 + i) * 0.4;
      dummy.position.set(positions.a[i * 3 + 0], positions.a[i * 3 + 1], positions.a[i * 3 + 2]);
      dummy.scale.setScalar(0.06 * (0.6 + twinkle));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  if (!visible) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} castShadow={false} receiveShadow={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#ff7030" transparent opacity={0.85} toneMapped={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

// Exit beacon — violet 3-ring portal + tall light column + ground halo.
// Only visible once d.exit is set (kill goal met or boss dead). Walking
// within EXIT_PICKUP_RADIUS clears the night.
function ExitBeacon({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const beaconMat = useRef<THREE.MeshBasicMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const innerHaloMat = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const d = state.current;
    const ex = d.exit;
    const g = groupRef.current;
    if (!g) return;
    if (!ex) { g.visible = false; return; }
    g.visible = true;
    g.position.set(ex.position.x, 0, ex.position.z);
    const t = clock.getElapsedTime();
    const pulse = 0.7 + Math.sin(t * 2.2) * 0.30;
    if (ring1Ref.current) ring1Ref.current.rotation.z =  t * 1.4;
    if (ring2Ref.current) ring2Ref.current.rotation.z = -t * 1.1;
    if (ring3Ref.current) ring3Ref.current.rotation.z =  t * 0.8;
    if (coreRef.current) {
      coreRef.current.position.y = 1.10 + Math.sin(t * 1.5) * 0.10;
      coreRef.current.rotation.y = t * 0.9;
    }
    if (coreMat.current) coreMat.current.emissiveIntensity = 3.4 + pulse * 1.6;
    if (beaconMat.current) beaconMat.current.opacity = 0.30 + pulse * 0.35;
    if (haloMat.current) haloMat.current.opacity = 0.45 + pulse * 0.40;
    if (innerHaloMat.current) innerHaloMat.current.opacity = 0.35 + pulse * 0.32;
    if (lightRef.current) lightRef.current.intensity = 26 + pulse * 18;
  });
  return (
    <group ref={groupRef} visible={false}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 3.0, 56]} />
        <meshBasicMaterial ref={haloMat} color="#c878ff" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.2, 36]} />
        <meshBasicMaterial ref={innerHaloMat} color="#a050ff" transparent opacity={0.40} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.90, 0.34, 18]} />
        <meshStandardMaterial color="#3a2848" roughness={1} />
      </mesh>
      <mesh ref={ring1Ref} position={[0, 0.7, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.62, 0.06, 8, 30]} />
        <meshStandardMaterial color="#e0c0ff" emissive="#a050ff" emissiveIntensity={3.0} toneMapped={false} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, 1.15, 0]} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[0.50, 0.05, 8, 28]} />
        <meshStandardMaterial color="#e0c0ff" emissive="#c070ff" emissiveIntensity={3.0} toneMapped={false} />
      </mesh>
      <mesh ref={ring3Ref} position={[0, 1.60, 0]} rotation={[Math.PI / 2.0, 0, 0]}>
        <torusGeometry args={[0.40, 0.04, 8, 24]} />
        <meshStandardMaterial color="#f4d8ff" emissive="#d080ff" emissiveIntensity={3.0} toneMapped={false} />
      </mesh>
      <mesh ref={coreRef} position={[0, 1.10, 0]} castShadow>
        <octahedronGeometry args={[0.58, 0]} />
        <meshStandardMaterial ref={coreMat} color="#f4d8ff" emissive="#b060ff" emissiveIntensity={3.6} roughness={0.2} metalness={0.6} toneMapped={false} />
      </mesh>
      {/* Tall beacon column visible above all pillars */}
      <mesh position={[0, 6.5, 0]}>
        <cylinderGeometry args={[0.16, 0.34, 12.0, 14, 1, true]} />
        <meshBasicMaterial ref={beaconMat} color="#e0b8ff" transparent opacity={0.40} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 1.0, 0]} color="#c878ff" intensity={28} distance={14} decay={2} />
    </group>
  );
}

// Neon perimeter signs — 12 emissive boxes mounted on the inside face of
// each wall. Each one flickers on its own sine + per-sign offset so the
// scene reads "alive but neglected." Doubles as the main ambient color
// fill in the dark periphery.
const NEON_SIGNS: Array<{ pos: [number, number, number]; col: number; size: [number, number, number]; freq: number }> = [
  // South wall (z = -ARENA_HALF)
  { pos: [-19, 2.6, -ARENA_HALF - 0.05], col: 0xff3870, size: [3.4, 1.0, 0.05], freq: 2.3 },
  { pos: [-8,  2.2, -ARENA_HALF - 0.05], col: 0x2bc2ff, size: [2.0, 0.7, 0.05], freq: 1.7 },
  { pos: [ 5,  2.6, -ARENA_HALF - 0.05], col: 0xffa030, size: [2.6, 1.0, 0.05], freq: 2.0 },
  { pos: [ 18, 2.3, -ARENA_HALF - 0.05], col: 0xf0e030, size: [2.2, 0.8, 0.05], freq: 2.7 },
  // North wall (z = +ARENA_HALF)
  { pos: [-22, 2.4,  ARENA_HALF + 0.05], col: 0x2bff80, size: [2.6, 0.9, 0.05], freq: 1.9 },
  { pos: [-9,  2.7,  ARENA_HALF + 0.05], col: 0xff5040, size: [3.0, 1.2, 0.05], freq: 2.2 },
  { pos: [ 6,  2.3,  ARENA_HALF + 0.05], col: 0xa030ff, size: [2.4, 0.8, 0.05], freq: 1.6 },
  { pos: [ 20, 2.5,  ARENA_HALF + 0.05], col: 0x40e0ff, size: [2.6, 1.0, 0.05], freq: 2.5 },
  // West wall (x = -ARENA_HALF)
  { pos: [-ARENA_HALF - 0.05, 2.5,  6],  col: 0xff3870, size: [0.05, 1.0, 2.6], freq: 2.1 },
  { pos: [-ARENA_HALF - 0.05, 2.5, -10], col: 0xffa030, size: [0.05, 1.1, 3.0], freq: 1.8 },
  // East wall (x = +ARENA_HALF)
  { pos: [ ARENA_HALF + 0.05, 2.5, -4],  col: 0xff5040, size: [0.05, 1.2, 3.2], freq: 2.4 },
  { pos: [ ARENA_HALF + 0.05, 2.5,  10], col: 0x40e0ff, size: [0.05, 1.0, 2.4], freq: 2.0 },
];

function NeonSigns() {
  const matsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < NEON_SIGNS.length; i++) {
      const mat = matsRef.current[i];
      if (!mat) continue;
      const sign = NEON_SIGNS[i];
      // Slow sinusoidal pulse + a periodic random "dead bulb" dip every
      // few seconds so the neon feels real, not metronomic.
      const slow = 0.85 + Math.sin(t * sign.freq + i) * 0.30;
      const flicker = Math.sin(t * 17 + i * 1.3) > 0.96 ? 0.3 : 1;   // brief dim
      mat.emissiveIntensity = Math.max(0.2, 2.6 * slow * flicker);
    }
  });
  return (
    <>
      {NEON_SIGNS.map((s, i) => (
        <mesh key={`neon-${i}`} position={s.pos}>
          <boxGeometry args={s.size} />
          <meshStandardMaterial
            ref={el => { matsRef.current[i] = el; }}
            color={s.col}
            emissive={s.col}
            emissiveIntensity={2.4}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

// Enemy projectiles — green spit globs from ranged stalkers. Linear travel,
// pulsing emissive so the player tracks them across the dark asphalt.
function EnemyProjectiles({ state }: { state: React.MutableRefObject<GameRef> }) {
  const POOL = 30;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const d = state.current;
    const m = meshRef.current;
    if (!m) return;
    const projs = d.enemyProjectiles;
    const n = Math.min(POOL, projs.length);
    for (let i = 0; i < n; i++) {
      const p = projs[i];
      dummy.position.set(p.position.x, 1.05 + Math.sin((d.time - p.bornAt) * 12) * 0.06, p.position.z);
      dummy.scale.setScalar(0.32);
      dummy.rotation.set((d.time - p.bornAt) * 4, (d.time - p.bornAt) * 5, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    for (let i = n; i < POOL; i++) {
      dummy.position.set(0, -100, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.count = POOL;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, POOL]}>
      <icosahedronGeometry args={[1, 0]} />
      {/* Was lime green (#9bff60 / #48ff48) — too close to the mint-green XP
          gems on the ground; players couldn't tell incoming acid from a
          loose collectable mid-fight. Switched to a hot chrome yellow.
          Universal "acid/bile/danger" read, maximum hue distance from the
          gems, also colorblind-safer than magenta (green↔magenta confuses
          protan/deutan; green↔yellow is distinguishable). */}
      <meshStandardMaterial color="#ffeb20" emissive="#fff000" emissiveIntensity={3.0} roughness={0.4} toneMapped={false} />
    </instancedMesh>
  );
}

// Perk drops — small spinning crystal in the perk's tint + a ground halo.
// Walk over to auto-apply the perk (no modal interrupt).
function PerkDrops({ state }: { state: React.MutableRefObject<GameRef> }) {
  type Slot = { group: THREE.Group; crystal: THREE.Mesh; haloMat: THREE.MeshBasicMaterial };
  const slots = useRef<Map<number, Slot>>(new Map());
  const rootRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const d = state.current;
    const root = rootRef.current;
    if (!root) return;
    const t = clock.getElapsedTime();
    const live = new Set<number>();
    for (const drop of d.perkDrops) {
      live.add(drop.id);
      const perk = PERKS.find(pp => pp.id === drop.perkId);
      const tint = perk?.tint ?? '#ffd060';
      let slot = slots.current.get(drop.id);
      if (!slot) {
        const group = new THREE.Group();
        group.position.set(drop.position.x, 0, drop.position.z);
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.35, 0),
          new THREE.MeshStandardMaterial({
            color: tint,
            emissive: tint,
            emissiveIntensity: 1.8,
            roughness: 0.3,
            metalness: 0.5,
            toneMapped: false,
          }),
        );
        crystal.position.y = 1.0;
        group.add(crystal);
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.95, 32),
          new THREE.MeshBasicMaterial({
            color: tint,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.06;
        group.add(halo);
        slot = { group, crystal, haloMat: halo.material as THREE.MeshBasicMaterial };
        slots.current.set(drop.id, slot);
        root.add(group);
      }
      slot.crystal.position.y = 1.0 + Math.sin(t * 2.4 + drop.id) * 0.12;
      slot.crystal.rotation.y = t * 1.8;
      slot.crystal.rotation.z = t * 0.6;
      const pulse = 0.7 + Math.sin(t * 4 + drop.id) * 0.3;
      slot.haloMat.opacity = 0.55 + pulse * 0.35;
    }
    for (const [id, slot] of slots.current) {
      if (!live.has(id)) {
        root.remove(slot.group);
        slot.crystal.geometry.dispose();
        slot.haloMat.dispose();
        slots.current.delete(id);
      }
    }
  });
  return <group ref={rootRef} />;
}

// Weapon drops — small floating prop + tinted halo ring on the ground.
// Each drop tracks one entry in d.weaponDrops; we re-render the JSX list
// when the COUNT changes (cheap) and animate positions/rotations in
// useFrame (per-instance refs).
function makeCatToyDrop(weaponId: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const tint = new THREE.Color(WEAPONS[weaponId].tint);
  const mat = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.62,
    metalness: 0.02,
    emissive: tint,
    emissiveIntensity: 0.18,
  });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2024, roughness: 0.7 });

  if (weaponId === 'syringe') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8), cream);
    stem.rotation.z = Math.PI / 2;
    stem.position.x = 0.18;
    g.add(stem);
    return g;
  }

  if (weaponId === 'shotgun') {
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 8, 18), mat));
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 8), cream);
    feather.rotation.z = -0.7;
    feather.position.set(0.34, 0.03, 0.06);
    g.add(feather);
    return g;
  }

  if (weaponId === 'smg') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), mat);
    g.add(ball);
    for (const x of [-0.16, 0.16]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.06), cream);
      stripe.position.x = x;
      g.add(stripe);
    }
    return g;
  }

  if (weaponId === 'magnum') {
    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.20, 0.30), mat);
    g.add(fish);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.30, 3), dark);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.40;
    g.add(tail);
    return g;
  }

  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat));
  return g;
}

function WeaponDrops({ state }: { state: React.MutableRefObject<GameRef> }) {
  type Slot = {
    group: THREE.Group;
    prop: THREE.Group;
    haloMat: THREE.MeshBasicMaterial;
    beam: THREE.Mesh;
    beamMat: THREE.MeshBasicMaterial;
    beamInner: THREE.Mesh;
    beamInnerMat: THREE.MeshBasicMaterial;
    twinkle: THREE.Mesh;
    twinkleMat: THREE.MeshBasicMaterial;
    upgradeRing: THREE.Mesh | null;
    upgradeRingMat: THREE.MeshBasicMaterial | null;
    weaponId: WeaponId;
  };
  const slots = useRef<Map<number, Slot>>(new Map());
  const rootRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const d = state.current;
    const root = rootRef.current;
    if (!root) return;
    const t = clock.getElapsedTime();
    const live = new Set<number>();
    for (const drop of d.weaponDrops) {
      live.add(drop.id);
      let slot = slots.current.get(drop.id);
      if (!slot) {
        const group = new THREE.Group();
        group.position.set(drop.position.x, 0, drop.position.z);
        const tint = WEAPONS[drop.weaponId].tint;
        // ---- Diablo-style loot pillar — the tell that this is a weapon
        // ---- drop, not just another gem on the ground. Two concentric
        // ---- vertical cylinders (additive blending, no depth-write) give
        // ---- the beam a hot core + soft outer falloff visible across the
        // ---- whole arena.
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 7.0, 12, 1, true),
          new THREE.MeshBasicMaterial({
            color: tint,
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        beam.position.y = 3.5;
        group.add(beam);
        const beamInner = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 7.0, 10, 1, true),
          new THREE.MeshBasicMaterial({
            color: tint,
            transparent: true,
            opacity: 0.70,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        beamInner.position.y = 3.5;
        group.add(beamInner);
        // Twinkle — a small octahedron floating at the top of the beam,
        // spinning slowly, as a "this is special, look up" cue.
        const twinkle = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16, 0),
          new THREE.MeshBasicMaterial({
            color: tint,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        twinkle.position.y = 7.0;
        group.add(twinkle);
        const prop = CARTRIDGE.visuals?.actionStyle === 'cat-swipe'
          ? makeCatToyDrop(drop.weaponId)
          : makeWeapon(drop.weaponId);
        prop.scale.setScalar(CARTRIDGE.visuals?.actionStyle === 'cat-swipe' ? 1.9 : 2.2);
        prop.position.set(0, 1.1, 0);
        group.add(prop);
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.70, 1.20, 32),
          new THREE.MeshBasicMaterial({
            color: tint,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.06;
        group.add(halo);
        slot = {
          group, prop,
          haloMat: halo.material as THREE.MeshBasicMaterial,
          beam, beamMat: beam.material as THREE.MeshBasicMaterial,
          beamInner, beamInnerMat: beamInner.material as THREE.MeshBasicMaterial,
          twinkle, twinkleMat: twinkle.material as THREE.MeshBasicMaterial,
          upgradeRing: null,
          upgradeRingMat: null,
          weaponId: drop.weaponId,
        };
        slots.current.set(drop.id, slot);
        root.add(group);
      }
      // Float bobble + spin + halo pulse.
      slot.prop.position.y = 1.1 + Math.sin(t * 2.4 + drop.id) * 0.10;
      slot.prop.rotation.y = t * 1.4;
      const pulse = 0.7 + Math.sin(t * 4 + drop.id) * 0.3;
      slot.haloMat.opacity = 0.55 + pulse * 0.35;
      // Beam breathes a little so it doesn't feel painted on.
      const breath = 0.85 + Math.sin(t * 1.4 + drop.id) * 0.15;
      slot.beamMat.opacity = 0.26 + breath * 0.10;
      slot.beamInnerMat.opacity = 0.56 + breath * 0.20;
      // Twinkle drifts up & down with a slow spin.
      slot.twinkle.position.y = 7.0 + Math.sin(t * 1.6 + drop.id) * 0.20;
      slot.twinkle.rotation.y = t * 0.6;
      slot.twinkle.rotation.z = t * 0.4;
      slot.twinkleMat.opacity = 0.75 + Math.sin(t * 3 + drop.id) * 0.20;

      // UPGRADE INDICATOR — second ring (gold) when this drop matches
      // the player's current weapon AND the weapon isn't already maxed.
      const isUpgrade = drop.weaponId === d.currentWeaponId
        && d.currentWeaponLevel < 5
        && d.currentWeaponId !== 'pistol';
      if (isUpgrade && !slot.upgradeRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.05, 1.35, 36),
          new THREE.MeshBasicMaterial({
            color: 0xffd060,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        slot.group.add(ring);
        slot.upgradeRing = ring;
        slot.upgradeRingMat = ring.material as THREE.MeshBasicMaterial;
      } else if (!isUpgrade && slot.upgradeRing) {
        slot.group.remove(slot.upgradeRing);
        slot.upgradeRingMat?.dispose();
        slot.upgradeRing.geometry.dispose();
        slot.upgradeRing = null;
        slot.upgradeRingMat = null;
      }
      if (slot.upgradeRing && slot.upgradeRingMat) {
        const upPulse = 0.7 + Math.sin(t * 6 + drop.id) * 0.3;
        slot.upgradeRing.scale.setScalar(1 + upPulse * 0.15);
        slot.upgradeRingMat.opacity = 0.55 + upPulse * 0.40;
      }
    }
    for (const [id, slot] of slots.current) {
      if (!live.has(id)) {
        root.remove(slot.group);
        slot.haloMat.dispose();
        slot.beam.geometry.dispose();
        slot.beamMat.dispose();
        slot.beamInner.geometry.dispose();
        slot.beamInnerMat.dispose();
        slot.twinkle.geometry.dispose();
        slot.twinkleMat.dispose();
        if (slot.upgradeRing) {
          slot.upgradeRing.geometry.dispose();
          slot.upgradeRingMat?.dispose();
        }
        slots.current.delete(id);
      }
    }
  });
  return <group ref={rootRef} />;
}

// Impact debris thrown by hits and kills. The game loop owns the same physics
// for every cartridge; the active theme chooses whether the pieces read as
// gore, dust, fur, sparks, or toy-paper confetti.
function BloodSplats({ state }: { state: React.MutableRefObject<GameRef> }) {
  const POOL = 220;
  const bloodRef = useRef<THREE.InstancedMesh>(null);
  const boneRef = useRef<THREE.InstancedMesh>(null);
  const softRef = useRef<THREE.InstancedMesh>(null);
  const sparkRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hidden = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, -100, 0);
    o.scale.setScalar(0);
    o.updateMatrix();
    return o;
  }, []);
  useFrame(() => {
    const d = state.current;
    const blood = bloodRef.current;
    const bone = boneRef.current;
    const soft = softRef.current;
    const spark = sparkRef.current;
    if (!blood || !bone || !soft || !spark) return;
    let bloodI = 0;
    let boneI = 0;
    let softI = 0;
    let sparkI = 0;
    for (const s of d.bloodSplats) {
      if (bloodI >= POOL && boneI >= POOL && softI >= POOL && sparkI >= POOL) break;
      const age = d.time - s.bornAt;
      const fade = Math.max(0, 1 - age / s.life);
      const sc = s.scale * (0.55 + fade * 0.55);
      dummy.position.set(s.position.x, s.position.y, s.position.z);
      dummy.rotation.set(age * 4, age * 3, age * 5);
      const kind = s.kind ?? (s.isBone ? 'bone' : 'blood');
      if (kind === 'fur') dummy.scale.set(sc * 1.2, sc * 0.45, sc * 0.55);
      else if (kind === 'spark') dummy.scale.set(sc * 0.55, sc * 0.55, sc * 1.65);
      else dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      if (kind === 'bone') {
        if (boneI < POOL) { bone.setMatrixAt(boneI, dummy.matrix); boneI++; }
      } else if (kind === 'blood') {
        if (bloodI < POOL) { blood.setMatrixAt(bloodI, dummy.matrix); bloodI++; }
      } else if (kind === 'spark') {
        if (sparkI < POOL) { spark.setMatrixAt(sparkI, dummy.matrix); sparkI++; }
      } else {
        if (softI < POOL) { soft.setMatrixAt(softI, dummy.matrix); softI++; }
      }
    }
    // Collapse unused slots so old positions don't linger.
    for (let i = bloodI; i < POOL; i++) blood.setMatrixAt(i, hidden.matrix);
    for (let i = boneI; i < POOL; i++) bone.setMatrixAt(i, hidden.matrix);
    for (let i = softI; i < POOL; i++) soft.setMatrixAt(i, hidden.matrix);
    for (let i = sparkI; i < POOL; i++) spark.setMatrixAt(i, hidden.matrix);
    blood.instanceMatrix.needsUpdate = true;
    bone.instanceMatrix.needsUpdate = true;
    soft.instanceMatrix.needsUpdate = true;
    spark.instanceMatrix.needsUpdate = true;
    blood.count = POOL;
    bone.count = POOL;
    soft.count = POOL;
    spark.count = POOL;
  });
  return (
    <>
      <instancedMesh ref={bloodRef} args={[undefined, undefined, POOL]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#a01418" emissive="#5a0a0c" emissiveIntensity={0.5} roughness={0.6} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={boneRef} args={[undefined, undefined, POOL]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#e7dfc6" roughness={0.7} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={softRef} args={[undefined, undefined, POOL]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f1ddc5" emissive="#ffd7ef" emissiveIntensity={0.18} roughness={0.9} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparkRef} args={[undefined, undefined, POOL]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#fff3a8" emissive="#7ee8ff" emissiveIntensity={1.5} roughness={0.35} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// Player — survivor archetype (cop for now) with a pistol in the right hand
// and a flashlight in the left. The left arm is locked forward so the
// flashlight cone tracks the player's facing; the right arm tracks the
// current aim target dynamically inside the 110° fire arc.
function Player({ state, survivorId, heroPhotoUrl }: { state: React.MutableRefObject<GameRef>; survivorId: HeroId; heroPhotoUrl?: string | null }) {
  const rootRef = useRef<THREE.Group>(null);
  const survivorRef = useRef<CharacterGroup | null>(null);
  // The "hero light" — same omnidirectional PointLight the original lantern
  // used (intensity 170, distance 30, shadow-casting, warm amber). Stored
  // in a ref so useFrame can pulse it with the breath animation.
  const heroLightRef = useRef<THREE.PointLight | null>(null);
  // Current weapon prop attached to the right shoulder — swapped each time
  // d.currentWeaponId changes so the visible model matches what's firing.
  const currentWeaponPropRef = useRef<THREE.Group | null>(null);
  const currentWeaponIdRef = useRef<WeaponId>('pistol');
  const hideWeaponProps = !!CARTRIDGE.hideWeaponProps;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let mounted: CharacterGroup | null = null;

    // Wire weapon + flashlight + hero light onto a freshly-built survivor and
    // mount it. Factored out so both the synchronous (id) and asynchronous
    // (photo-texture) hero builds run the exact same setup.
    const mount = (survivor: CharacterGroup) => {
      if (disposed) return;

      // Right arm — initial pistol prop. The Player useFrame swaps it out
      // each time d.currentWeaponId changes. YXZ rotation order so rotation.y
      // (target tracking) is applied AFTER rotation.x (forward lift),
      // letting the gun swing left/right inside the firing arc.
      survivor.userData.rig.armR.rotation.order = 'YXZ';
      if (!hideWeaponProps) {
        const weapon = makeWeapon('pistol');
        weapon.position.set(0.03, -0.95, 0.15);
        survivor.userData.rig.armR.add(weapon);
        currentWeaponPropRef.current = weapon;
      } else {
        currentWeaponPropRef.current = null;
      }
      currentWeaponIdRef.current = 'pistol';

      // Left arm — flashlight prop. The model is just visual; the actual
      // "hero light" is an omnidirectional PointLight attached at the lens.
      const flashlight = hideWeaponProps ? new THREE.Group() : makeFlashlight();
      flashlight.position.set(0, -1.0, 0);
      survivor.userData.rig.armL.add(flashlight);

      // Hero PointLight — omnidirectional, tuned softer (intensity 100,
      // distance 22) so it doesn't blow out the streetlamp pools + neon signs.
      const heroLight = new THREE.PointLight(0xff9a3a, 100, 22, 2);
      heroLight.position.set(0, 0, 0.25);          // at the lens, flashlight-local
      // castShadow disabled — a 1024×1024 omnidirectional shadow map every
      // frame is the single most expensive thing in the scene.
      heroLight.castShadow = false;
      flashlight.add(heroLight);
      heroLightRef.current = heroLight;

      root.add(survivor);
      survivorRef.current = survivor;
      mounted = survivor;
    };

    // Identity hero — when a photo URL is set and the cartridge supports it,
    // load the face texture then build the photo hero. Falls back to the
    // chosen archetype on any load error so the run is never heroless.
    if (heroPhotoUrl && CARTRIDGE.buildHeroFromPhoto) {
      new THREE.TextureLoader().load(
        heroPhotoUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          mount(CARTRIDGE.buildHeroFromPhoto!(tex));
        },
        undefined,
        () => mount(CARTRIDGE.buildHero(survivorId)),
      );
    } else {
      mount(CARTRIDGE.buildHero(survivorId));
    }

    return () => {
      disposed = true;
      if (mounted) root.remove(mounted);
      survivorRef.current = null;
      heroLightRef.current = null;
    };
  }, [survivorId, heroPhotoUrl, hideWeaponProps]);

  useFrame(({ clock }) => {
    const d = state.current;
    const root = rootRef.current;
    const survivor = survivorRef.current;
    if (!root || !survivor) return;
    root.position.copy(d.pos);
    root.rotation.y = d.rot;

    // Weapon prop hot-swap. When the loop's currentWeaponId changes
    // (player walked over a drop), remove the old model and build the
    // matching new one in the right hand.
    if (d.currentWeaponId !== currentWeaponIdRef.current) {
      const armR = survivor.userData.rig.armR;
      if (currentWeaponPropRef.current) {
        armR.remove(currentWeaponPropRef.current);
        currentWeaponPropRef.current.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
      }
      if (!hideWeaponProps) {
        const next = makeWeapon(d.currentWeaponId);
        next.position.set(0.03, -0.95, 0.15);
        armR.add(next);
        currentWeaponPropRef.current = next;
      } else {
        currentWeaponPropRef.current = null;
      }
      currentWeaponIdRef.current = d.currentWeaponId;
    }

    const t = clock.getElapsedTime();
    const moveFactor = Math.min(1, d.speed / PLAYER_SPEED);
    const rig = survivor.userData.rig;

    // Crossy Road idle hop — constant abs(sin) bounce so the body looks
    // alive even standing still. Higher + faster when moving so it reads as
    // an actual walk cycle. Contact shadow sits outside the survivor on
    // root.position so it stays glued to the asphalt while the body lifts.
    const hopFreq = 4.0 + moveFactor * 2.2;
    const hopHeight = 0.13 + moveFactor * 0.14;
    const hopT = t * hopFreq;
    survivor.position.y = Math.abs(Math.sin(hopT)) * hopHeight;
    // Subtle forward pitch only during the airborne half of each hop —
    // sells the leap intention without breaking the silhouette.
    survivor.rotation.x = Math.abs(Math.sin(hopT)) * 0.06 * moveFactor;

    // Leg swing — runs faster when moving, idle micro-shift when standing.
    const walkFreq = 5.5 + moveFactor * 2.0;
    const swing = Math.sin(t * walkFreq) * (0.10 + moveFactor * 0.55);
    rig.legL.rotation.x =  swing;
    rig.legR.rotation.x = -swing;

    // Hero light "breath" — verbatim from the old lantern. A slow sinusoid
    // (~5.5s period) gives the warm halo around the cop its living
    // amber-breathing-on-stone feel; a fast jitter overlays restless flicker.
    // Range on the slow band is ~[0.65, 1.35].
    if (heroLightRef.current) {
      const slow = Math.sin(t * 1.14) * 0.32;
      const fast = (Math.sin(t * 7.0) + Math.sin(t * 11.3) * 0.4) * 0.08;
      const breath = 1.0 + slow + fast;
      heroLightRef.current.intensity = 100 * breath;
      heroLightRef.current.distance  = 22  * (0.92 + slow * 0.95);
    }

    // Left arm — LOCKED forward so the flashlight always aims where the
    // survivor faces. Tiny downward dip so the cone hits the ground in
    // front rather than going off into the fog.
    const flashAim = -Math.PI / 2 + 0.22;
    rig.armL.rotation.x = flashAim;

    // Right arm — tracks the current fire target inside the 110° arc.
    // d.aimYaw is the bearing of the locked target relative to body facing
    // (radians, [-0.96, +0.96] ≈ ±55°); when there's no target it's null,
    // and the arm relaxes to low-ready.
    const aimedFwd = -Math.PI / 2 + 0.08;
    const lowReady = -0.35;
    const hasAim = d.aimYaw != null;
    const targetX = hasAim ? aimedFwd : lowReady;
    rig.armR.rotation.x += (targetX - rig.armR.rotation.x) * 0.45;     // smooth
    // Swing the gun arm left/right inside the firing arc. Smoothed so the
    // arm tracks rather than snaps.
    const targetY = hasAim ? (d.aimYaw as number) : 0;
    rig.armR.rotation.y += (targetY - rig.armR.rotation.y) * 0.35;

    // Hit response — if the player just took damage, briefly flash the body.
    // (iframesT > 0 while invulnerable.) Lerp body emissive toward red.
    const hurt = Math.max(0, Math.min(1, d.iframesT / 1.2));
    if (hurt > 0) {
      const pulse = Math.abs(Math.sin(t * 22)) * hurt;
      survivor.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat.emissive) return;
        const orig = (mat as any).__bp_origEmissive as THREE.Color | undefined;
        const naturalE = orig ?? mat.emissive.clone();
        if (!orig) (mat as any).__bp_origEmissive = naturalE;
        const origI = (mat as any).__bp_origEi ?? mat.emissiveIntensity;
        if ((mat as any).__bp_origEi == null) (mat as any).__bp_origEi = origI;
        mat.emissive.copy(naturalE).lerp(new THREE.Color('#ff3838'), pulse * 0.75);
        mat.emissiveIntensity = origI + pulse * 1.4;
      });
    }
  });

  return (
    <group ref={rootRef}>
      {/* Contact shadow stays at the world floor, so when the body tilts
          on movement the shadow doesn't lift with it. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.36} />
      </mesh>
    </group>
  );
}

// Drifting glow specks — atmospheric extra borrowed from Piper's night
// preset. Re-tinted from cave-spirit blue to a warm urban dust ember so
// they read as backlit haze in the flashlight cone — fits a city-night
// street rather than a cave. Each speck is a tiny additive sphere; world
// positions so they linger in the cone as the player passes through.
function Fireflies() {
  const COUNT = 28;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { positions, vel, dummy } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    const W = ARENA_HALF * 1.6;
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * W;
      positions[i * 3 + 1] = 0.4 + Math.random() * 2.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * W;
      vel[i * 3 + 0] = (Math.random() - 0.5) * 0.35;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.20;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
    }
    return { positions, vel, dummy: new THREE.Object3D() };
  }, []);
  useFrame(({ clock }, delta) => {
    const m = meshRef.current;
    if (!m) return;
    const c = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const W = ARENA_HALF * 1.6;
    for (let i = 0; i < COUNT; i++) {
      const xi = i * 3, yi = i * 3 + 1, zi = i * 3 + 2;
      positions[xi] += vel[xi] * c + Math.sin(t * 0.6 + i) * 0.004;
      positions[yi] += vel[yi] * c;
      positions[zi] += vel[zi] * c + Math.cos(t * 0.5 + i * 1.3) * 0.004;
      if (positions[yi] < 0.3 || positions[yi] > 3.0) vel[yi] *= -1;
      if (Math.abs(positions[xi]) > W / 2) vel[xi] *= -1;
      if (Math.abs(positions[zi]) > W / 2) vel[zi] *= -1;
      // Per-instance twinkle via scale
      const twinkle = 0.7 + Math.sin(t * 1.6 + i * 0.7) * 0.3;
      dummy.position.set(positions[xi], positions[yi], positions[zi]);
      dummy.scale.setScalar(twinkle);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[0.05, 8, 6]} />
      <meshBasicMaterial color="#ffd2a0" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

// XP gems — InstancedMesh per layer instead of a per-gem <group> of 3
// meshes. The old renderer was the single biggest fill-rate hit at
// endless L7+: each gem had an octahedron + two additive-blending halo
// circles (inner 0.65u, outer 1.6u). With 25-30 gems on screen the
// outer-halo overdraw alone was painting most of the screen many times
// over, killing fragment-shader budget on mobile.
//
// New layout: ONE InstancedMesh for the octahedron + ONE for the inner
// halo, regardless of gem count. The outer halo is dropped — the inner
// halo already gives the "I'm a pickup" tell at the distance players
// actually navigate at. CrystalLights pool still adds a green PointLight
// per nearest gem so they still cast a soft glow on the asphalt.
const GEM_COLOR = '#7fffa8';
const GEM_OCT_GEOM = new THREE.OctahedronGeometry(0.35, 0);
const GEM_HALO_GEOM = new THREE.CircleGeometry(0.65, 14);

const GEM_OCT_MAT = new THREE.MeshStandardMaterial({
  color: GEM_COLOR, emissive: GEM_COLOR, emissiveIntensity: 1.8,
  roughness: 0.3, metalness: 0.6,
});
const GEM_HALO_MAT = new THREE.MeshBasicMaterial({
  color: GEM_COLOR, transparent: true, opacity: 0.55,
  depthWrite: false, blending: THREE.AdditiveBlending,
});

function Crystals({ state }: { state: React.MutableRefObject<GameRef> }) {
  // Pool large enough for any feasible endless surge — crystalInitial
  // caps at 4 + ambient respawn every 2.5s; ~24-30 on field at peak.
  const POOL = 48;
  const octRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hidden = useMemo(() => {
    const m = new THREE.Object3D();
    m.position.set(0, -1000, 0);
    m.scale.setScalar(0);
    m.updateMatrix();
    return m.matrix;
  }, []);

  useFrame(({ clock }) => {
    const d = state.current;
    const oct = octRef.current;
    const halo = haloRef.current;
    if (!oct || !halo) return;
    const t = clock.getElapsedTime();
    const n = Math.min(POOL, d.crystals.length);
    for (let i = 0; i < n; i++) {
      const cr = d.crystals[i];
      const y = 0.35 + Math.sin(t * 1.6 + cr.id) * 0.10;
      // Octahedron — bobs + slow spin around Y.
      dummy.position.set(cr.position.x, y, cr.position.z);
      dummy.rotation.set(0, t * 0.8 + cr.id, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      oct.setMatrixAt(i, dummy.matrix);
      // Inner halo — lies flat just above the asphalt, no spin.
      dummy.position.set(cr.position.x, 0.05, cr.position.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      halo.setMatrixAt(i, dummy.matrix);
    }
    // Collapse unused slots so stale positions don't draw.
    for (let i = n; i < POOL; i++) {
      oct.setMatrixAt(i, hidden);
      halo.setMatrixAt(i, hidden);
    }
    oct.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    oct.count = POOL;
    halo.count = POOL;
  });

  return (
    <>
      <instancedMesh ref={octRef} args={[GEM_OCT_GEOM, GEM_OCT_MAT, POOL]} />
      <instancedMesh ref={haloRef} args={[GEM_HALO_GEOM, GEM_HALO_MAT, POOL]} />
    </>
  );
}

// A fixed pool of N PointLights that get assigned each frame to the N
// nearest visible crystals. Gives the cave a multi-source "stage-light"
// quality (like DJ Disco) without per-crystal lights — keeps GPU cost
// predictable. No shadows because mobile would choke.
function CrystalLights({ state }: { state: React.MutableRefObject<GameRef> }) {
  // Pool 4 → 3. XP gems are decorative; their green PointLight contribution
  // is subtle on a 11-48u fog scene. One less point light pays back
  // across the framebuffer.
  const POOL = 3;
  // Hard cull past this squared distance — was a 20% floor, now zero.
  const CULL_D2 = 200;
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const d = state.current;
    if (d.crystals.length === 0) {
      for (const l of refs.current) if (l) l.intensity = 0;
      return;
    }
    // Sort crystals by distance² to player (cheap — typical N is ~18-26)
    const sorted = d.crystals
      .map(c => ({
        c,
        d2: (c.position.x - d.pos.x) ** 2 + (c.position.z - d.pos.z) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, POOL);

    for (let i = 0; i < POOL; i++) {
      const light = refs.current[i];
      if (!light) continue;
      const entry = sorted[i];
      if (!entry) { light.intensity = 0; continue; }
      // Hard cull — distant gems contribute nothing.
      if (entry.d2 > CULL_D2) { light.intensity = 0; continue; }
      const c = entry.c;
      tmpVec.set(c.position.x, 0.5, c.position.z);
      light.position.copy(tmpVec);
      light.color.set('#7fffa8');     // XP gem green
      const distFalloff = 1 - entry.d2 / CULL_D2;
      light.intensity = 14 * distFalloff;
      light.distance = 8;
    }
  });
  return (
    <>
      {Array.from({ length: POOL }).map((_, i) => (
        <pointLight
          key={i}
          ref={el => { refs.current[i] = el; }}
          color="#ffffff"
          intensity={0}
          distance={8}
          decay={2}
        />
      ))}
    </>
  );
}

// Pool of PointLights that track the nearest *lit* pillars to the player —
// streetlamps (variant 'spike'), burning oil drums ('burnBarrel'), and
// wrecked police cruisers ('wreckCruiser', red+blue strobing). Each frame
// we sort the candidates by distance² to the player and assign the top N
// to the pool, fading intensity with distance and color-coding per source
// (warm amber for lamps, hot orange for fire, strobing red/blue for the
// cruiser lightbar).
function StreetlampLights({ state }: { state: React.MutableRefObject<GameRef> }) {
  // Pool 6 → 4. Each PointLight is per-fragment forward shading; one
  // fewer light pays back across the whole framebuffer. 4 nearest is
  // enough — players rarely have 6 lit props on screen at once.
  const POOL = 4;
  // Hard cull threshold: past this squared distance the light contributes
  // nothing and we set intensity = 0 so the GPU skips it entirely.
  // (Was `Math.max(0.25, 1 - d²/420)` which kept distant lights at 25%.)
  const CULL_D2 = 540;
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const d = state.current;
    const lit = d.pillars.filter(p =>
      p.variant === 'spike' || p.variant === 'burnBarrel' || p.variant === 'wreckCruiser'
    );
    if (lit.length === 0) {
      for (const l of refs.current) if (l) l.intensity = 0;
      return;
    }
    // Sort by squared distance to the player.
    const sorted = lit
      .map(p => ({
        p,
        d2: (p.position.x - d.pos.x) ** 2 + (p.position.z - d.pos.z) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, POOL);
    const t = clock.getElapsedTime();
    for (let i = 0; i < POOL; i++) {
      const light = refs.current[i];
      if (!light) continue;
      const entry = sorted[i];
      if (!entry) { light.intensity = 0; continue; }
      // Hard distance cull — anything past CULL_D2 contributes nothing.
      if (entry.d2 > CULL_D2) { light.intensity = 0; continue; }
      const v = entry.p.variant;
      // Per-variant local Y offset for the actual emissive bit:
      //   streetlamp head ~3.1u, barrel flame ~1.4u, cruiser lightbar ~1.9u
      const yOffset = v === 'wreckCruiser' ? 1.9 : v === 'burnBarrel' ? 1.4 : 3.1;
      tmpVec.set(entry.p.position.x, yOffset * entry.p.scale, entry.p.position.z);
      light.position.copy(tmpVec);
      const falloff = 1 - entry.d2 / CULL_D2;  // 1 → 0, no floor
      if (v === 'burnBarrel') {
        const phase = (entry.p.id * 0.37) % 6.28;
        const flicker = 0.85 + Math.sin(t * 11 + phase) * 0.08 + Math.sin(t * 23 + phase * 1.7) * 0.05;
        light.intensity = 60 * falloff * flicker;
        light.distance = 17 * entry.p.scale;
        tmpColor.set('#ff8434');
        light.color.copy(tmpColor);
      } else if (v === 'wreckCruiser') {
        // Emergency strobe — alternate red/blue every ~0.35s with a sharp
        // attack (sin clamped + raised to a power so each flash is brief).
        // Per-instance phase so adjacent cruisers don't beat in sync.
        const phase = (entry.p.id * 0.91) % 6.28;
        const beat = t * 5.4 + phase;
        const onRed  = Math.pow(Math.max(0, Math.sin(beat)), 6);          // peaks once per cycle
        const onBlue = Math.pow(Math.max(0, Math.sin(beat + Math.PI)), 6); // 180° offset peak
        light.intensity = (28 + 60 * (onRed + onBlue)) * falloff;
        light.distance = 14 * entry.p.scale;
        // Blend the channels — winner takes color, even split goes magenta.
        const r = 0.18 + onRed  * 0.95;
        const b = 0.18 + onBlue * 0.95;
        tmpColor.setRGB(r, 0.06, b);
        light.color.copy(tmpColor);
      } else {
        light.intensity = 32 * falloff;
        light.distance = 13 * entry.p.scale;
        tmpColor.set('#ffc070');
        light.color.copy(tmpColor);
      }
    }
  });
  return (
    <>
      {Array.from({ length: POOL }).map((_, i) => (
        <pointLight
          key={i}
          ref={el => { refs.current[i] = el; }}
          color="#ffc070"
          intensity={0}
          distance={9}
          decay={2}
        />
      ))}
    </>
  );
}

// ── Pillars (street props) — merged static geometry ───────────────────────
// Pillars are spawn-once-static (set at startLevel, never moved/scaled),
// so a per-pillar <group> with multi-mesh children was 300-900 draw calls
// of pure waste at endless L7+. We now merge every sub-mesh of every
// pillar into ONE BufferGeometry per material reference, baking the
// pillar root transform + sub-mesh local transform into vertex positions
// at level-spawn time. Result: ~20 draw calls instead of ~500.
//
// Animations that touched a pillar mesh (cruiser lightbar strobe, barrel
// flicker) were never on the mesh itself — they live in StreetlampLights'
// PointLight pool which is separate. Static merge is safe.
//
// Shared materials — every sub-mesh references one of these; matching
// references group into one merged geometry per material at build time.
// One reference per visual purpose; we don't aggressively dedupe by exact
// color because the artistic intent was to give each prop family its
// own palette accent.

// MeshStandardMaterial factory with named slot.
const stdMat = (color: string, opts: Partial<{ roughness: number; metalness: number; emissive: string; emissiveIntensity: number; side: THREE.Side }> = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: opts.side ?? THREE.FrontSide,
  });

// MeshBasicMaterial factory for the unlit emissive bits (flames/steam).
const basicMat = (color: string, opts: Partial<{ opacity: number; side: THREE.Side; depthWrite: boolean }> = {}) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    toneMapped: false,
    depthWrite: opts.depthWrite ?? true,
  });

// Shared materials — referenced by name in the blueprints. Same-reference
// sub-meshes end up in the same merged mesh = one draw call.
const PILLAR_MATS = {
  poleDark:        stdMat('#2a2a32', { roughness: 0.85 }),
  boxBlack:        stdMat('#1c1c24', { roughness: 0.85 }),
  lampEmit:        stdMat('#ffd28a', { emissive: '#ffb050', emissiveIntensity: 2.2 }),
  concrete:        stdMat('#22232a', { roughness: 1 }),
  sedanBody:       stdMat('#2a2a36', { roughness: 0.7 }),
  sedanCabin:      stdMat('#1c1c26', { roughness: 0.6 }),
  windowTint:      stdMat('#3a4a64', { roughness: 0.3, metalness: 0.4 }),
  headlightEmit:   stdMat('#fff0c0', { emissive: '#ffd060', emissiveIntensity: 1.6 }),
  wheelBlack:      stdMat('#0c0c12', { roughness: 0.95 }),
  dumpsterGreen:   stdMat('#284038', { roughness: 0.85 }),
  dumpsterDark:    stdMat('#1a2a24', { roughness: 0.85 }),
  barrelBody:      stdMat('#3a2818', { roughness: 0.85, metalness: 0.35 }),
  barrelRim:       stdMat('#6a3a18', { roughness: 0.85 }),
  flameOuter:      basicMat('#ff7028', { opacity: 0.92 }),
  flameInner:      basicMat('#ffd860', { opacity: 0.95 }),
  ember:           basicMat('#ffe070'),
  truckBody:       stdMat('#3c2418', { roughness: 0.85 }),
  truckStripe:     stdMat('#a05028', { roughness: 0.7 }),
  truckCab:        stdMat('#2a1610', { roughness: 0.85 }),
  truckWindshield: stdMat('#2a3a54', { roughness: 0.4, metalness: 0.4 }),
  truckHLEmit:     stdMat('#ffe8b0', { emissive: '#ffa040', emissiveIntensity: 1.8 }),
  truckHLBusted:   stdMat('#241814', { roughness: 0.95 }),
  grateBase:       stdMat('#1a1a22', { roughness: 0.9, metalness: 0.3 }),
  grateSlat:       stdMat('#08080c'),
  steamLower:      basicMat('#a0a0b0', { opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  steamUpper:      basicMat('#b0b0c0', { opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
  bagBlack:        stdMat('#16161e', { roughness: 0.95 }),
  bagStrap:        stdMat('#9c8a10', { roughness: 0.9 }),
  barricadeLeg:    stdMat('#1a1a22', { roughness: 0.85 }),  // separate from grateBase: different rough
  barricadeRail:   stdMat('#e8e4dc', { roughness: 0.7 }),
  barricadeTape:   stdMat('#ffcc40', { emissive: '#ffaa18', emissiveIntensity: 0.9, roughness: 0.6 }),
  shopWall:        stdMat('#221d18', { roughness: 0.9 }),
  shopGlow:        stdMat('#3a2820', { emissive: '#604030', emissiveIntensity: 0.6, roughness: 0.7 }),
  plank1:          stdMat('#6a4a30', { roughness: 0.85 }),
  plank2:          stdMat('#7a5430', { roughness: 0.85 }),
  plank3:          stdMat('#5a4028', { roughness: 0.85 }),
  closedPaint:     stdMat('#ff6020', { emissive: '#ff5020', emissiveIntensity: 0.7, roughness: 0.8 }),
  tippedBin:       stdMat('#2a3e35', { roughness: 0.9 }),
  trashBag1:       stdMat('#1a1a20', { roughness: 0.95 }),
  trashBag2:       stdMat('#181822', { roughness: 0.95 }),
  trashBag3:       stdMat('#1c1c24', { roughness: 0.95 }),
  trashPaper:      stdMat('#d4c8a8', { roughness: 0.9, side: THREE.DoubleSide }),
  cruiserBody:     stdMat('#0d0d10', { roughness: 0.7 }),
  cruiserDoor:     stdMat('#dadada', { roughness: 0.7 }),
  cruiserCabin:    stdMat('#181820', { roughness: 0.7 }),
  cruiserBarBlue:  stdMat('#fff0c0', { emissive: '#3060ff', emissiveIntensity: 2.0, roughness: 0.3 }),
  cruiserBarRed:   stdMat('#fff0c0', { emissive: '#ff3040', emissiveIntensity: 2.0, roughness: 0.3 }),
  skidMark:        stdMat('#0a0a0e', { roughness: 1 }),
  sofaBase:        stdMat('#a86f58', { roughness: 0.9 }),
  sofaCushion:     stdMat('#c99072', { roughness: 0.92 }),
  sofaDark:        stdMat('#6e493e', { roughness: 0.95 }),
  rugRed:          stdMat('#b7505a', { roughness: 0.95, side: THREE.DoubleSide }),
  rugCream:        stdMat('#f0dfc4', { roughness: 0.95, side: THREE.DoubleSide }),
  tableWood:       stdMat('#7b5637', { roughness: 0.85 }),
  tableDark:       stdMat('#4d3524', { roughness: 0.9 }),
  scratchPost:     stdMat('#caa46a', { roughness: 0.9 }),
  scratchBase:     stdMat('#81613e', { roughness: 0.9 }),
  yarnPink:        stdMat('#ff80b8', { roughness: 0.85, emissive: '#ff4f9d', emissiveIntensity: 0.25 }),
  dockPlastic:     stdMat('#262832', { roughness: 0.75 }),
  dockLight:       stdMat('#bff0ff', { roughness: 0.35, emissive: '#65c8ff', emissiveIntensity: 1.2 }),
} as const;

type SubMeshDef = {
  geom: THREE.BufferGeometry;
  mat: THREE.Material;
  pos: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
};

// Build the geometry tables once and never dispose them — the source
// BufferGeometries live for the page's lifetime and get cloned/transformed
// at merge time. (Materials are shared by reference; geometries are cloned.)
const BLUEPRINTS: Record<PillarVariant, SubMeshDef[]> = {
  spike: [
    { geom: new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8),  mat: PILLAR_MATS.poleDark,   pos: [0, 1.6, 0] },
    { geom: new THREE.BoxGeometry(0.30, 0.12, 0.42),         mat: PILLAR_MATS.boxBlack,   pos: [0, 3.25, 0.18] },
    { geom: new THREE.BoxGeometry(0.22, 0.10, 0.34),         mat: PILLAR_MATS.lampEmit,   pos: [0, 3.18, 0.20] },
    { geom: new THREE.CylinderGeometry(0.55, 0.70, 0.10, 12), mat: PILLAR_MATS.concrete,  pos: [0, 0.05, 0] },
  ],
  dome: [
    { geom: new THREE.BoxGeometry(1.40, 0.55, 2.20), mat: PILLAR_MATS.sedanBody,     pos: [0, 0.35, 0] },
    { geom: new THREE.BoxGeometry(1.20, 0.50, 1.40), mat: PILLAR_MATS.sedanCabin,    pos: [0, 0.85, -0.10] },
    { geom: new THREE.BoxGeometry(1.05, 0.34, 0.05), mat: PILLAR_MATS.windowTint,    pos: [0, 0.95,  0.50] },
    { geom: new THREE.BoxGeometry(1.05, 0.34, 0.05), mat: PILLAR_MATS.windowTint,    pos: [0, 0.95, -0.80] },
    { geom: new THREE.BoxGeometry(0.20, 0.14, 0.08), mat: PILLAR_MATS.headlightEmit, pos: [-0.50, 0.42, 1.12] },
    { geom: new THREE.BoxGeometry(0.20, 0.14, 0.08), mat: PILLAR_MATS.headlightEmit, pos: [ 0.50, 0.42, 1.12] },
    { geom: new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), mat: PILLAR_MATS.wheelBlack, pos: [-0.66, 0.20,  0.72], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), mat: PILLAR_MATS.wheelBlack, pos: [ 0.66, 0.20,  0.72], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), mat: PILLAR_MATS.wheelBlack, pos: [-0.66, 0.20, -0.72], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), mat: PILLAR_MATS.wheelBlack, pos: [ 0.66, 0.20, -0.72], rot: [0, 0, Math.PI / 2] },
  ],
  cluster: [
    { geom: new THREE.BoxGeometry(1.40, 1.10, 0.90), mat: PILLAR_MATS.dumpsterGreen, pos: [0, 0.55, 0] },
    { geom: new THREE.BoxGeometry(1.46, 0.10, 1.04), mat: PILLAR_MATS.dumpsterDark,  pos: [0, 1.20, -0.06], rot: [-0.18, 0, 0] },
    { geom: new THREE.BoxGeometry(0.06, 1.00, 0.06), mat: PILLAR_MATS.dumpsterDark,  pos: [-0.50, 0.55, 0.46] },
    { geom: new THREE.BoxGeometry(0.06, 1.00, 0.06), mat: PILLAR_MATS.dumpsterDark,  pos: [-0.16, 0.55, 0.46] },
    { geom: new THREE.BoxGeometry(0.06, 1.00, 0.06), mat: PILLAR_MATS.dumpsterDark,  pos: [ 0.18, 0.55, 0.46] },
    { geom: new THREE.BoxGeometry(0.06, 1.00, 0.06), mat: PILLAR_MATS.dumpsterDark,  pos: [ 0.52, 0.55, 0.46] },
    { geom: new THREE.CylinderGeometry(0.10, 0.10, 0.12, 10), mat: PILLAR_MATS.wheelBlack, pos: [-0.55, 0.10, 0.46], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.CylinderGeometry(0.10, 0.10, 0.12, 10), mat: PILLAR_MATS.wheelBlack, pos: [ 0.55, 0.10, 0.46], rot: [0, 0, Math.PI / 2] },
  ],
  burnBarrel: [
    { geom: new THREE.CylinderGeometry(0.40, 0.42, 1.00, 12), mat: PILLAR_MATS.barrelBody, pos: [0, 0.50, 0] },
    { geom: new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), mat: PILLAR_MATS.barrelRim,  pos: [0, 1.00, 0] },
    { geom: new THREE.ConeGeometry(0.34, 0.70, 8),            mat: PILLAR_MATS.flameOuter, pos: [0, 1.40, 0] },
    { geom: new THREE.ConeGeometry(0.20, 0.45, 6),            mat: PILLAR_MATS.flameInner, pos: [0, 1.28, 0] },
    { geom: new THREE.SphereGeometry(0.05, 6, 6),             mat: PILLAR_MATS.ember,      pos: [0, 1.80, 0] },
  ],
  wreckTruck: [
    { geom: new THREE.BoxGeometry(2.60, 1.24, 1.50), mat: PILLAR_MATS.truckBody,       pos: [0, 0.62, 0] },
    { geom: new THREE.BoxGeometry(2.62, 0.12, 0.02), mat: PILLAR_MATS.truckStripe,     pos: [0, 0.72, 0.76] },
    { geom: new THREE.BoxGeometry(1.00, 1.30, 1.46), mat: PILLAR_MATS.truckCab,        pos: [-1.55, 0.66, 0] },
    { geom: new THREE.BoxGeometry(0.04, 0.55, 0.95), mat: PILLAR_MATS.truckWindshield, pos: [-2.06, 0.92, 0] },
    { geom: new THREE.BoxGeometry(0.04, 0.18, 0.22), mat: PILLAR_MATS.truckHLEmit,     pos: [-2.06, 0.40,  0.55] },
    { geom: new THREE.BoxGeometry(0.04, 0.18, 0.22), mat: PILLAR_MATS.truckHLBusted,   pos: [-2.06, 0.40, -0.55] },
    { geom: new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12), mat: PILLAR_MATS.wheelBlack, pos: [-1.10, 0.30,  0.78], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12), mat: PILLAR_MATS.wheelBlack, pos: [ 0.85, 0.30,  0.78], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12), mat: PILLAR_MATS.wheelBlack, pos: [-1.10, 0.30, -0.78], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12), mat: PILLAR_MATS.wheelBlack, pos: [ 0.85, 0.30, -0.78], rot: [Math.PI / 2, 0, 0] },
  ],
  steamGrate: [
    { geom: new THREE.BoxGeometry(1.20, 0.06, 0.90), mat: PILLAR_MATS.grateBase, pos: [0, 0.04, 0] },
    { geom: new THREE.BoxGeometry(1.10, 0.02, 0.06), mat: PILLAR_MATS.grateSlat, pos: [0, 0.085, -0.32] },
    { geom: new THREE.BoxGeometry(1.10, 0.02, 0.06), mat: PILLAR_MATS.grateSlat, pos: [0, 0.085, -0.16] },
    { geom: new THREE.BoxGeometry(1.10, 0.02, 0.06), mat: PILLAR_MATS.grateSlat, pos: [0, 0.085,  0.00] },
    { geom: new THREE.BoxGeometry(1.10, 0.02, 0.06), mat: PILLAR_MATS.grateSlat, pos: [0, 0.085,  0.16] },
    { geom: new THREE.BoxGeometry(1.10, 0.02, 0.06), mat: PILLAR_MATS.grateSlat, pos: [0, 0.085,  0.32] },
    { geom: new THREE.CylinderGeometry(0.30, 0.16, 1.40, 8, 1, true), mat: PILLAR_MATS.steamLower, pos: [0.00, 0.80, 0] },
    { geom: new THREE.CylinderGeometry(0.48, 0.26, 1.60, 8, 1, true), mat: PILLAR_MATS.steamUpper, pos: [0.10, 1.80, 0] },
  ],
  bodyBag: [
    { geom: new THREE.CylinderGeometry(0.22, 0.22, 1.40, 10), mat: PILLAR_MATS.bagBlack,  pos: [0, 0.22, 0], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.SphereGeometry(0.22, 8, 8),             mat: PILLAR_MATS.bagBlack,  pos: [-0.70, 0.22, 0] },
    { geom: new THREE.SphereGeometry(0.22, 8, 8),             mat: PILLAR_MATS.bagBlack,  pos: [ 0.70, 0.22, 0] },
    { geom: new THREE.BoxGeometry(1.45, 0.04, 0.46),          mat: PILLAR_MATS.bagStrap,  pos: [0, 0.36, 0] },
  ],
  barricade: [
    { geom: new THREE.BoxGeometry(0.08, 1.00, 0.08), mat: PILLAR_MATS.barricadeLeg,  pos: [-0.50, 0.50, 0], rot: [0, 0,  0.32] },
    { geom: new THREE.BoxGeometry(0.08, 1.00, 0.08), mat: PILLAR_MATS.barricadeLeg,  pos: [ 0.50, 0.50, 0], rot: [0, 0, -0.32] },
    { geom: new THREE.BoxGeometry(1.25, 0.18, 0.10), mat: PILLAR_MATS.barricadeRail, pos: [0, 0.90, 0] },
    ...[-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].map<SubMeshDef>(xx => ({
      geom: new THREE.BoxGeometry(0.10, 0.14, 0.005), mat: PILLAR_MATS.barricadeTape, pos: [xx, 0.90, 0.06],
    })),
    { geom: new THREE.BoxGeometry(1.10, 0.05, 0.04), mat: PILLAR_MATS.barricadeLeg, pos: [0, 0.32, 0], rot: [0, 0,  0.95] },
    { geom: new THREE.BoxGeometry(1.10, 0.05, 0.04), mat: PILLAR_MATS.barricadeLeg, pos: [0, 0.32, 0], rot: [0, 0, -0.95] },
  ],
  boardedShop: [
    { geom: new THREE.BoxGeometry(1.80, 2.40, 0.20), mat: PILLAR_MATS.shopWall,    pos: [0, 1.20, -0.18] },
    { geom: new THREE.BoxGeometry(1.40, 1.60, 0.02), mat: PILLAR_MATS.shopGlow,    pos: [0, 1.30, -0.08] },
    { geom: new THREE.BoxGeometry(1.80, 0.20, 0.06), mat: PILLAR_MATS.plank1,      pos: [0, 1.50, 0.00], rot: [0, 0, 0.18] },
    { geom: new THREE.BoxGeometry(1.80, 0.20, 0.06), mat: PILLAR_MATS.plank2,      pos: [0, 1.05, 0.00], rot: [0, 0, -0.10] },
    { geom: new THREE.BoxGeometry(1.80, 0.20, 0.06), mat: PILLAR_MATS.plank3,      pos: [-0.10, 0.65, 0.00], rot: [0, 0, 0.06] },
    { geom: new THREE.BoxGeometry(0.80, 0.10, 0.005), mat: PILLAR_MATS.closedPaint, pos: [-0.10, 1.95, 0.04], rot: [0, 0, 0.10] },
  ],
  tippedDumpster: [
    { geom: new THREE.BoxGeometry(1.40, 0.90, 1.10), mat: PILLAR_MATS.tippedBin,    pos: [0, 0.45, 0], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.BoxGeometry(1.46, 0.08, 1.04), mat: PILLAR_MATS.dumpsterDark, pos: [0, 0.95, 0.50], rot: [-0.6, 0, 0] },
    { geom: new THREE.SphereGeometry(0.26, 8, 8),    mat: PILLAR_MATS.trashBag1,    pos: [ 0.85, 0.18, -0.10] },
    { geom: new THREE.SphereGeometry(0.22, 8, 8),    mat: PILLAR_MATS.trashBag2,    pos: [ 1.10, 0.14,  0.40] },
    { geom: new THREE.SphereGeometry(0.19, 8, 8),    mat: PILLAR_MATS.trashBag3,    pos: [ 0.65, 0.12,  0.55] },
    { geom: new THREE.PlaneGeometry(0.18, 0.26),     mat: PILLAR_MATS.trashPaper,   pos: [0.40, 0.06, -0.30], rot: [-Math.PI / 2, 0, 0.4] },
  ],
  wreckCruiser: [
    { geom: new THREE.BoxGeometry(1.50, 2.20, 0.65), mat: PILLAR_MATS.cruiserBody,    pos: [0, 0.80, 0],     rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.BoxGeometry(1.05, 1.10, 0.03), mat: PILLAR_MATS.cruiserDoor,    pos: [0, 0.80, 0.34],  rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.BoxGeometry(1.30, 1.35, 0.55), mat: PILLAR_MATS.cruiserCabin,   pos: [0, 1.36, -0.10], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.BoxGeometry(0.65, 0.18, 0.20), mat: PILLAR_MATS.cruiserBarBlue, pos: [0, 1.92, -0.36], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.BoxGeometry(0.65, 0.18, 0.20), mat: PILLAR_MATS.cruiserBarRed,  pos: [0, 1.92,  0.16], rot: [Math.PI / 2, 0, 0] },
    { geom: new THREE.CylinderGeometry(0.24, 0.24, 0.20, 12), mat: PILLAR_MATS.wheelBlack, pos: [-0.74, 0.18,  0.80], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.CylinderGeometry(0.24, 0.24, 0.20, 12), mat: PILLAR_MATS.wheelBlack, pos: [-0.74, 0.18, -0.80], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.CylinderGeometry(0.24, 0.24, 0.20, 12), mat: PILLAR_MATS.wheelBlack, pos: [ 0.74, 0.18, -0.80], rot: [0, 0, Math.PI / 2] },
    { geom: new THREE.PlaneGeometry(0.45, 1.6),               mat: PILLAR_MATS.skidMark,   pos: [0, 0.02, -1.4],       rot: [-Math.PI / 2, 0, 0] },
  ],
};

const LIVING_ROOM_BLUEPRINTS: Record<PillarVariant, SubMeshDef[]> = {
  spike: [
    { geom: new THREE.CylinderGeometry(0.16, 0.22, 1.40, 12), mat: PILLAR_MATS.scratchPost, pos: [0, 0.74, 0] },
    { geom: new THREE.CylinderGeometry(0.46, 0.50, 0.12, 16), mat: PILLAR_MATS.scratchBase, pos: [0, 0.06, 0] },
    { geom: new THREE.BoxGeometry(0.66, 0.10, 0.42), mat: PILLAR_MATS.scratchBase, pos: [0.20, 1.50, 0] },
    { geom: new THREE.SphereGeometry(0.18, 10, 8), mat: PILLAR_MATS.yarnPink, pos: [-0.30, 0.24, 0.36] },
  ],
  dome: [
    { geom: new THREE.BoxGeometry(2.20, 0.56, 1.00), mat: PILLAR_MATS.sofaBase, pos: [0, 0.34, 0] },
    { geom: new THREE.BoxGeometry(2.35, 0.72, 0.28), mat: PILLAR_MATS.sofaDark, pos: [0, 0.72, -0.48] },
    { geom: new THREE.BoxGeometry(0.68, 0.18, 0.86), mat: PILLAR_MATS.sofaCushion, pos: [-0.72, 0.72, 0.06] },
    { geom: new THREE.BoxGeometry(0.68, 0.18, 0.86), mat: PILLAR_MATS.sofaCushion, pos: [0, 0.72, 0.06] },
    { geom: new THREE.BoxGeometry(0.68, 0.18, 0.86), mat: PILLAR_MATS.sofaCushion, pos: [0.72, 0.72, 0.06] },
    { geom: new THREE.BoxGeometry(0.22, 0.70, 1.04), mat: PILLAR_MATS.sofaDark, pos: [-1.20, 0.48, 0] },
    { geom: new THREE.BoxGeometry(0.22, 0.70, 1.04), mat: PILLAR_MATS.sofaDark, pos: [1.20, 0.48, 0] },
  ],
  cluster: [
    { geom: new THREE.BoxGeometry(1.35, 0.16, 1.05), mat: PILLAR_MATS.tableWood, pos: [0, 0.76, 0] },
    { geom: new THREE.BoxGeometry(0.16, 0.74, 0.16), mat: PILLAR_MATS.tableDark, pos: [-0.52, 0.38, -0.38] },
    { geom: new THREE.BoxGeometry(0.16, 0.74, 0.16), mat: PILLAR_MATS.tableDark, pos: [0.52, 0.38, -0.38] },
    { geom: new THREE.BoxGeometry(0.16, 0.74, 0.16), mat: PILLAR_MATS.tableDark, pos: [-0.52, 0.38, 0.38] },
    { geom: new THREE.BoxGeometry(0.16, 0.74, 0.16), mat: PILLAR_MATS.tableDark, pos: [0.52, 0.38, 0.38] },
    { geom: new THREE.CylinderGeometry(0.22, 0.18, 0.26, 12), mat: PILLAR_MATS.rugCream, pos: [0.30, 0.95, 0.10] },
  ],
  burnBarrel: [
    { geom: new THREE.CircleGeometry(0.92, 28), mat: PILLAR_MATS.rugRed, pos: [0, 0.025, 0], rot: [-Math.PI / 2, 0, 0] },
    { geom: new THREE.RingGeometry(0.62, 0.72, 28), mat: PILLAR_MATS.rugCream, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] },
    { geom: new THREE.SphereGeometry(0.22, 10, 8), mat: PILLAR_MATS.yarnPink, pos: [0.24, 0.20, -0.18] },
  ],
  wreckTruck: [
    { geom: new THREE.BoxGeometry(1.80, 1.15, 0.48), mat: PILLAR_MATS.dockPlastic, pos: [0, 0.58, -0.20] },
    { geom: new THREE.BoxGeometry(1.32, 0.26, 0.06), mat: PILLAR_MATS.dockLight, pos: [0, 1.05, 0.06] },
    { geom: new THREE.CylinderGeometry(0.66, 0.70, 0.22, 24), mat: PILLAR_MATS.sedanBody, pos: [0, 0.16, 0.54] },
  ],
  steamGrate: [
    { geom: new THREE.CircleGeometry(0.96, 28), mat: PILLAR_MATS.rugCream, pos: [0, 0.025, 0], rot: [-Math.PI / 2, 0, 0] },
    { geom: new THREE.RingGeometry(0.46, 0.56, 24), mat: PILLAR_MATS.rugRed, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] },
  ],
  bodyBag: [
    { geom: new THREE.SphereGeometry(0.32, 10, 8), mat: PILLAR_MATS.yarnPink, pos: [-0.22, 0.28, 0] },
    { geom: new THREE.SphereGeometry(0.24, 10, 8), mat: PILLAR_MATS.rugCream, pos: [0.22, 0.22, 0.10] },
    { geom: new THREE.BoxGeometry(0.82, 0.08, 0.08), mat: PILLAR_MATS.scratchBase, pos: [0, 0.14, 0.32], rot: [0, 0, 0.28] },
  ],
  barricade: [
    { geom: new THREE.BoxGeometry(1.44, 0.10, 0.12), mat: PILLAR_MATS.tableWood, pos: [0, 0.60, 0], rot: [0, 0, 0.20] },
    { geom: new THREE.BoxGeometry(1.44, 0.10, 0.12), mat: PILLAR_MATS.tableWood, pos: [0, 0.94, 0], rot: [0, 0, -0.16] },
    { geom: new THREE.BoxGeometry(0.12, 0.95, 0.12), mat: PILLAR_MATS.tableDark, pos: [-0.58, 0.48, 0] },
    { geom: new THREE.BoxGeometry(0.12, 0.95, 0.12), mat: PILLAR_MATS.tableDark, pos: [0.58, 0.48, 0] },
  ],
  boardedShop: [
    { geom: new THREE.BoxGeometry(1.86, 0.32, 1.20), mat: PILLAR_MATS.sofaBase, pos: [0, 0.18, 0] },
    { geom: new THREE.BoxGeometry(1.54, 0.22, 0.90), mat: PILLAR_MATS.sofaCushion, pos: [0, 0.44, 0] },
    { geom: new THREE.BoxGeometry(1.80, 0.16, 0.20), mat: PILLAR_MATS.sofaDark, pos: [0, 0.68, -0.46] },
  ],
  tippedDumpster: [
    { geom: new THREE.BoxGeometry(1.30, 0.20, 0.92), mat: PILLAR_MATS.rugCream, pos: [0, 0.12, 0], rot: [0.18, 0, 0] },
    { geom: new THREE.BoxGeometry(0.86, 0.12, 0.18), mat: PILLAR_MATS.rugRed, pos: [-0.18, 0.28, 0.20], rot: [0, 0, 0.32] },
    { geom: new THREE.SphereGeometry(0.18, 10, 8), mat: PILLAR_MATS.yarnPink, pos: [0.50, 0.24, -0.26] },
  ],
  wreckCruiser: [
    { geom: new THREE.BoxGeometry(1.92, 0.70, 1.22), mat: PILLAR_MATS.sofaDark, pos: [0, 0.36, 0] },
    { geom: new THREE.BoxGeometry(1.50, 0.20, 0.92), mat: PILLAR_MATS.sofaCushion, pos: [0, 0.78, 0.10] },
    { geom: new THREE.BoxGeometry(1.78, 0.30, 0.18), mat: PILLAR_MATS.sofaBase, pos: [0, 0.96, -0.50] },
  ],
};

// Build the merged Group for the current pillar list. Called once per
// startLevel (whenever d.pillars reference changes). Each material →
// one merged BufferGeometry → one draw call.
function buildPillarGroup(pillars: Pillar[]): { group: THREE.Group; geoms: THREE.BufferGeometry[] } {
  const group = new THREE.Group();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();

  const rootMat = new THREE.Matrix4();
  const subMat = new THREE.Matrix4();
  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();

  for (const pillar of pillars) {
    const bp = (CARTRIDGE.visuals?.worldProps === 'living-room' ? LIVING_ROOM_BLUEPRINTS : BLUEPRINTS)[pillar.variant];
    if (!bp) continue;
    // Pillar root = (position_xz, rot_y, uniform scale)
    tmpPos.set(pillar.position.x, 0, pillar.position.z);
    tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pillar.rot);
    tmpScale.set(pillar.scale, pillar.scale, pillar.scale);
    rootMat.compose(tmpPos, tmpQuat, tmpScale);

    for (const def of bp) {
      // Sub-mesh local transform.
      const [px, py, pz] = def.pos;
      tmpPos.set(px, py, pz);
      const [rx, ry, rz] = def.rot ?? [0, 0, 0];
      tmpEuler.set(rx, ry, rz);
      tmpQuat.setFromEuler(tmpEuler);
      const s = def.scale;
      if (Array.isArray(s)) tmpScale.set(s[0], s[1], s[2]);
      else if (typeof s === 'number') tmpScale.set(s, s, s);
      else tmpScale.set(1, 1, 1);
      subMat.compose(tmpPos, tmpQuat, tmpScale);

      tmpMat.multiplyMatrices(rootMat, subMat);

      const clone = def.geom.clone();
      clone.applyMatrix4(tmpMat);

      if (!byMat.has(def.mat)) byMat.set(def.mat, []);
      byMat.get(def.mat)!.push(clone);
    }
  }

  const allGeoms: THREE.BufferGeometry[] = [];
  byMat.forEach((geoms, mat) => {
    const merged = mergeGeometries(geoms);
    for (const g of geoms) g.dispose();   // drop the per-pillar clones
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = false;             // hero light no longer casts, no shadow pass to cost
    mesh.receiveShadow = true;
    group.add(mesh);
    allGeoms.push(merged);
  });

  return { group, geoms: allGeoms };
}

// Renderer — watches the pillar array reference; rebuilds the merged Group
// whenever it changes (i.e. on startLevel). Otherwise zero per-frame work.
function Pillars({ state }: { state: React.MutableRefObject<GameRef> }) {
  const rootRef = useRef<THREE.Group>(null);
  const lastPillarsRef = useRef<Pillar[] | null>(null);
  const builtRef = useRef<{ group: THREE.Group; geoms: THREE.BufferGeometry[] } | null>(null);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const d = state.current;
    if (d.pillars === lastPillarsRef.current) return;
    lastPillarsRef.current = d.pillars;

    // Tear down the previous build (geometries only; materials are shared).
    if (builtRef.current) {
      root.remove(builtRef.current.group);
      for (const g of builtRef.current.geoms) g.dispose();
      builtRef.current = null;
    }

    if (d.pillars.length === 0) return;

    const built = buildPillarGroup(d.pillars);
    root.add(built.group);
    builtRef.current = built;
  });

  return <group ref={rootRef} />;
}


// Central manhole — flat landmark at world origin. The game loop still
// keeps a 1.35u collision dead-zone there (so the player's spawn isn't
// blocked by a stalled car spawning on top), so the renderer fills it with
// a manhole cover + small steam plume reading as "this is the middle of
// the street."
function Altar() {
  const steamMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.32 + (Math.sin(t * 0.7) * 0.5 + 0.5) * 0.18;
    if (steamMat.current) steamMat.current.opacity = pulse;
  });
  return (
    <group position={[0, 0, 0]}>
      {/* manhole disc — slightly raised iron lid */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[1.10, 1.15, 0.06, 28]} />
        <meshStandardMaterial color="#22232a" roughness={0.95} />
      </mesh>
      {/* inset detail ring */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.74, 28]} />
        <meshStandardMaterial color="#3a3a44" roughness={0.85} />
      </mesh>
      {/* steam plume — additive sprite drifting up from the lid; pulses
          slowly so the spot feels alive without distracting from gameplay. */}
      <mesh position={[0, 1.10, 0]}>
        <sphereGeometry args={[0.55, 12, 10]} />
        <meshBasicMaterial
          ref={steamMat}
          color="#cfd2d8"
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// Glowing moss / cracks at the inside-base of the perimeter walls. Cool
// blue-green so the player sees the boundary even when the warm blockParty
// hasn't reached it — without breaking the dark-cave mood.
function WallEdges() {
  return (
    <>
      <mesh position={[0, 0.05, -ARENA_HALF + 0.05]}>
        <boxGeometry args={[ARENA_HALF * 2.0, 0.10, 0.08]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0.05,  ARENA_HALF - 0.05]}>
        <boxGeometry args={[ARENA_HALF * 2.0, 0.10, 0.08]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-ARENA_HALF + 0.05, 0.05, 0]}>
        <boxGeometry args={[0.08, 0.10, ARENA_HALF * 2.0]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[ ARENA_HALF - 0.05, 0.05, 0]}>
        <boxGeometry args={[0.08, 0.10, ARENA_HALF * 2.0]} />
        <meshStandardMaterial color="#0a1a18" emissive="#1f6e74" emissiveIntensity={0.8} />
      </mesh>
    </>
  );
}


// Monsters — dark twisted shapes. Eyes glow yellow when lurking, red when
// striking. During the 1.2s strike telegraph: a pulsing red floor ring at
// the monster's feet AND a stretching tendril aimed at the player. Both
// flash on the live-hit frame.
// Zombies — instantiate the imperative voxel builder once per monster, cache
// the group + its rig refs, and animate shamble + bite + hit-flash each frame.

function Monsters({ state }: { state: React.MutableRefObject<GameRef> }) {
  // Per-monster cached visuals (built lazily on first useFrame tick).
  type Slot = {
    group: ZombieGroup;
    ring: THREE.Mesh;
    ringMat: THREE.MeshBasicMaterial;
    eliteRing: THREE.Mesh | null;
    eliteRingMat: THREE.MeshBasicMaterial | null;
    /** Persistent violet ground ring for tier='boss' monsters — makes
     *  the boss instantly pickable from a crowd of 30+ regular zombies.
     *  Pulses slowly so it reads "important" without flickering. */
    bossRing: THREE.Mesh | null;
    bossRingMat: THREE.MeshBasicMaterial | null;
    // Boss-skill telegraph — added lazily for bosses with a skill. A
    // flat ground beam mesh (positioned along skill.aim, scaled per
    // phase) used by charge + beam. Shield uses shieldRing instead.
    skillBeam: THREE.Mesh | null;
    skillBeamMat: THREE.MeshBasicMaterial | null;
    shieldRing: THREE.Mesh | null;
    shieldRingMat: THREE.MeshBasicMaterial | null;
    tier: ZombieTier;
  };
  const slots = useRef<Map<number, Slot>>(new Map());
  const rootRef = useRef<THREE.Group>(null);

  useFrame(({ clock, camera: cam }) => {
    const d = state.current;
    const root = rootRef.current;
    if (!root) return;
    const t = clock.getElapsedTime();
    const tuning = getLevelTuning(d.level);
    const STRIKE_TELEGRAPH = tuning.strikeTelegraph;

    // Add slots for any new monsters.
    const live = new Set<number>();
    for (const m of d.monsters) {
      live.add(m.id);
      let slot = slots.current.get(m.id);
      if (!slot) {
        const group = CARTRIDGE.buildEnemy(m.tier as ZombieTier, m.bossSkin ?? m.bossKind);
        // Strike-warning ground ring — bright red disc, only visible during
        // bite windup. Kept separate so the zombie body can scale freely.
        const ringGeom = new THREE.RingGeometry(0.7, 0.95, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xff3838,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        ring.visible = false;
        group.add(ring);

        // Elite marker — a second, persistent crimson ring with a faint
        // pulse. Only added when this monster is the anti-stall elite
        // stalker. Helps the player instantly distinguish it from a
        // regular stalker (same body model) and read incoming danger.
        let eliteRing: THREE.Mesh | null = null;
        let eliteRingMat: THREE.MeshBasicMaterial | null = null;
        if (m.isElite) {
          const eRingGeom = new THREE.RingGeometry(1.05, 1.40, 36);
          eliteRingMat = new THREE.MeshBasicMaterial({
            color: 0xff1240,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          });
          eliteRing = new THREE.Mesh(eRingGeom, eliteRingMat);
          eliteRing.rotation.x = -Math.PI / 2;
          eliteRing.position.y = 0.05;
          group.add(eliteRing);
        }

        // Persistent boss marker — violet pulsing ground ring so the
        // boss is findable in a 30+ swarm. 2026-06-17: dialed back
        // to a subtle band (thinner geometry + ~half opacity) after
        // the original full-bright ring read as visually noisy.
        let bossRing: THREE.Mesh | null = null;
        let bossRingMat: THREE.MeshBasicMaterial | null = null;
        if (m.tier === 'boss') {
          const bRingGeom = new THREE.RingGeometry(1.20, 1.70, 40);
          bossRingMat = new THREE.MeshBasicMaterial({
            color: 0xa060ff,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          });
          bossRing = new THREE.Mesh(bRingGeom, bossRingMat);
          bossRing.rotation.x = -Math.PI / 2;
          bossRing.position.y = 0.03;
          group.add(bossRing);
        }

        // Boss skill telegraph meshes — built once for bosses with a
        // skill, then animated per frame. Two flavors: skillBeam is a
        // long thin flat box that scales/orients along the skill's aim
        // (used by charge ground-line + beam laser); shieldRing is a
        // pulsing ring under SWAT's feet (used by shield).
        let skillBeam: THREE.Mesh | null = null;
        let skillBeamMat: THREE.MeshBasicMaterial | null = null;
        let shieldRing: THREE.Mesh | null = null;
        let shieldRingMat: THREE.MeshBasicMaterial | null = null;
        // Telegraph meshes — two pools, one per geometry type:
        //   skillBeam   = world-space PlaneGeometry (charge / beam /
        //                  burstfire aim line)
        //   shieldRing  = local-space RingGeometry under the boss
        //                  (shield / summon / blink / rage)
        const beamKinds = new Set(['charge', 'beam', 'burstfire']);
        const ringKinds = new Set(['shield', 'summon', 'blink', 'rage', 'pounce']);
        if (m.skill && beamKinds.has(m.skill.kind)) {
          // 1u-wide unit box; per-frame we scale Z (length) + alpha.
          // Group-relative is awkward because we want the beam in WORLD
          // space (the boss rotates during dying etc.). Make it a free
          // child of the rendered group root — Monsters renders into
          // its own rootRef so this lives at scene root level.
          const beamCol =
            m.skill.kind === 'beam'      ? 0xff2030
            : m.skill.kind === 'burstfire' ? 0xff4060
            :                              0xff7030;   // charge
          skillBeamMat = new THREE.MeshBasicMaterial({
            color: beamCol,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          });
          skillBeam = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),  // X = width, Y = length
            skillBeamMat,
          );
          skillBeam.rotation.x = -Math.PI / 2;
          skillBeam.position.y = 0.05;
          skillBeam.visible = false;
          root.add(skillBeam);  // not parented to monster group — world-space
        }
        if (m.skill && ringKinds.has(m.skill.kind)) {
          const ringCol =
            m.skill.kind === 'shield' ? 0x4fc0ff
            : m.skill.kind === 'summon' ? 0x80c0ff   // whistle blue
            : m.skill.kind === 'blink'  ? 0xa050ff   // arcane purple
            : m.skill.kind === 'pounce' ? 0x3fb6ac   // punk teal (matches mohawk)
            :                             0xff5030;  // rage orange-red
          shieldRingMat = new THREE.MeshBasicMaterial({
            color: ringCol,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          });
          shieldRing = new THREE.Mesh(
            new THREE.RingGeometry(1.0, 1.35, 36),
            shieldRingMat,
          );
          shieldRing.rotation.x = -Math.PI / 2;
          shieldRing.position.y = 0.05;
          shieldRing.visible = false;
          group.add(shieldRing);  // local — follows the boss
        }

        slot = { group, ring, ringMat, eliteRing, eliteRingMat,
                 bossRing, bossRingMat,
                 skillBeam, skillBeamMat, shieldRing, shieldRingMat,
                 tier: m.tier as ZombieTier };
        slots.current.set(m.id, slot);
        root.add(group);
      }
      // Body position + facing.
      slot.group.position.copy(m.position);
      slot.group.rotation.y = m.rotation;
      // Boss size scales with cycle as a strength tell (set by
      // spawnMonsterTier via m.scaleMul). Applied once per render —
      // group.scale isn't otherwise touched per-frame.
      if (m.scaleMul && m.scaleMul !== 1 && slot.group.scale.x !== m.scaleMul) {
        slot.group.scale.setScalar(m.scaleMul);
      }
      // Sprite billboard — flat plane always faces the camera.
      if (slot.group.userData.isSprite) {
        slot.group.quaternion.copy(cam.quaternion);
      }
      // Late-game LOD — only run per-frame cosmetic animation (idle hop,
      // limb swing, strike-telegraph ring pulse, elite ring breathe) for
      // monsters within 18u of the player. Far ones still draw at the
      // right position but freeze in pose, dropping ~30-40% of the per-
      // frame Monsters CPU work at endless L8+ when the field has 70+
      // bodies. Dying ragdolls keep full-fidelity animation for visual
      // punch; they're capped in count by the death-flight life.
      const dxP = m.position.x - d.pos.x;
      const dzP = m.position.z - d.pos.z;
      const distSqToPlayer = dxP * dxP + dzP * dzP;
      const farMonster = !m.dying && distSqToPlayer > 18 * 18;
      // Elite-ring pulse — slow scale + alpha breathe so the marker reads
      // alive across a 70+ second standoff. Skipped for far monsters.
      if (!farMonster && slot.eliteRing && slot.eliteRingMat) {
        const epulse = 0.70 + Math.sin(t * 3.2 + m.id) * 0.30;
        slot.eliteRing.scale.setScalar(1 + epulse * 0.10);
        slot.eliteRingMat.opacity = 0.40 + epulse * 0.30;
      }
      // Boss ring — always-on violet halo so the player can spot the
      // boss across the field. Slower pulse than the elite ring so the
      // two markers stay distinguishable when both are on screen.
      if (slot.bossRing && slot.bossRingMat) {
        const bpulse = 0.65 + Math.sin(t * 2.0 + m.id) * 0.35;
        slot.bossRing.scale.setScalar(1 + bpulse * 0.06);
        // Dialed back 2026-06-17 — 0.20→0.40 range (was 0.55→0.85).
        slot.bossRingMat.opacity = 0.20 + bpulse * 0.20;
      }

      // ── Boss skill telegraphs ────────────────────────────────────
      // Charge + beam draw a ground-line via slot.skillBeam (world-space).
      // Shield pulses slot.shieldRing (local to SWAT).
      if (m.skill && slot.skillBeam && slot.skillBeamMat) {
        const sk = m.skill;
        if (sk.kind === 'charge') {
          // Length = 12u dash distance, lay along aim from minotaur foot.
          const LEN = 12;
          if (sk.phase === 'telegraph') {
            slot.skillBeam.visible = true;
            slot.skillBeamMat.opacity = 0.25 + (sk.phaseT / 0.7) * 0.55;
            const w = 0.6 + sk.phaseT * 0.4;
            slot.skillBeam.scale.set(w, LEN, 1);
            slot.skillBeam.position.set(
              m.position.x + sk.aimX * LEN * 0.5,
              0.05,
              m.position.z + sk.aimZ * LEN * 0.5,
            );
            slot.skillBeam.rotation.z = Math.atan2(sk.aimX, sk.aimZ);
          } else if (sk.phase === 'active') {
            // Hot trail behind the actual dash position — fades quickly.
            slot.skillBeam.visible = true;
            slot.skillBeamMat.opacity = Math.max(0, 0.7 - sk.phaseT * 0.6);
            slot.skillBeam.scale.set(1.2, LEN, 1);
          } else {
            slot.skillBeam.visible = false;
          }
        } else if (sk.kind === 'beam') {
          // Long laser line, locked aim. Telegraph = thin dotted-red
          // narrowing onto player. Active = thick bright pulse. Beam
          // width is now narrower to match the slimmer hit corridor.
          const LEN = 22;
          if (sk.phase === 'telegraph') {
            slot.skillBeam.visible = true;
            const t01 = sk.phaseT / 1.5;
            slot.skillBeamMat.opacity = 0.22 + t01 * 0.55;
            slot.skillBeam.scale.set(0.24 + t01 * 0.20, LEN, 1);     // v3 widened slightly: 0.24→0.44 (matches 0.70u corridor)
            slot.skillBeam.position.set(
              m.position.x + sk.aimX * LEN * 0.5,
              0.06,
              m.position.z + sk.aimZ * LEN * 0.5,
            );
            slot.skillBeam.rotation.z = Math.atan2(sk.aimX, sk.aimZ);
          } else if (sk.phase === 'active') {
            slot.skillBeam.visible = true;
            slot.skillBeamMat.opacity = 0.95 * (1 - sk.phaseT / 0.4);
            slot.skillBeam.scale.set(0.80, LEN, 1);                  // v3 widened: 0.80 (matches 0.70u corridor; was 0.65/0.55)
          } else {
            slot.skillBeam.visible = false;
          }
        } else if (sk.kind === 'burstfire') {
          // Cowboy revolver — thin red aim line during telegraph that
          // tracks the player, then flashes per shot during active.
          // Lays along the cowboy → player vector each frame in
          // telegraph (no locked aim — each shot re-aims live).
          const LEN = 18;
          if (sk.phase === 'telegraph') {
            const pdx = state.current.pos.x - m.position.x;
            const pdz = state.current.pos.z - m.position.z;
            const pd = Math.hypot(pdx, pdz);
            const inv = pd > 0.001 ? 1 / pd : 0;
            const aX = pdx * inv;
            const aZ = pdz * inv;
            slot.skillBeam.visible = true;
            slot.skillBeamMat.opacity = 0.25 + (sk.phaseT / 0.5) * 0.40;
            slot.skillBeam.scale.set(0.25, LEN, 1);
            slot.skillBeam.position.set(
              m.position.x + aX * LEN * 0.5,
              0.06,
              m.position.z + aZ * LEN * 0.5,
            );
            slot.skillBeam.rotation.z = Math.atan2(aX, aZ);
          } else if (sk.phase === 'active') {
            // Brief muzzle-flash style — visible for 60ms each shot
            // (sk.aimX counts down between shots).
            const flashUp = sk.aimX > 0.10;     // shot just fired ~60ms ago
            slot.skillBeam.visible = !flashUp;
            if (!flashUp) slot.skillBeamMat.opacity = 0.85;
          } else {
            slot.skillBeam.visible = false;
          }
        }
      }
      // Summon / blink / rage / flank — driven by shieldRing mesh
      // (already drawn for shield above; this branch handles the rest).
      if (m.skill && slot.shieldRing && slot.shieldRingMat) {
        const sk = m.skill;
        if (sk.kind === 'summon') {
          // Whistle expanding ring during telegraph; brief pop after spawn.
          if (sk.phase === 'telegraph') {
            slot.shieldRing.visible = true;
            const t01 = sk.phaseT / 0.6;
            slot.shieldRingMat.opacity = 0.40 + t01 * 0.45;
            slot.shieldRing.scale.setScalar(1.0 + t01 * 0.9);
          } else if (sk.phase === 'recover') {
            slot.shieldRing.visible = true;
            slot.shieldRingMat.opacity = Math.max(0, 0.8 - sk.phaseT * 1.6);
            slot.shieldRing.scale.setScalar(2.0);
          } else {
            slot.shieldRing.visible = false;
          }
        } else if (sk.kind === 'blink') {
          // Purple swirl at telegraph spot, then re-puff at recover spot.
          if (sk.phase === 'telegraph') {
            slot.shieldRing.visible = true;
            const t01 = sk.phaseT / 0.4;
            slot.shieldRingMat.opacity = 0.30 + t01 * 0.65;
            slot.shieldRing.scale.setScalar(1.0 + t01 * 0.6);
          } else if (sk.phase === 'recover') {
            slot.shieldRing.visible = true;
            slot.shieldRingMat.opacity = Math.max(0, 0.95 - sk.phaseT * 2.5);
            slot.shieldRing.scale.setScalar(1.6 - sk.phaseT * 1.0);
          } else {
            slot.shieldRing.visible = false;
          }
        } else if (sk.kind === 'pounce') {
          // Pounce ring — telegraph = ring CONTRACTS under the punk
          // (signals "about to spring"); active = invisible (body
          // is mid-air); recover = expanding burst ring at the
          // landing point (signals "AOE hit zone").
          if (sk.phase === 'telegraph') {
            slot.shieldRing.visible = true;
            const t01 = sk.phaseT / 0.3;
            slot.shieldRingMat.opacity = 0.35 + t01 * 0.50;
            slot.shieldRing.scale.setScalar(1.6 - t01 * 0.8);   // 1.6 → 0.8
          } else if (sk.phase === 'active') {
            slot.shieldRing.visible = false;
          } else if (sk.phase === 'recover') {
            slot.shieldRing.visible = true;
            const t01 = Math.min(1, sk.phaseT / 0.5);
            slot.shieldRingMat.opacity = Math.max(0, 0.95 - t01 * 1.0);
            slot.shieldRing.scale.setScalar(0.8 + t01 * 1.6);   // 0.8 → 2.4
          } else {
            slot.shieldRing.visible = false;
          }
        } else if (sk.kind === 'rage') {
          // Red flame ring under the firefighter while active. Telegraph
          // = slow buildup, active = constant pulse, recover = fade.
          if (sk.phase === 'telegraph') {
            slot.shieldRing.visible = true;
            const t01 = sk.phaseT / 1.0;
            slot.shieldRingMat.opacity = 0.20 + t01 * 0.55;
            slot.shieldRing.scale.setScalar(1.0 + t01 * 0.2);
          } else if (sk.phase === 'active') {
            slot.shieldRing.visible = true;
            const breathe = 0.7 + Math.sin(t * 16 + m.id) * 0.3;
            slot.shieldRingMat.opacity = 0.55 + breathe * 0.40;
            slot.shieldRing.scale.setScalar(1.15 + breathe * 0.08);
          } else if (sk.phase === 'recover') {
            slot.shieldRing.visible = true;
            slot.shieldRingMat.opacity = Math.max(0, 0.80 - sk.phaseT * 0.8);
            slot.shieldRing.scale.setScalar(1.2);
          } else {
            slot.shieldRing.visible = false;
          }
        }
      }
      if (m.skill?.kind === 'shield' && slot.shieldRing && slot.shieldRingMat) {
        const sk = m.skill;
        if (sk.phase === 'active' || sk.phase === 'telegraph') {
          slot.shieldRing.visible = true;
          const breathe = 0.7 + Math.sin(t * 8 + m.id) * 0.3;
          slot.shieldRingMat.opacity = 0.50 + breathe * 0.35;
          slot.shieldRing.scale.setScalar(1.0 + breathe * 0.06);
        } else {
          slot.shieldRing.visible = false;
        }
      }

      // DYING — body is launched; arc upward then fall. deathStyle picks
      // ONE of 4 distinct tumble + limp-pose combos so a wave of dying
      // bodies looks chaotic, not like a chorus line.
      if (m.dying) {
        const flightLife = 0.6;
        const t01 = Math.min(1, m.dyingT / flightLife);
        const arc = (m.deathArc || 1.8);
        slot.group.position.y = 0.5 + Math.sin(t01 * Math.PI) * arc;
        const rigD = slot.group.userData.rig;
        const style = m.deathStyle | 0;
        if (style === 0) {
          // FORWARD FLIP — fast tumble around X, arms thrown forward
          slot.group.rotation.x = m.dyingT * 13;
          slot.group.rotation.z = 0;
          if (rigD) {
            rigD.legL.rotation.x = 0.7;
            rigD.legR.rotation.x = -0.7;
            rigD.armL.rotation.x = -Math.PI / 2 + 0.2;
            rigD.armR.rotation.x = -Math.PI / 2 + 0.2;
          }
        } else if (style === 1) {
          // SIDE CARTWHEEL — tumble around Z, limbs windmill
          slot.group.rotation.x = 0;
          slot.group.rotation.z = m.dyingT * 15 * Math.sign(m.flightSpin || 1);
          if (rigD) {
            const wind = m.dyingT * 22;
            rigD.legL.rotation.x =  Math.sin(wind) * 0.9;
            rigD.legR.rotation.x = -Math.sin(wind + 1.3) * 0.9;
            rigD.armL.rotation.x =  Math.sin(wind + 0.6) * 1.2 - 0.6;
            rigD.armR.rotation.x = -Math.sin(wind + 2.1) * 1.2 - 0.6;
          }
        } else if (style === 2) {
          // SPIN TOP — fast Y-axis spin, short arc, legs/arms flailing out
          slot.group.position.y = 0.5 + Math.sin(t01 * Math.PI) * (arc * 0.55);
          slot.group.rotation.y += 0.55;     // accumulate fast spin
          slot.group.rotation.x = 0.15 + t01 * 0.5;
          slot.group.rotation.z = 0;
          if (rigD) {
            rigD.legL.rotation.x =  1.0;
            rigD.legR.rotation.x = -1.0;
            rigD.armL.rotation.x = -Math.PI / 2 - 0.4;
            rigD.armR.rotation.x = -Math.PI / 2 - 0.4;
          }
        } else {
          // BACK FLOP — slow back-arch tumble, arms slack at sides
          slot.group.rotation.x = -m.dyingT * 7;
          slot.group.rotation.z = (m.flightSpin || 8) * 0.04 * m.dyingT;
          if (rigD) {
            rigD.legL.rotation.x = -0.2;
            rigD.legR.rotation.x =  0.2;
            rigD.armL.rotation.x = -0.4;
            rigD.armR.rotation.x = -0.4;
          }
        }
        // Skip the live-AI animation block this frame.
        continue;
      }

      // Far-monster early-out — skip rig animation, idle hop, knockback
      // flinch, strike-ring update, and hit-flash for monsters out of
      // the player's immediate proximity. They still render at the
      // correct world position; the body just freezes pose. Big CPU win
      // at endless L8+ when 70-90% of the roster is past 18u.
      if (farMonster) {
        // Clear any sticky visual state from the last close-frame so a
        // monster that just walked out of range doesn't carry a strike
        // ring or hit-flash with it.
        if (slot.ring.visible) slot.ring.visible = false;
        flashWhite(slot.group, 0);
        continue;
      }

      // Shamble — legs swing on a slow sine; striking freezes them.
      const striking = m.state === 'striking';
      const phase = striking ? Math.min(1, m.strikeT / STRIKE_TELEGRAPH) : 0;
      const liveBite = striking && m.strikeT >= STRIKE_TELEGRAPH;
      const rig = slot.group.userData.rig;
      if (rig) {
        const walkSpeed = m.tier === 'stalker' ? 6.5 : m.tier === 'boss' ? 2.4 : 4.0;
        const swing = striking ? 0 : Math.sin(t * walkSpeed + m.id) * 0.55;
        rig.legL.rotation.x =  swing;
        rig.legR.rotation.x = -swing;
        // Arm reach: rests at armBase (-1.15rad bent forward); during the
        // bite windup interpolate to 0 (fully outstretched forward), then
        // hold there during the live frame.
        const armBase = slot.group.userData.armBase ?? 0;
        const reach = striking ? armBase * (1 - (liveBite ? 1 : phase * 0.9)) : armBase;
        rig.armL.rotation.x = reach;
        rig.armR.rotation.x = reach;
      }

      // Crossy Road idle hop — even the lurking zombies should bob, so the
      // whole street looks alive (the original 0.12 sin bob was too subtle
      // and the bite-window freeze killed it entirely). Striking still
      // freezes movement but keeps a tiny breath so the body isn't stone.
      const hopFreq =
        m.tier === 'stalker' ? 5.5 :
        m.tier === 'boss'    ? 2.4 :
                                3.6;
      const hopAmpBase = m.tier === 'boss' ? 0.10 : 0.18;
      const hopAmp = striking ? hopAmpBase * 0.25 : hopAmpBase;
      slot.group.position.y = Math.abs(Math.sin(t * hopFreq + m.id)) * hopAmp;

      // KNOCKBACK FLINCH — brief Y hop + body lean-back during the
      // knockbackT window so each hit visibly shakes the zombie even if
      // it doesn't die.
      if (m.knockbackT > 0) {
        const kb01 = Math.min(1, m.knockbackT / 0.30);
        slot.group.position.y += Math.sin(kb01 * Math.PI) * 0.42;
        slot.group.rotation.x = -kb01 * 0.55;      // lean back
      } else if (!striking) {
        slot.group.rotation.x = 0;
      }

      // Ground warning ring — fades up through telegraph, blasts on live.
      slot.ring.visible = striking;
      if (striking) {
        const ringPulse = 0.8 + Math.sin(t * 12) * 0.2;
        const ringScale = (1.0 + phase * 0.9) * ringPulse;
        slot.ring.scale.set(ringScale, 1, ringScale);
        slot.ringMat.opacity = liveBite ? 0.95 : 0.40 + phase * 0.50;
      }

      // Hit-flash from a recent bullet impact.
      if (m.hitFlashT > 0) {
        flashWhite(slot.group, Math.min(1, m.hitFlashT / 0.10));
      } else {
        flashWhite(slot.group, 0);
      }
    }

    // Reap any slots whose monster died.
    for (const [id, slot] of slots.current) {
      if (!live.has(id)) {
        root.remove(slot.group);
        slot.ring.geometry.dispose();
        slot.ringMat.dispose();
        if (slot.eliteRing) slot.eliteRing.geometry.dispose();
        if (slot.eliteRingMat) slot.eliteRingMat.dispose();
        if (slot.bossRing) slot.bossRing.geometry.dispose();
        if (slot.bossRingMat) slot.bossRingMat.dispose();
        if (slot.skillBeam) { root.remove(slot.skillBeam); slot.skillBeam.geometry.dispose(); }
        if (slot.skillBeamMat) slot.skillBeamMat.dispose();
        if (slot.shieldRing) slot.shieldRing.geometry.dispose();
        if (slot.shieldRingMat) slot.shieldRingMat.dispose();
        slots.current.delete(id);
      }
    }
  });

  return <group ref={rootRef} />;
}

// Exit stone — the level goal. Designed to look NOTHING like the regular
// blue/red/green/gold crystals so the player can spot the goal instantly:
//   • Violet/magenta palette — a color used nowhere else in the game
//   • Three counter-rotating floating rings (portal feel)
//   • Larger central crystal (1.6× a regular crystal)
//   • Tall vertical beacon column visible above all pillars
//   • Big wide ground halo
// Per-weapon bullet visual recipe. Each round looks distinct so the
// screen reads as a different weapon firing even before the HUD chip
// catches up.
interface BulletLook {
  color: string;       // base body
  emissive: string;
  ei: number;          // emissive intensity
  size: [number, number, number]; // box w h d
}
const BULLET_LOOK: Record<string, BulletLook> = {
  pistol:  { color: '#fff1b5', emissive: '#ffae3a', ei: 5.5, size: [0.10, 0.10, 0.50] },   // yellow-orange amber
  shotgun: { color: '#ff8a5a', emissive: '#ff4030', ei: 6.0, size: [0.13, 0.13, 0.36] },   // red-orange pellet, shorter+fatter
  smg:     { color: '#cfecff', emissive: '#5fb8ff', ei: 6.5, size: [0.07, 0.07, 0.55] },   // blue tracer, longer+thin
  syringe: { color: '#d2ffd6', emissive: '#48ff80', ei: 6.0, size: [0.06, 0.06, 0.62] },   // green dart, very long thin
  magnum:  { color: '#f0c8ff', emissive: '#a040ff', ei: 7.0, size: [0.18, 0.16, 0.62] },   // purple chunky slug
};

function Bullets({ state }: { state: React.MutableRefObject<GameRef> }) {
  const [, force] = useState(0);
  const lastCount = useRef(0);
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  useFrame(() => {
    const d = state.current;
    if (d.bullets.length !== lastCount.current) {
      lastCount.current = d.bullets.length;
      force(c => c + 1);
    }
    for (const b of d.bullets) {
      const m = refs.current.get(b.id);
      if (!m) continue;
      m.position.set(b.position.x, b.position.y, b.position.z);
      m.rotation.y = Math.atan2(b.dirX, b.dirZ);
    }
  });
  const d = state.current;
  return (
    <>
      {d.bullets.map(b => {
        const catSwipe = CARTRIDGE.visuals?.actionStyle === 'cat-swipe';
        const look = BULLET_LOOK[b.weaponId] || BULLET_LOOK.pistol;
        return (
          <group
            key={b.id}
            ref={(el) => {
              if (el) refs.current.set(b.id, el);
              else refs.current.delete(b.id);
            }}
          >
            {catSwipe ? (
              <>
                <mesh position={[0, 0, 0.02]} scale={[0.22, 0.045, 0.16]}>
                  <sphereGeometry args={[1, 12, 8]} />
                  <meshStandardMaterial color="#ffd6e8" emissive="#ff5fa2" emissiveIntensity={2.2} transparent opacity={0.9} toneMapped={false} />
                </mesh>
                {[-0.18, 0, 0.18].map((x, i) => (
                  <mesh key={i} position={[x, 0.015, 0.24]} scale={[0.09, 0.032, 0.10]}>
                    <sphereGeometry args={[1, 10, 6]} />
                    <meshStandardMaterial color="#fff0f7" emissive="#ff7fbd" emissiveIntensity={2.4} transparent opacity={0.92} toneMapped={false} />
                  </mesh>
                ))}
                <mesh position={[0, -0.005, -0.08]} rotation={[Math.PI / 2, 0, 0]} scale={[0.56, 0.18, 0.56]}>
                  <torusGeometry args={[0.46, 0.035, 8, 24, Math.PI * 0.78]} />
                  <meshStandardMaterial color="#fff6d8" emissive="#ff9acb" emissiveIntensity={1.8} transparent opacity={0.72} toneMapped={false} />
                </mesh>
              </>
            ) : (
              <mesh>
                <boxGeometry args={look.size} />
                <meshStandardMaterial
                  color={look.color}
                  emissive={look.emissive}
                  emissiveIntensity={look.ei}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

// Muzzle flash — colors itself to match the current weapon. The
// fixed-amber flash from before fought with the per-weapon bullet
// tints; coloring it by weapon makes each shot read as that weapon.
interface MuzzleLook { tint: number; size: number; lightInt: number; }
const MUZZLE_LOOK: Record<string, MuzzleLook> = {
  pistol:  { tint: 0xffce4a, size: 0.35, lightInt: 30 },
  shotgun: { tint: 0xff5040, size: 0.55, lightInt: 50 },   // bigger flash, redder
  smg:     { tint: 0x5fb8ff, size: 0.28, lightInt: 22 },   // small, fast blue
  syringe: { tint: 0x48ff80, size: 0.30, lightInt: 26 },
  magnum:  { tint: 0xa040ff, size: 0.62, lightInt: 60 },   // big purple punch
};

const CAT_SWIPE_LOOK: MuzzleLook = { tint: 0xff5fa2, size: 0.42, lightInt: 24 };

function MuzzleFlash({ state }: { state: React.MutableRefObject<GameRef> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const swipeRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const swipeMatRefs = useRef<THREE.MeshStandardMaterial[]>([]);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const d = state.current;
    const t = d.muzzleFlashT;
    const catSwipe = CARTRIDGE.visuals?.actionStyle === 'cat-swipe';
    const flashLife = catSwipe ? 0.18 : 0.07;
    const alpha = t > 0 ? Math.min(1, t / flashLife) : 0;
    const px = d.pos.x + Math.sin(d.rot) * 0.95;
    const pz = d.pos.z + Math.cos(d.rot) * 0.95;
    const look = catSwipe
      ? CAT_SWIPE_LOOK
      : (MUZZLE_LOOK[d.currentWeaponId] || MUZZLE_LOOK.pistol);
    if (meshRef.current) {
      meshRef.current.position.set(px, 1.0, pz);
      meshRef.current.scale.setScalar((look.size + (1 - alpha) * 0.20) * (catSwipe ? 2.4 : 1.7));
    }
    if (swipeRef.current) {
      swipeRef.current.visible = catSwipe && alpha > 0;
      swipeRef.current.position.set(px, 1.10, pz);
      swipeRef.current.rotation.set(Math.PI / 2, 0, -d.rot + Math.PI / 2);
      swipeRef.current.scale.setScalar(1.05 + (1 - alpha) * 0.45);
    }
    if (matRef.current) {
      matRef.current.opacity = alpha;
      tmpColor.setHex(look.tint);
      matRef.current.emissive.copy(tmpColor);
      matRef.current.color.copy(tmpColor);
    }
    for (const mat of swipeMatRefs.current) {
      mat.opacity = alpha * 0.95;
      tmpColor.setHex(0xfff2f8);
      mat.color.copy(tmpColor);
      tmpColor.setHex(0xff4fa3);
      mat.emissive.copy(tmpColor);
    }
    if (lightRef.current) {
      lightRef.current.intensity = look.lightInt * alpha;
      tmpColor.setHex(look.tint);
      lightRef.current.color.copy(tmpColor);
    }
  });
  return (
    <>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.35, 12, 8]} />
        <meshStandardMaterial
          ref={matRef}
          color="#fff5b8"
          emissive="#ffce4a"
          emissiveIntensity={6}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <group ref={swipeRef} visible={false}>
        {[-0.22, 0, 0.22].map((z, i) => (
          <mesh key={i} position={[0, 0, z]} rotation={[0, 0, -0.22 + i * 0.04]} scale={[1.0, 1.0, 1.0]}>
            <torusGeometry args={[0.54 + i * 0.08, 0.026, 8, 26, Math.PI * 0.82]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) swipeMatRefs.current[i] = mat;
              }}
              color="#fff2f8"
              emissive="#ff4fa3"
              emissiveIntensity={3.8}
              transparent
              opacity={0}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <pointLight ref={lightRef} color="#ffce4a" intensity={0} distance={6} decay={2} />
    </>
  );
}

export function Scene(props: SceneProps) {
  const { state, playing, stickRef } = props;
  useGameLoop({
    state, playing, stick: stickRef.current,
    survivor: props.survivor,
    onScore: props.onScore,
    onDepth: props.onDepth,
    onLightRadius: props.onLightRadius,
    onGameOver: props.onGameOver,
    onPickup: props.onPickup,
    onStrikeHit: props.onStrikeHit,
    playSfx: props.playSfx,
    haptic: props.haptic,
  });

  const palette = getLevelTuning(props.level).palette;
  return (
    <>
      <FollowCamera state={state} />
      {/* City-night lighting design — the flashlight is the hero, the rest
          of the scene leans into darkness so the cone actually reads.
          - fog pulled in tighter so the playfield fades to night
          - ambient dropped from 0.38 → 0.14
          - hemisphere dropped from 0.32 → 0.16
          - cold-blue moonlight directional fills the silhouettes from above
          - streetlamp pool + crystal pool + the cop's flashlight cover the
            warm hotspots */}
      <fog attach="fog" args={[palette.fog, 11, 48]} />
      <ambientLight intensity={0.22} color={palette.ambient} />
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, 0.22]} />
      {/* Moonlight — cold directional from above, no shadow (perf). */}
      <directionalLight
        color="#9bb4dc"
        intensity={0.55}
        position={[6, 22, -4]}
      />
      <Fireflies />
      <StreetlampLights state={state} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_HALF * 4, ARENA_HALF * 4]} />
        <meshStandardMaterial color={palette.floor} roughness={0.85} />
      </mesh>

      {/* Yellow center stripes — laid lengthwise along Z, evenly spaced
          across X so the asphalt reads as a road grid. Slight emissive so
          they catch the moonlight even in the dimmest palette. */}
      {[-21, -7, 7, 21].map((xPos) => (
        Array.from({ length: 10 }).map((_, i) => (
          <mesh
            key={`stripe-${xPos}-${i}`}
            position={[xPos, 0.02, -ARENA_HALF + 3 + i * 6.5]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.36, 3.0]} />
            <meshStandardMaterial color="#e8c850" emissive="#604620" emissiveIntensity={0.4} roughness={0.7} />
          </mesh>
        ))
      ))}

      {/* Sidewalk strips along the 4 inside edges of the arena. Slightly
          raised + lighter than asphalt so the playfield has a sense of
          edge instead of just fading into wall darkness. */}
      {[
        { pos: [0, 0.06, -ARENA_HALF + 1.0] as [number, number, number], size: [ARENA_HALF * 2, 2] as [number, number] },
        { pos: [0, 0.06,  ARENA_HALF - 1.0] as [number, number, number], size: [ARENA_HALF * 2, 2] as [number, number] },
        { pos: [-ARENA_HALF + 1.0, 0.06, 0] as [number, number, number], size: [2, ARENA_HALF * 2] as [number, number] },
        { pos: [ ARENA_HALF - 1.0, 0.06, 0] as [number, number, number], size: [2, ARENA_HALF * 2] as [number, number] },
      ].map((s, i) => (
        <mesh key={`sidewalk-${i}`} position={s.pos} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={s.size} />
          <meshStandardMaterial color="#3a3a44" roughness={0.95} />
        </mesh>
      ))}

      {/* Neon perimeter signs — bright emissive boxes on the inside face
          of each wall. Colors vary by side so the player can orient by
          the dominant neon glow even at the edge of vision. */}
      <NeonSigns />

      {/* Crosswalk stripes — white parallel rectangles flanking the
          central street crossings, adds urban detail to the asphalt. */}
      {[-12, 0, 12].map(zPos => (
        [-3, -1.2, 0.6, 2.4].map((xPos, i) => (
          <mesh
            key={`crosswalk-${zPos}-${i}`}
            position={[xPos, 0.03, zPos]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[1.0, 2.6]} />
            <meshStandardMaterial color="#d8d8e0" emissive="#404048" emissiveIntensity={0.3} roughness={0.7} />
          </mesh>
        ))
      ))}

      {/* Cave walls (outer ring) — taller dark cylinders around perimeter */}
      <mesh position={[0, 1.5, -ARENA_HALF - 0.5]} castShadow>
        <boxGeometry args={[ARENA_HALF * 2.4, 6, 1]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>
      <mesh position={[0, 1.5,  ARENA_HALF + 0.5]} castShadow>
        <boxGeometry args={[ARENA_HALF * 2.4, 6, 1]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>
      <mesh position={[-ARENA_HALF - 0.5, 1.5, 0]} castShadow>
        <boxGeometry args={[1, 6, ARENA_HALF * 2.4]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>
      <mesh position={[ ARENA_HALF + 0.5, 1.5, 0]} castShadow>
        <boxGeometry args={[1, 6, ARENA_HALF * 2.4]} />
        <meshStandardMaterial color="#100a08" roughness={1} />
      </mesh>

      <Altar />
      <WallEdges />
      <Pillars state={state} />
      <Crystals state={state} />
      <CrystalLights state={state} />
      <Player state={state} survivorId={props.survivor} heroPhotoUrl={props.heroPhotoUrl} />
      <Monsters state={state} />
      <Bullets state={state} />
      <MuzzleFlash state={state} />
      <BloodSplats state={state} />
      <WeaponDrops state={state} />
      <PerkDrops state={state} />
      <EnemyProjectiles state={state} />
      <ExitBeacon state={state} />
      {/* Weather cycles with the palette: dusk = rain + lightning, blackout
          = embers. Twilight cycles stay clear. Endless: this repeats every
          3 nights. */}
      <Rain      visible={((props.level - 1) % 3) === 1} />
      <Lightning visible={((props.level - 1) % 3) === 1} />
      <Embers    visible={((props.level - 1) % 3) === 2} />
    </>
  );
}
