import { useState } from 'react';
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 sm:p-5" data-testid="touch-controls">
      <div className="pointer-events-auto grid grid-cols-3 items-end gap-2" role="group" aria-label="Steering">
        <HoldButton input={input} action="turnLeft" label="Turn left" img={icon.turnLeft} disabled={disabled} />
        <HoldButton input={input} action="forward" label="Sail forward" img={icon.forward} disabled={disabled} className="-translate-y-8" />
        <HoldButton input={input} action="turnRight" label="Turn right" img={icon.turnRight} disabled={disabled} />
      </div>
      <div className="pointer-events-auto grid grid-cols-3 items-end gap-2" role="group" aria-label="Cannons">
        <HoldButton input={input} action="fireLeft" label="Fire port broadside" img={icon.fireLeft} disabled={disabled} />
        <HoldButton input={input} action="fireFront" label="Fire front cannon" img={icon.fireFront} disabled={disabled} className="-translate-y-8" />
        <HoldButton input={input} action="fireRight" label="Fire starboard broadside" img={icon.fireRight} disabled={disabled} />
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
