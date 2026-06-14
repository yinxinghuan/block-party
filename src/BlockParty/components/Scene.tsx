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

interface SceneProps {
  state: React.MutableRefObject<GameRef>;
  playing: boolean;
  level: number;            // drives per-level palette
  stickRef: React.MutableRefObject<Stick>;
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

// Player explorer + blockParty. Two pieces: a chunky humanoid body and a
// glowing blockParty hanging in front. The blockParty carries the real SpotLight
// that illuminates the floor + nearby crystals + monsters.
// Base values for the blockParty's omnidirectional glow. The "breath" function
// in useFrame modulates both intensity and distance around these.
const LANTERN_BASE_INTENSITY = 170;     // PointLight intensity units (decay=2)
const LANTERN_BASE_DISTANCE  = 30;      // world units of reach

function Player({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRef = useRef<THREE.Group>(null);
  // Inner group that does the hop — contact shadow stays outside it so the
  // shadow stays on the floor while the body lifts off (penguin-rescue
  // pattern, more lively than a subtle chest-breathe).
  const bounceRef = useRef<THREE.Group>(null);
  const blockPartyMat = useRef<THREE.MeshStandardMaterial>(null);
  const blockPartyLightRef = useRef<THREE.PointLight>(null);
  // Three-layer flame inside the blockParty. Each is a small teardrop cone
  // that jitters scale + rotation at its own frequency for a "live flame"
  // dance. Additive blending so they read as light rather than solid.
  const flameInnerRef = useRef<THREE.Mesh>(null);
  const flameMidRef = useRef<THREE.Mesh>(null);
  const flameOuterRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const d = state.current;
    if (!groupRef.current) return;
    groupRef.current.position.copy(d.pos);
    groupRef.current.rotation.y = d.rot;
    const t = clock.getElapsedTime();

    // Constant hop — idle still bounces visibly (player is alive!), walking
    // bounces a touch higher. abs(sin) gives a "land–crouch–leap" feel
    // rather than a sine breath. Frequency matches penguin-rescue's leader.
    const moveFactor = Math.min(1, d.speed / PLAYER_SPEED);
    const hopT = t * (5.5 + moveFactor * 1.5);
    const hopHeight = 0.20 + moveFactor * 0.14;
    if (bounceRef.current) {
      bounceRef.current.position.y = Math.abs(Math.sin(hopT)) * hopHeight;
      // Subtle side-lean synced to the hop; stronger when walking.
      bounceRef.current.rotation.z = Math.sin(hopT) * (0.06 + moveFactor * 0.06);
      // Tiny forward pitch so the leap feels intentional, not vertical.
      bounceRef.current.rotation.x = Math.abs(Math.sin(hopT)) * 0.08 * moveFactor;
    }
    // Two-band flicker — wider amplitude than before so the breath reads
    // clearly. Range approximately [0.65, 1.35] on the slow band.
    //   • slow sinusoid (~5.5s period) → the blockParty's "breath"
    //   • fast jitter   (~7-11Hz)      → flame restlessness
    const slow = Math.sin(t * 1.14) * 0.32;
    const fast = (Math.sin(t * 7.0) + Math.sin(t * 11.3) * 0.4) * 0.08;
    const breath = 1.0 + slow + fast;
    if (blockPartyLightRef.current) {
      blockPartyLightRef.current.intensity = LANTERN_BASE_INTENSITY * breath;
      // Distance breathes much more visibly now — range from ~0.62×D when
      // the flame ducks to ~1.22×D when it flares.
      blockPartyLightRef.current.distance  = LANTERN_BASE_DISTANCE  * (0.92 + slow * 0.95);
    }
    if (blockPartyMat.current) {
      blockPartyMat.current.emissiveIntensity = 3.2 * breath;
    }

    // Flame jitter — three layers, each its own waveform. The result reads
    // as a flickering candle/torch inside the blockParty cage rather than a
    // dead glow sphere. Scales squish vertically + sway slightly.
    const flickerA = 0.85 + Math.sin(t * 19) * 0.18 + Math.sin(t * 31.7) * 0.07;
    const flickerB = 0.85 + Math.sin(t * 14.2 + 1.1) * 0.20 + Math.sin(t * 27.0) * 0.08;
    const flickerC = 0.85 + Math.sin(t * 11.3 + 2.4) * 0.18;
    const sway     = Math.sin(t * 8.5) * 0.08 + Math.sin(t * 13.1) * 0.04;
    if (flameInnerRef.current) {
      flameInnerRef.current.scale.set(flickerA * 0.9, flickerA * 1.25, flickerA * 0.9);
      flameInnerRef.current.rotation.z = sway * 0.6;
    }
    if (flameMidRef.current) {
      flameMidRef.current.scale.set(flickerB * 0.95, flickerB * 1.30, flickerB * 0.95);
      flameMidRef.current.rotation.z = sway;
    }
    if (flameOuterRef.current) {
      flameOuterRef.current.scale.set(flickerC, flickerC * 1.35, flickerC);
      flameOuterRef.current.rotation.z = sway * 1.4;
    }
  });
  return (
    <group ref={groupRef}>
      {/* Contact shadow — NOT bobbed, stays on the floor while the body
          hops above it. Sells the leap visually. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.32} />
      </mesh>
      {/* The blockParty's light source stays at the player's true position
          (no bounce) so monsters' fleeing logic — which checks distance
          from d.pos to monster — matches what the player visually sees. */}
      <pointLight
        ref={blockPartyLightRef}
        position={[0.08, 0.85, 0.55]}
        color="#ff9a3a"
        intensity={LANTERN_BASE_INTENSITY}
        distance={LANTERN_BASE_DISTANCE}
        decay={2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0008}
        shadow-normalBias={0.04}
        shadow-camera-near={0.3}
        shadow-camera-far={20}
      />
      {/* Hooded explorer — robe + pointed hood with a dark face void and
          two warm-glow eyes peering out. The hood + tapered robe give a
          clean silhouette from the top-down view. */}
      <group ref={bounceRef}>
        {/* Robe lower — tapered cylinder, wider at the ground so it reads
            as a flowing skirt rather than a box stack. */}
        <mesh position={[0, 0.40, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.55, 0.80, 12]} />
          <meshStandardMaterial color="#3a2820" roughness={0.95} />
        </mesh>
        {/* Robe upper — narrower torso section */}
        <mesh position={[0, 1.00, 0]} castShadow>
          <cylinderGeometry args={[0.30, 0.38, 0.40, 12]} />
          <meshStandardMaterial color="#4a3526" roughness={0.9} />
        </mesh>
        {/* Belt */}
        <mesh position={[0, 0.78, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.40, 0.045, 8, 18]} />
          <meshStandardMaterial color="#1a1006" roughness={0.95} />
        </mesh>
        {/* Belt pouch — small bulge on the left hip */}
        <mesh position={[-0.32, 0.72, 0.04]} castShadow>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color="#241408" roughness={0.95} />
        </mesh>
        {/* Shoulder cap — domed top of the robe so the silhouette flows
            smoothly into the hood, no hard step. */}
        <mesh position={[0, 1.22, 0]} castShadow>
          <sphereGeometry args={[0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.3]} />
          <meshStandardMaterial color="#3a2820" roughness={0.92} />
        </mesh>
        {/* Hood — pointed cone, slightly back-tilted */}
        <mesh position={[0, 1.50, -0.02]} rotation={[-0.12, 0, 0]} castShadow>
          <coneGeometry args={[0.27, 0.56, 12]} />
          <meshStandardMaterial color="#241612" roughness={0.95} />
        </mesh>
        {/* Hood opening — dark void where the face would be */}
        <mesh position={[0, 1.40, 0.17]} rotation={[0.32, 0, 0]}>
          <circleGeometry args={[0.15, 16]} />
          <meshBasicMaterial color="#050304" />
        </mesh>
        {/* Glowing eyes — warm orange points peering from the hood,
            mirroring the blockParty color so they read as the SAME light. */}
        <mesh position={[-0.055, 1.43, 0.205]}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshStandardMaterial color="#ffd28a" emissive="#ffa040" emissiveIntensity={2.6} />
        </mesh>
        <mesh position={[0.055, 1.43, 0.205]}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshStandardMaterial color="#ffd28a" emissive="#ffa040" emissiveIntensity={2.6} />
        </mesh>

        {/* BlockParty arm — thin stick angled forward + down */}
        <mesh position={[0.06, 1.02, 0.22]} rotation={[0.95, 0, -0.08]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.60, 8]} />
          <meshStandardMaterial color="#1a0e06" roughness={0.95} />
        </mesh>

        {/* BlockParty — proper hexagonal frame with cap, base, hanging ring,
            and a glowing inner core. Reads as a real prop, not a box. */}
        <group position={[0.08, 0.85, 0.55]}>
          {/* Hanging ring above everything */}
          <mesh position={[0, 0.40, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.025, 0.008, 5, 10]} />
            <meshStandardMaterial color="#1a1006" roughness={0.85} />
          </mesh>
          {/* Tiny chimney ring — replaces the old wide cap. Doesn't block
              the flame from rising out the top of the cage. */}
          <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.10, 0.018, 5, 14]} />
            <meshStandardMaterial color="#241408" roughness={0.95} />
          </mesh>
          {/* BlockParty cage — 6-sided open frame */}
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.30, 6, 1, true]} />
            <meshStandardMaterial color="#1a1006" roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
          {/* Inner glow core — a small emissive sphere that drives the
              blockParty's "breath" via blockPartyMat. */}
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial ref={blockPartyMat} color="#ffc070" emissive="#ff8a30" emissiveIntensity={3.2} />
          </mesh>
          {/* FLAME — three layered teardrops that rise FAR above the cage
              top (most of the height is above the chimney) so they read
              from the top-down camera. Base sits inside the cage. */}
          {/* Outermost flame wisp — biggest, dimmest, jitters most */}
          <mesh ref={flameOuterRef} position={[0, 0.26, 0]}>
            <coneGeometry args={[0.18, 0.66, 14]} />
            <meshBasicMaterial color="#ff9038" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {/* Middle flame layer */}
          <mesh ref={flameMidRef} position={[0, 0.22, 0]}>
            <coneGeometry args={[0.12, 0.52, 12]} />
            <meshBasicMaterial color="#ffc560" transparent opacity={0.80} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {/* Inner flame tongue — brightest, slim */}
          <mesh ref={flameInnerRef} position={[0, 0.18, 0]}>
            <coneGeometry args={[0.07, 0.38, 10]} />
            <meshBasicMaterial color="#fff2c0" transparent opacity={0.98} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {/* Bottom plate — hexagonal */}
          <mesh position={[0, -0.18, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.10, 0.04, 6]} />
            <meshStandardMaterial color="#241408" roughness={0.95} />
          </mesh>
        </group>

        {/* Feet — small, peeking from the robe hem */}
        <mesh position={[-0.13, 0.06, 0.02]} castShadow>
          <sphereGeometry args={[0.10, 10, 8]} />
          <meshStandardMaterial color="#1a0e08" roughness={0.95} />
        </mesh>
        <mesh position={[0.13, 0.06, 0.02]} castShadow>
          <sphereGeometry args={[0.10, 10, 8]} />
          <meshStandardMaterial color="#1a0e08" roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}

// Drifting glow specks — atmospheric extra borrowed from Piper's night
// preset. Cool blue-white so they read as cave-spirits against the warm
// blockParty. Each firefly is a tiny additive-blended sphere (round, glowy)
// rather than gl_POINT (which renders as a square sprite). Positions are
// world-space so they linger as the player moves through them.
function Fireflies() {
  const COUNT = 50;
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
      <sphereGeometry args={[0.06, 8, 6]} />
      <meshBasicMaterial color="#cfe2ff" transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
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

// Cave pillars / stalagmites. Three variants (spike / dome / cluster) so the
// arena reads as a varied cave rather than a forest of identical cones —
// gives the player landmarks to track their position between sweeps.
function Pillars({ state }: { state: React.MutableRefObject<GameRef> }) {
  const d = state.current;
  return (
    <>
      {d.pillars.map(p => (
        <group key={p.id} position={[p.position.x, 0, p.position.z]} rotation={[0, p.rot, 0]} scale={p.scale}>
          {p.variant === 'spike' && (
            <>
              <mesh position={[0, 1.0, 0]} castShadow>
                <coneGeometry args={[0.45, 2.4, 8]} />
                <meshStandardMaterial color="#3a322a" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.15, 0]} castShadow>
                <cylinderGeometry args={[0.55, 0.7, 0.30, 10]} />
                <meshStandardMaterial color="#2a221a" roughness={0.95} />
              </mesh>
            </>
          )}
          {p.variant === 'dome' && (
            <>
              <mesh position={[0, 0.55, 0]} castShadow>
                <sphereGeometry args={[0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#322a22" roughness={1} />
              </mesh>
              <mesh position={[0, 0.05, 0]} castShadow>
                <cylinderGeometry args={[1.05, 1.15, 0.10, 14]} />
                <meshStandardMaterial color="#241c14" roughness={1} />
              </mesh>
            </>
          )}
          {p.variant === 'cluster' && (
            <>
              <mesh position={[-0.30, 0.6, 0]} rotation={[0, 0, -0.18]} castShadow>
                <coneGeometry args={[0.32, 1.4, 7]} />
                <meshStandardMaterial color="#3a322a" roughness={0.95} />
              </mesh>
              <mesh position={[0.25, 0.85, 0.15]} rotation={[0, 0.4, 0.10]} castShadow>
                <coneGeometry args={[0.36, 1.9, 7]} />
                <meshStandardMaterial color="#3a322a" roughness={0.95} />
              </mesh>
              <mesh position={[0.10, 0.45, -0.30]} castShadow>
                <coneGeometry args={[0.28, 1.0, 7]} />
                <meshStandardMaterial color="#322a22" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.10, 0]} castShadow>
                <cylinderGeometry args={[0.85, 0.95, 0.18, 12]} />
                <meshStandardMaterial color="#241c14" roughness={1} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </>
  );
}

// Central altar / extinguished fire bowl — a fixed landmark at world origin.
// Players always know "here is home" by seeing it. Faint cyan ash glow
// reads as "the old fire, long cold" — narratively reinforces the blockParty
// the player carries being the only living flame.
function Altar() {
  const ashMat = useRef<THREE.MeshStandardMaterial>(null);
  const altarLightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.55 + Math.sin(t * 0.7) * 0.18;
    if (ashMat.current) ashMat.current.emissiveIntensity = pulse;
    // Faint cool-blue point light at the bowl — gives the altar its own
    // pool of illumination, breaks the single-warm-source monotony.
    if (altarLightRef.current) altarLightRef.current.intensity = 8 + pulse * 6;
  });
  return (
    <group position={[0, 0, 0]}>
      {/* stone ring base */}
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.35, 0.16, 24]} />
        <meshStandardMaterial color="#2a231b" roughness={1} />
      </mesh>
      {/* basin lip */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.05, 1.10, 0.24, 24]} />
        <meshStandardMaterial color="#2e261d" roughness={0.95} />
      </mesh>
      {/* hollow interior — torus to read as a bowl rim */}
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.95, 0.10, 8, 22]} />
        <meshStandardMaterial color="#1a140e" roughness={1} />
      </mesh>
      {/* cold ash — faint cyan emissive, subtle pulse */}
      <mesh position={[0, 0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.85, 24]} />
        <meshStandardMaterial ref={ashMat} color="#3a4e5a" emissive="#5e8aa8" emissiveIntensity={0.55} roughness={1} />
      </mesh>
      {/* point light embedded in the bowl — no shadow (perf) */}
      <pointLight
        ref={altarLightRef}
        position={[0, 0.55, 0]}
        color="#7eaee0"
        intensity={11}
        distance={7}
        decay={2}
      />
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
function Monsters({ state }: { state: React.MutableRefObject<GameRef> }) {
  const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
  const tendrilRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const tendrilMats = useRef<Map<number, THREE.MeshStandardMaterial>>(new Map());
  const tendrilTipRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const tendrilTipMats = useRef<Map<number, THREE.MeshBasicMaterial>>(new Map());
  const ringRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const ringMats = useRef<Map<number, THREE.MeshBasicMaterial>>(new Map());
  const eyeMats = useRef<Map<number, [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]>>(new Map());
  const [, force] = useState(0);
  const lastCount = useRef(-1);

  useFrame(({ clock }) => {
    const d = state.current;
    if (d.monsters.length !== lastCount.current) {
      lastCount.current = d.monsters.length;
      force(x => x + 1);
    }
    const t = clock.getElapsedTime();
    // Strike timings are per-level — read them off the current night's tuning
    // each frame so visuals match the loop's hit window exactly.
    const tuning = getLevelTuning(d.level);
    const STRIKE_TELEGRAPH = tuning.strikeTelegraph;
    const STRIKE_RANGE_MAX = tuning.strikeRangeMax;
    for (const m of d.monsters) {
      const g = groupRefs.current.get(m.id);
      if (g) {
        g.position.copy(m.position);
        g.rotation.y = m.rotation;
        // bob slightly while lurking
        g.position.y = Math.abs(Math.sin(t * 2 + m.id)) * 0.12;
      }
      const striking = m.state === 'striking';
      const phase = striking ? m.strikeT / STRIKE_TELEGRAPH : 0;
      const live = striking && m.strikeT >= STRIKE_TELEGRAPH;

      // Tendril — a tapered cone lying horizontally along the strike
      // direction (monster-local +Z, since the monster faces the player
      // and rotation is frozen during the strike). The cone tapers from
      // a wide base at the monster to a narrow tip at the strike target —
      // direction is unambiguous, like an arrow. Bright red tip ball
      // marks "the bit that grabs you".
      const tendril = tendrilRefs.current.get(m.id);
      const tMat = tendrilMats.current.get(m.id);
      const tip = tendrilTipRefs.current.get(m.id);
      const tipMat = tendrilTipMats.current.get(m.id);
      if (tendril && tMat) {
        tendril.visible = striking;
        if (striking) {
          const reach = live
            ? STRIKE_RANGE_MAX
            : Math.min(1, phase) * STRIKE_RANGE_MAX;
          // Place the cone in monster-local space: midpoint along +Z,
          // tilted so its long axis runs along +Z, scaled by reach.
          tendril.position.set(0, 0.65, reach * 0.5);
          tendril.rotation.set(Math.PI / 2, 0, 0);
          tendril.scale.set(0.30, reach, 0.30);
          tMat.emissiveIntensity = live ? 4.5 : 1.4 + phase * 2.6;
        }
      }
      if (tip && tipMat) {
        tip.visible = striking;
        if (striking) {
          const reach = live
            ? STRIKE_RANGE_MAX
            : Math.min(1, phase) * STRIKE_RANGE_MAX;
          tip.position.set(0, 0.65, reach);
          const tipPulse = 1 + Math.sin(t * 16) * 0.25;
          tip.scale.setScalar(tipPulse);
          tipMat.opacity = live ? 1.0 : 0.55 + phase * 0.45;
        }
      }

      // Strike-warning floor ring at monster feet. Pulses scale + opacity
      // through the telegraph so the player has a clear "DON'T BE THERE"
      // indicator even at the edge of their blockParty reach.
      const ring = ringRefs.current.get(m.id);
      const rMat = ringMats.current.get(m.id);
      if (ring && rMat) {
        ring.visible = striking;
        if (striking) {
          // Pulse: 1.6 Hz oscillation on size + opacity
          const pulse = 0.8 + Math.sin(t * 12) * 0.20;
          const baseScale = 1.0 + phase * 0.9;          // grows as windup builds
          ring.scale.set(baseScale * pulse, 1, baseScale * pulse);
          rMat.opacity = live ? 0.95 : 0.50 + phase * 0.40;
        }
      }

      // Eye color flip per tier. Lurkers: yellow→red on strike. Stalkers:
      // always blue-violet (immune to light, but smaller threat than boss).
      // Boss: always deep red with a slow ominous pulse.
      const eyes = eyeMats.current.get(m.id);
      if (eyes) {
        if (m.tier === 'boss') {
          eyes[0].emissive.setHex(0xff2030);
          eyes[1].emissive.setHex(0xff2030);
          const pulse = 1.8 + Math.sin(t * 4.5) * 0.6;
          eyes[0].emissiveIntensity = pulse;
          eyes[1].emissiveIntensity = pulse;
        } else if (m.tier === 'stalker') {
          // Constantly glowing cool violet — the visual "warning" that
          // this one doesn't fear your light.
          eyes[0].emissive.setHex(striking ? 0xff4090 : 0x8060ff);
          eyes[1].emissive.setHex(striking ? 0xff4090 : 0x8060ff);
          const pulse = 1.5 + Math.sin(t * 5.5) * 0.5;
          eyes[0].emissiveIntensity = pulse;
          eyes[1].emissiveIntensity = pulse;
        } else if (striking) {
          eyes[0].emissive.setHex(0xff2828);
          eyes[1].emissive.setHex(0xff2828);
          const pulse = 1.6 + Math.sin(t * 12) * 0.7;
          eyes[0].emissiveIntensity = pulse;
          eyes[1].emissiveIntensity = pulse;
        } else {
          eyes[0].emissive.setHex(0xffa820);
          eyes[1].emissive.setHex(0xffa820);
          eyes[0].emissiveIntensity = 1.4;
          eyes[1].emissiveIntensity = 1.4;
        }
      }
    }
  });

  const d = state.current;
  return (
    <>
      {d.monsters.map(m => {
        const bodyColor =
          m.tier === 'boss' ? '#100618' :
          m.tier === 'stalker' ? '#160a22' :
          '#0a0810';
        const scale =
          m.tier === 'boss' ? 1.65 :
          m.tier === 'stalker' ? 1.10 :
          1.0;
        return (
        <group
          key={m.id}
          scale={scale}
          ref={el => {
            if (el) groupRefs.current.set(m.id, el);
            else groupRefs.current.delete(m.id);
          }}
        >
          {/* main body — twisted dark hood. Stalker = deep violet-black,
              boss = deeper purple-black, lurker = plain dark. */}
          <mesh position={[0, 0.85, 0]} castShadow>
            <coneGeometry args={[0.55, 1.5, 8]} />
            <meshStandardMaterial color={bodyColor} roughness={0.95} />
          </mesh>
          {/* Boss crown — glowing red horned ring above the hood */}
          {m.tier === 'boss' && (
            <>
              <mesh position={[0, 1.78, 0]}>
                <torusGeometry args={[0.34, 0.05, 6, 18]} />
                <meshStandardMaterial color="#2a0610" emissive="#ff2030" emissiveIntensity={2.2} />
              </mesh>
              <mesh position={[-0.22, 1.95, 0]} rotation={[0, 0, -0.3]}>
                <coneGeometry args={[0.07, 0.30, 6]} />
                <meshStandardMaterial color="#1a040a" emissive="#ff2030" emissiveIntensity={1.4} />
              </mesh>
              <mesh position={[0.22, 1.95, 0]} rotation={[0, 0, 0.3]}>
                <coneGeometry args={[0.07, 0.30, 6]} />
                <meshStandardMaterial color="#1a040a" emissive="#ff2030" emissiveIntensity={1.4} />
              </mesh>
            </>
          )}
          {/* Stalker mark — a small floating violet rune above the hood
              ring so the player can tell it apart from a lurker at a
              glance, even before the eyes are visible. */}
          {m.tier === 'stalker' && (
            <mesh position={[0, 1.78, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.18, 0.025, 5, 14]} />
              <meshStandardMaterial color="#3a1b48" emissive="#a060ff" emissiveIntensity={1.8} />
            </mesh>
          )}
          {/* hood ring */}
          <mesh position={[0, 1.55, 0]}>
            <torusGeometry args={[0.28, 0.06, 6, 14]} />
            <meshStandardMaterial color="#1a1422" roughness={0.85} />
          </mesh>
          {/* glowing eyes (emissive updated per-frame so they can turn red) */}
          <mesh
            position={[-0.12, 1.25, 0.40]}
            ref={el => {
              if (!el) { eyeMats.current.delete(m.id); return; }
              const prev = eyeMats.current.get(m.id);
              const left = el.material as THREE.MeshStandardMaterial;
              eyeMats.current.set(m.id, [left, prev ? prev[1] : (left)]);
            }}
          >
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#ffdc4a" emissive="#ffa820" emissiveIntensity={1.4} />
          </mesh>
          <mesh
            position={[0.12, 1.25, 0.40]}
            ref={el => {
              if (!el) return;
              const prev = eyeMats.current.get(m.id);
              const right = el.material as THREE.MeshStandardMaterial;
              eyeMats.current.set(m.id, [prev ? prev[0] : right, right]);
            }}
          >
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color="#ffdc4a" emissive="#ffa820" emissiveIntensity={1.4} />
          </mesh>
          {/* contact shadow */}
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.6, 18]} />
            <meshBasicMaterial color="#000" transparent opacity={0.55} />
          </mesh>
          {/* Strike-warning floor ring — flat on the ground, only shown
              while striking, scales/pulses through the telegraph window. */}
          <mesh
            position={[0, 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
            ref={el => {
              if (!el) { ringRefs.current.delete(m.id); ringMats.current.delete(m.id); return; }
              ringRefs.current.set(m.id, el);
              ringMats.current.set(m.id, el.material as THREE.MeshBasicMaterial);
            }}
          >
            <ringGeometry args={[0.95, 1.15, 32]} />
            <meshBasicMaterial color="#ff3838" transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
          </mesh>
          {/* dark-hand tendril — tapered cone laid horizontally along the
              monster's local +Z (= strike direction). Wide at the monster
              (base) → narrow at the strike target (tip), so direction is
              read-instantly. */}
          <mesh
            ref={el => {
              if (el) {
                tendrilRefs.current.set(m.id, el);
                tendrilMats.current.set(m.id, el.material as THREE.MeshStandardMaterial);
              } else {
                tendrilRefs.current.delete(m.id);
                tendrilMats.current.delete(m.id);
              }
            }}
            visible={false}
          >
            {/* base radius wide (1.0), tip radius narrow via the geometry's
                second arg... wait, ConeGeometry doesn't taper to a custom tip.
                Use CylinderGeometry with different top/bottom radii instead. */}
            <cylinderGeometry args={[0.15, 1.0, 1, 10]} />
            <meshStandardMaterial color="#1a0008" emissive="#ff3838" emissiveIntensity={1.4} transparent opacity={0.92} />
          </mesh>
          {/* Bright-red glowing claw tip at the strike's landing point —
              the player should look at THIS dot, not the body, to dodge. */}
          <mesh
            ref={el => {
              if (el) {
                tendrilTipRefs.current.set(m.id, el);
                tendrilTipMats.current.set(m.id, el.material as THREE.MeshBasicMaterial);
              } else {
                tendrilTipRefs.current.delete(m.id);
                tendrilTipMats.current.delete(m.id);
              }
            }}
            visible={false}
          >
            <sphereGeometry args={[0.22, 14, 10]} />
            <meshBasicMaterial color="#ff6060" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
        );
      })}
    </>
  );
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
      {/* Per-level palette: each level recolors the cave to give descent
          a visual narrative — warm surface → wet pools → amber vault →
          purple abyss. Driven by the `level` prop. */}
      <fog attach="fog" args={[palette.fog, 14, 58]} />
      <ambientLight intensity={0.38} color={palette.ambient} />
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, 0.32]} />
      <Fireflies />
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
      <Player state={state} />
      <Monsters state={state} />
      <Bullets state={state} />
      <MuzzleFlash state={state} />
    </>
  );
}
