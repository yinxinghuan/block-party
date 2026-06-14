import { useEffect, useRef, useState } from 'react';
import type { Stick } from '../types';

const RADIUS = 60; // half of the visible ring (120px ring → 60px max stick)

export function useJoystick(enabled: boolean) {
  const stickRef = useRef<Stick>({ active: false, x: 0, y: 0 });
  // For rendering the visual ring, we expose a state too (low-frequency updates).
  const [view, setView] = useState({ active: false, ox: 0, oy: 0, x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) {
      // CRUCIAL: clear pointerId so a death that fires mid-drag doesn't keep
      // the captured pointer id alive. Without this, the next game's pointerdown
      // hits `if (pointerId.current !== null) return` and the joystick is dead.
      pointerId.current = null;
      stickRef.current.active = false;
      stickRef.current.x = 0;
      stickRef.current.y = 0;
      setView(v => ({ ...v, active: false }));
      return;
    }

    const onDown = (e: PointerEvent) => {
      if (pointerId.current !== null) return;
      pointerId.current = e.pointerId;
      origin.current = { x: e.clientX, y: e.clientY };
      stickRef.current.active = true;
      stickRef.current.x = 0;
      stickRef.current.y = 0;
      setView({ active: true, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
    };
    const onMove = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const clampLen = Math.min(len, RADIUS);
      const nx = len > 0 ? (dx / len) * clampLen : 0;
      const ny = len > 0 ? (dy / len) * clampLen : 0;
      const ux = nx / RADIUS;
      const uy = ny / RADIUS;
      // Camera is at (0, 35, 15) looking at origin → top-down with a slight forward tilt.
      // Screen-right ≈ world +x, screen-down ≈ world +z (toward camera). So pass-through.
      stickRef.current.x = ux;
      stickRef.current.y = uy;
      setView({ active: true, ox: origin.current.x, oy: origin.current.y, x: nx, y: ny });
    };
    const onUp = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;
      stickRef.current.active = false;
      stickRef.current.x = 0;
      stickRef.current.y = 0;
      setView(v => ({ ...v, active: false }));
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [enabled]);

  return { stickRef, view };
}
