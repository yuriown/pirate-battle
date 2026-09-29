import { useEffect, useRef, useState } from 'react';
import type { InputAction, InputController } from '@/game/input/InputController';
import { icon } from '../ui/icons';

interface TouchControlsProps {
  input: InputController;
  disabled: boolean;
}

/**
 * Hold-to-act buttons. Each button tracks its own pointers, so steering and firing work at the
 * same time with several fingers. Pointer capture keeps the press alive if the finger slides.
 */
export function TouchControls({ input, disabled }: TouchControlsProps) {
  return (
    // Two compact rows per cluster: narrow enough to sit in the letterbox gutters of a phone in
    // landscape, so the buttons do not cover the arena. Only shown on touch (coarse pointer) devices.
    <div className="touch-only pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 sm:p-5 short:p-2" data-testid="touch-controls">
      <Joystick input={input} disabled={disabled} />
      <div className="pointer-events-auto grid grid-cols-2 justify-items-center gap-2" role="group" aria-label="Cannons">
        <HoldButton input={input} action="fireFront" label="Fire front cannon" img={icon.fireFront} disabled={disabled} className="col-span-2" />
        <HoldButton input={input} action="fireLeft" label="Fire port broadside" img={icon.fireLeft} disabled={disabled} />
        <HoldButton input={input} action="fireRight" label="Fire starboard broadside" img={icon.fireRight} disabled={disabled} />
      </div>
    </div>
  );
}

/** Fraction of the stick's travel below which it does nothing, and above which the ship sails. */
const DEAD_ZONE = 0.2;
const THROTTLE_ZONE = 0.35;

/**
 * Virtual analog stick: point the thumb where the ship should go. The ship turns towards that
 * direction at its normal turn rate and sails forward while the stick is pushed, so steering and
 * moving are one gesture. Screen and arena share axes (the camera never rotates).
 */
function Joystick({ input, disabled }: { input: InputController; disabled: boolean }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, angle: -Math.PI / 2, active: false });

  const release = () => {
    pointerRef.current = null;
    input.releaseStick();
    setKnob((k) => ({ ...k, x: 0, y: 0, active: false }));
  };

  // Pausing (or ending) the match drops the stick, like every other held input.
  useEffect(() => {
    if (disabled) release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => input.releaseStick(), []);

  const update = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const travel = r.width * 0.32;
    const magnitude = Math.min(1, Math.hypot(dx, dy) / travel);
    const angle = Math.atan2(dy, dx);
    setKnob({ x: Math.cos(angle) * magnitude * travel, y: Math.sin(angle) * magnitude * travel, angle, active: true });
    if (magnitude < DEAD_ZONE) input.releaseStick();
    else input.setStick(angle, magnitude >= THROTTLE_ZONE);
  };

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto relative h-[120px] w-[120px] shrink-0 touch-none select-none rounded-full short:h-[104px] short:w-[104px]"
      style={{ background: `center / contain no-repeat url(${icon.roundNormal})`, opacity: disabled ? 0.45 : 0.9 }}
      role="group"
      aria-label="Steering joystick: drag towards where the ship should sail"
      data-testid="joystick"
      onPointerDown={(e) => {
        if (disabled) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture only keeps the drag alive outside the base; the stick works without it.
        }
        pointerRef.current = e.pointerId;
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerRef.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => pointerRef.current === e.pointerId && release()}
      onPointerCancel={(e) => pointerRef.current === e.pointerId && release()}
      onLostPointerCapture={(e) => pointerRef.current === e.pointerId && release()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          background: `center / contain no-repeat url(${knob.active ? icon.roundPressed : icon.roundHover})`,
        }}
      >
        {/* The arrow points where the ship is being steered (icon art points up, i.e. -PI/2). */}
        <img src={icon.forward} alt="" className="h-7 w-7" style={{ transform: `rotate(${knob.angle + Math.PI / 2}rad)` }} />
      </div>
    </div>
  );
}

interface HoldButtonProps {
  input: InputController;
  action: InputAction;
  label: string;
  img: string;
  disabled: boolean;
  className?: string;
}

function HoldButton({ input, action, label, img, disabled, className = '' }: HoldButtonProps) {
  const [pressed, setPressed] = useState(false);
  const release = (e: React.PointerEvent) => {
    input.releaseTouch(action, e.pointerId);
    setPressed(false);
  };
  return (
    <button
      type="button"
      className={`pb-round-btn pb-round-btn--lg ${className}`}
      aria-label={label}
      data-pressed={pressed}
      data-action={action}
      disabled={disabled}
      tabIndex={-1}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety (finger sliding off); the press itself must still register.
        }
        input.pressTouch(action, e.pointerId);
        setPressed(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={img} alt="" />
    </button>
  );
}
