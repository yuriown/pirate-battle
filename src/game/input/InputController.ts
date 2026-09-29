import { EMPTY_INPUT, type InputState } from '../sim/types';

// Held digital actions (keys and hold buttons); the joystick heading is set separately.
export type InputAction = Exclude<keyof InputState, 'steer'>;

const KEY_BINDINGS: Record<string, InputAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyJ: 'fireFront',
  KeyQ: 'fireLeft',
  KeyK: 'fireLeft',
  KeyE: 'fireRight',
  KeyL: 'fireRight',
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/**
 * Merges keyboard and touch into one held-state snapshot sampled by the simulation each step.
 * Keyboard listeners only exist while `attach()`ed (i.e. while the combat context is active),
 * so menus and forms keep their normal key handling.
 */
export class InputController {
  private keys = new Set<InputAction>();
  /** Presses since the last sample: a tap shorter than one simulation step still registers once. */
  private pulses = new Set<InputAction>();
  private touch = new Map<InputAction, Set<number>>();
  /** Touch joystick: desired heading and whether it is pushed far enough to sail forward. */
  private stick: { heading: number; throttle: boolean } | null = null;
  private target: Window | null = null;
  private onPause: (() => void) | null = null;
  private enabled = true;
  /** While true, Esc/P do nothing (e.g. a menu dialog is open over the paused match). */
  pauseKeysLocked = false;

  attach(target: Window, onPause: () => void): void {
    if (this.target) return;
    this.target = target;
    this.onPause = onPause;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target = null;
    this.onPause = null;
    this.clear();
  }

  /** While disabled (paused, ended) inputs are ignored and nothing is buffered. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.clear();
  }

  clear(): void {
    this.keys.clear();
    this.touch.clear();
    this.pulses.clear();
    this.stick = null;
  }

  setStick(heading: number, throttle: boolean): void {
    if (!this.enabled) return;
    this.stick = { heading, throttle };
  }

  releaseStick(): void {
    this.stick = null;
  }

  pressTouch(action: InputAction, pointerId: number): void {
    if (!this.enabled) return;
    let set = this.touch.get(action);
    if (!set) this.touch.set(action, (set = new Set()));
    set.add(pointerId);
    this.pulses.add(action);
  }

  releaseTouch(action: InputAction, pointerId: number): void {
    this.touch.get(action)?.delete(pointerId);
  }

  sample(): InputState {
    if (!this.enabled) return { ...EMPTY_INPUT };
    const held = (a: InputAction) => this.keys.has(a) || this.pulses.has(a) || (this.touch.get(a)?.size ?? 0) > 0;
    const state: InputState = {
      forward: held('forward') || (this.stick?.throttle ?? false),
      turnLeft: held('turnLeft'),
      turnRight: held('turnRight'),
      steer: this.stick?.heading ?? null,
      fireFront: held('fireFront'),
      fireLeft: held('fireLeft'),
      fireRight: held('fireRight'),
    };
    this.pulses.clear();
    return state;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (isEditable(e.target)) return;
    if (PAUSE_KEYS.has(e.code)) {
      if (!e.repeat && !this.pauseKeysLocked) this.onPause?.();
      e.preventDefault();
      return;
    }
    const action = KEY_BINDINGS[e.code];
    // When disabled (pause overlay open) Space/Enter must keep activating the focused button.
    if (!action || !this.enabled) return;
    e.preventDefault();
    // OS auto-repeat of a key held through a pause must not re-activate it after resuming.
    if (e.repeat && !this.keys.has(action)) return;
    this.keys.add(action);
    if (!e.repeat) this.pulses.add(action);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    if (action) this.keys.delete(action);
  };
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
