import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CAMERA_FOV, CAMERA_POS, ARENA_HALF,
  PLAYER_SPEED,
  getLevelTuning,
} from '../constants';
import { useGameLoop, GameRef, PickupKind, SfxKey } from '../hooks/useGameLoop';
import type { Stick } from '../types';
import { makeZombie, flashWhite, type ZombieGroup, type ZombieTier } from '../builders/monsters';
import { makeSurvivor, makeFlashlight, type CharacterGroup, type SurvivorId } from '../builders/characters';
import { makeWeapon } from '../builders/weapons';

interface SceneProps {
  state: React.MutableRefObject<GameRef>;
  playing: boolean;
  level: number;            // drives per-level palette
  stickRef: React.MutableRefObject<Stick>;
  survivor: SurvivorId;     // selected archetype for this run
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
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    camera.position.set(CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2]);
    (camera as THREE.PerspectiveCamera).fov = CAMERA_FOV;
    (camera as THREE.PerspectiveCamera).near = 0.1;
    (camera as THREE.PerspectiveCamera).far = 200;
    camera.lookAt(0, 0, 0);
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  useFrame(() => {
    const d = state.current;
    desired.set(d.pos.x + CAMERA_POS[0], CAMERA_POS[1], d.pos.z + CAMERA_POS[2]);
    camera.position.lerp(desired, 0.16);
    lookAt.set(d.pos.x, 0, d.pos.z);
    camera.lookAt(lookAt);
  });
  return null;
}

// Player — survivor archetype (cop for now) with a pistol in the right hand
// and a flashlight in the left. The left arm is locked forward so the
// flashlight cone tracks the player's facing; the right arm tracks the
// current aim target dynamically inside the 110° fire arc.
function Player({ state, survivorId }: { state: React.MutableRefObject<GameRef>; survivorId: SurvivorId }) {
  const rootRef = useRef<THREE.Group>(null);
  const survivorRef = useRef<CharacterGroup | null>(null);
  // The "hero light" — same omnidirectional PointLight the original lantern
  // used (intensity 170, distance 30, shadow-casting, warm amber). Stored
  // in a ref so useFrame can pulse it with the breath animation.
  const heroLightRef = useRef<THREE.PointLight | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const survivor = makeSurvivor(survivorId);

    // Right arm — weapon prop, selected by the archetype. Position is
    // shoulder-local; when the arm rotates forward + swings, the weapon
    // follows. YXZ order so rotation.y (target tracking) is applied AFTER
    // rotation.x (forward lift), letting the gun swing left/right inside
    // the firing arc.
    survivor.userData.rig.armR.rotation.order = 'YXZ';
    const weapon = makeWeapon(survivorId);
    weapon.position.set(0.03, -0.95, 0.15);
    survivor.userData.rig.armR.add(weapon);

    // Left arm — flashlight prop. The model is just visual; the actual
    // "hero light" is an omnidirectional PointLight attached at the lens.
    const flashlight = makeFlashlight();
    flashlight.position.set(0, -1.0, 0);
    survivor.userData.rig.armL.add(flashlight);

    // Hero PointLight — verbatim from the old lantern (intensity 170,
    // distance 30, decay 2, castShadow). Lives at the flashlight lens so
    // it tracks the cop's left hand, but its glow is omnidirectional so
    // the warm bath surrounds the player exactly like the lantern did.
    const heroLight = new THREE.PointLight(0xff9a3a, 170, 30, 2);
    heroLight.position.set(0, 0, 0.25);          // at the lens, flashlight-local
    heroLight.castShadow = true;
    heroLight.shadow.mapSize.set(1024, 1024);
    heroLight.shadow.bias = -0.0008;
    heroLight.shadow.normalBias = 0.04;
    heroLight.shadow.camera.near = 0.3;
    heroLight.shadow.camera.far = 20;
    flashlight.add(heroLight);
    heroLightRef.current = heroLight;

    root.add(survivor);
    survivorRef.current = survivor;
    return () => {
      root.remove(survivor);
      survivorRef.current = null;
      heroLightRef.current = null;
    };
  }, [survivorId]);

  useFrame(({ clock }) => {
    const d = state.current;
    const root = rootRef.current;
    const survivor = survivorRef.current;
    if (!root || !survivor) return;
    root.position.copy(d.pos);
    root.rotation.y = d.rot;

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
      heroLightRef.current.intensity = 170 * breath;
      heroLightRef.current.distance  = 30  * (0.92 + slow * 0.95);
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

// Per-crystal mesh sync. Renders the 4 types in distinct colors with
// emissive shimmer + slow rotation.
function Crystals({ state }: { state: React.MutableRefObject<GameRef> }) {
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  const [, force] = useState(0);
  const lastCount = useRef(-1);
  useFrame(({ clock }) => {
    const d = state.current;
    const t = clock.getElapsedTime();
    if (d.crystals.length !== lastCount.current) {
      lastCount.current = d.crystals.length;
      force(x => x + 1);
    }
    for (const cr of d.crystals) {
      const g = refs.current.get(cr.id);
      if (!g) continue;
      g.position.copy(cr.position);
      g.position.y = 0.35 + Math.sin(t * 1.6 + cr.id) * 0.10;
      g.rotation.y = t * 0.8 + cr.id;
    }
  });
  const d = state.current;
  return (
    <>
      {d.crystals.map(cr => {
        // All XP gems render the same cool-green tone (Vampire Survivors style).
        // Reserved for future tier coloring once perks land.
        const color = '#7fffa8';
        return (
          <group
            key={cr.id}
            ref={el => {
              if (el) refs.current.set(cr.id, el);
              else refs.current.delete(cr.id);
            }}
          >
            <mesh castShadow>
              <octahedronGeometry args={[0.35, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} roughness={0.3} metalness={0.6} />
            </mesh>
            {/* inner halo — bright disc directly under the crystal */}
            <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.65, 22]} />
              <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            {/* outer halo — much wider, dim, so the crystal advertises its
                position from beyond the blockParty's direct reach */}
            <mesh position={[0, -0.29, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.6, 28]} />
              <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// A fixed pool of N PointLights that get assigned each frame to the N
// nearest visible crystals. Gives the cave a multi-source "stage-light"
// quality (like DJ Disco) without per-crystal lights — keeps GPU cost
// predictable. No shadows because mobile would choke.
function CrystalLights({ state }: { state: React.MutableRefObject<GameRef> }) {
  const POOL = 4;
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
      const c = entry.c;
      tmpVec.set(c.position.x, 0.5, c.position.z);
      light.position.copy(tmpVec);
      light.color.set('#7fffa8');     // XP gem green
      // Fade with distance² so distant crystals contribute less while
      // still being visually anchored when nearby.
      const distFalloff = Math.max(0.2, 1 - entry.d2 / 200);
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

// Pool of PointLights that track the nearest streetlamp pillars (variant
// 'spike'). Each frame we sort the lamps by distance² to the player and
// assign the top N to the pool, fading intensity with distance so the
// shadows roll on as the player approaches. Same pattern as CrystalLights
// — single allocation, no per-lamp light spamming.
function StreetlampLights({ state }: { state: React.MutableRefObject<GameRef> }) {
  const POOL = 4;
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const d = state.current;
    const lamps = d.pillars.filter(p => p.variant === 'spike');
    if (lamps.length === 0) {
      for (const l of refs.current) if (l) l.intensity = 0;
      return;
    }
    // Sort by squared distance to the player.
    const sorted = lamps
      .map(p => ({
        p,
        d2: (p.position.x - d.pos.x) ** 2 + (p.position.z - d.pos.z) ** 2,
      }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, POOL);
    for (let i = 0; i < POOL; i++) {
      const light = refs.current[i];
      if (!light) continue;
      const entry = sorted[i];
      if (!entry) { light.intensity = 0; continue; }
      // Streetlamp head sits ~3.25u up; light should fall just below it.
      tmpVec.set(entry.p.position.x, 3.1 * entry.p.scale, entry.p.position.z);
      light.position.copy(tmpVec);
      const falloff = Math.max(0.2, 1 - entry.d2 / 360);
      light.intensity = 18 * falloff;
      light.distance = 9 * entry.p.scale;
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

// Street props. Three variants — the pillar variant tag stays so the game
// loop's collision shape (spike/dome/cluster) keeps the same footprint, but
// the renderer now shows a streetlamp / parked sedan / dumpster instead of
// stalactites. The result reads as a city block littered with the cover
// you'd expect at night.
//
// variant -> prop:
//   spike   = streetlamp (tall thin pole + lamp head + amber glow)
//   dome    = parked sedan (low boxy body — uses the dome collision radius)
//   cluster = dumpster (chunky box with a slanted lid)
function Pillars({ state }: { state: React.MutableRefObject<GameRef> }) {
  const d = state.current;
  return (
    <>
      {d.pillars.map(p => (
        <group key={p.id} position={[p.position.x, 0, p.position.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
          {p.variant === 'spike' && (
            <>
              {/* Streetlamp — slim pole + bracket + lamp head with a warm
                  amber emissive (faint cone of light implied by the glow). */}
              <mesh position={[0, 1.6, 0]} castShadow>
                <cylinderGeometry args={[0.06, 0.08, 3.2, 8]} />
                <meshStandardMaterial color="#2a2a32" roughness={0.85} />
              </mesh>
              <mesh position={[0, 3.25, 0.18]} castShadow>
                <boxGeometry args={[0.30, 0.12, 0.42]} />
                <meshStandardMaterial color="#1c1c24" roughness={0.85} />
              </mesh>
              <mesh position={[0, 3.18, 0.20]}>
                <boxGeometry args={[0.22, 0.10, 0.34]} />
                <meshStandardMaterial color="#ffd28a" emissive="#ffb050" emissiveIntensity={2.2} />
              </mesh>
              {/* Concrete pad at the base — matches the cave footprint so
                  the existing collision (≈0.70 base * scale) still feels
                  right. */}
              <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.55, 0.70, 0.10, 12]} />
                <meshStandardMaterial color="#22232a" roughness={1} />
              </mesh>
            </>
          )}
          {p.variant === 'dome' && (
            <>
              {/* Parked sedan — chunky boxy body + lower greenhouse cabin.
                  Footprint ~1.15 base matches the original dome radius. */}
              <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.40, 0.55, 2.20]} />
                <meshStandardMaterial color="#2a2a36" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.85, -0.10]} castShadow>
                <boxGeometry args={[1.20, 0.50, 1.40]} />
                <meshStandardMaterial color="#1c1c26" roughness={0.6} />
              </mesh>
              {/* Windshield + side windows (cyan tint) */}
              <mesh position={[0, 0.95, 0.50]}>
                <boxGeometry args={[1.05, 0.34, 0.05]} />
                <meshStandardMaterial color="#3a4a64" roughness={0.3} metalness={0.4} />
              </mesh>
              <mesh position={[0, 0.95, -0.80]}>
                <boxGeometry args={[1.05, 0.34, 0.05]} />
                <meshStandardMaterial color="#3a4a64" roughness={0.3} metalness={0.4} />
              </mesh>
              {/* Headlights — small amber boxes on the front face */}
              <mesh position={[-0.50, 0.42, 1.12]}>
                <boxGeometry args={[0.20, 0.14, 0.08]} />
                <meshStandardMaterial color="#fff0c0" emissive="#ffd060" emissiveIntensity={1.6} />
              </mesh>
              <mesh position={[ 0.50, 0.42, 1.12]}>
                <boxGeometry args={[0.20, 0.14, 0.08]} />
                <meshStandardMaterial color="#fff0c0" emissive="#ffd060" emissiveIntensity={1.6} />
              </mesh>
              {/* Wheels — flat cylinders on their sides */}
              {[
                [-0.66, 0.20,  0.72],
                [ 0.66, 0.20,  0.72],
                [-0.66, 0.20, -0.72],
                [ 0.66, 0.20, -0.72],
              ].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.22, 0.22, 0.18, 12]} />
                  <meshStandardMaterial color="#0c0c12" roughness={0.95} />
                </mesh>
              ))}
            </>
          )}
          {p.variant === 'cluster' && (
            <>
              {/* Dumpster — rectangular green box with a slanted lid + small
                  vertical ribs for a thumbnail-readable industrial bin. */}
              <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.40, 1.10, 0.90]} />
                <meshStandardMaterial color="#284038" roughness={0.85} />
              </mesh>
              {/* Slanted lid — wedge sitting on top */}
              <mesh position={[0, 1.20, -0.06]} rotation={[-0.18, 0, 0]} castShadow>
                <boxGeometry args={[1.46, 0.10, 1.04]} />
                <meshStandardMaterial color="#1a2a24" roughness={0.85} />
              </mesh>
              {/* Vertical ribs on the front */}
              {[-0.5, -0.16, 0.18, 0.52].map((rx, i) => (
                <mesh key={i} position={[rx, 0.55, 0.46]}>
                  <boxGeometry args={[0.06, 1.0, 0.06]} />
                  <meshStandardMaterial color="#1a2a24" roughness={0.85} />
                </mesh>
              ))}
              {/* Two small caster wheels at the front edge */}
              <mesh position={[-0.55, 0.10,  0.46]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.10, 0.10, 0.12, 10]} />
                <meshStandardMaterial color="#0c0c12" roughness={0.95} />
              </mesh>
              <mesh position={[ 0.55, 0.10,  0.46]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.10, 0.10, 0.12, 10]} />
                <meshStandardMaterial color="#0c0c12" roughness={0.95} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </>
  );
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
    tier: ZombieTier;
  };
  const slots = useRef<Map<number, Slot>>(new Map());
  const rootRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
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
        const group = makeZombie(m.tier as ZombieTier);
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
        slot = { group, ring, ringMat, tier: m.tier as ZombieTier };
        slots.current.set(m.id, slot);
        root.add(group);
      }
      // Body position + facing.
      slot.group.position.copy(m.position);
      slot.group.rotation.y = m.rotation;

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
        const reach = striking ? slot.group.userData.armBase * (1 - (liveBite ? 1 : phase * 0.9)) : slot.group.userData.armBase;
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
// Auto-fired hero bullets. The game loop owns positions; this component just
// reflects them. We re-render the JSX list only when bullet COUNT changes
// (cheap because typical N is ~5–15); per-frame motion is imperative on the
// mesh refs.
function Bullets({ state }: { state: React.MutableRefObject<GameRef> }) {
  const [, force] = useState(0);
  const lastCount = useRef(0);
  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
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
      {d.bullets.map(b => (
        <mesh
          key={b.id}
          ref={(el) => {
            if (el) refs.current.set(b.id, el);
            else refs.current.delete(b.id);
          }}
        >
          <boxGeometry args={[0.10, 0.10, 0.50]} />
          <meshStandardMaterial
            color="#fff1b5"
            emissive="#ffae3a"
            emissiveIntensity={5.5}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

// Muzzle flash — a quick bright disc that appears in front of the player on
// every shot, fades out over MUZZLE_FLASH_DUR seconds. State drives opacity.
function MuzzleFlash({ state }: { state: React.MutableRefObject<GameRef> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const d = state.current;
    const t = d.muzzleFlashT;
    const alpha = t > 0 ? Math.min(1, t / 0.07) : 0;
    const px = d.pos.x + Math.sin(d.rot) * 0.95;
    const pz = d.pos.z + Math.cos(d.rot) * 0.95;
    if (meshRef.current) {
      meshRef.current.position.set(px, 1.0, pz);
      meshRef.current.scale.setScalar(0.55 + (1 - alpha) * 0.35);
    }
    if (matRef.current) matRef.current.opacity = alpha;
    if (lightRef.current) lightRef.current.intensity = 30 * alpha;
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
      <fog attach="fog" args={[palette.fog, 9, 46]} />
      <ambientLight intensity={0.14} color={palette.ambient} />
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, 0.16]} />
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
      <Player state={state} survivorId={props.survivor} />
      <Monsters state={state} />
      <Bullets state={state} />
      <MuzzleFlash state={state} />
    </>
  );
}
