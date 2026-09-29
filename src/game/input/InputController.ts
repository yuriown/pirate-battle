import { EMPTY_INPUT, type InputState } from '../sim/types';

export type InputAction = keyof InputState;

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

export const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/**
 * Merges keyboard and touch into one held-state snapshot sampled by the simulation each step.
 * Keyboard listeners only exist while `attach()`ed (i.e. while the combat context is active),
 * so menus and forms keep their normal key handling.
 */
export class InputController {
  private keys = new Set<InputAction>();
  private touch = new Map<InputAction, Set<number>>();
  private target: Window | null = null;
  private onPause: (() => void) | null = null;
  private enabled = true;

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
  }

  pressTouch(action: InputAction, pointerId: number): void {
    if (!this.enabled) return;
    let set = this.touch.get(action);
    if (!set) this.touch.set(action, (set = new Set()));
    set.add(pointerId);
  }

  releaseTouch(action: InputAction, pointerId: number): void {
    this.touch.get(action)?.delete(pointerId);
  }

  sample(): InputState {
    if (!this.enabled) return { ...EMPTY_INPUT };
    const held = (a: InputAction) => this.keys.has(a) || (this.touch.get(a)?.size ?? 0) > 0;
    return {
      forward: held('forward'),
      turnLeft: held('turnLeft'),
      turnRight: held('turnRight'),
      fireFront: held('fireFront'),
      fireLeft: held('fireLeft'),
      fireRight: held('fireRight'),
    };
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (isEditable(e.target)) return;
    if (PAUSE_KEYS.has(e.code)) {
      if (!e.repeat) this.onPause?.();
      e.preventDefault();
      return;
    }
    const action = KEY_BINDINGS[e.code];
    // When disabled (pause overlay open) Space/Enter must keep activating the focused button.
    if (!action || !this.enabled) return;
    e.preventDefault();
    this.keys.add(action);
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
