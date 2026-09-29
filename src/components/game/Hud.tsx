import { useEffect, useRef, useState } from 'react';
import type { HudState } from '@/game/GameSession';
import { formatClock, icon } from '../ui/icons';

interface HudProps {
  hud: HudState;
  onPause: () => void;
}

/** DOM HUD over the canvas. Re-renders only when HudState changes (score, whole seconds, health). */
export function Hud({ hud, onPause }: HudProps) {
  const ratio = hud.maxHealth > 0 ? hud.health / hud.maxHealth : 0;
  const fill = ratio > 0.6 ? 'green' : ratio > 0.3 ? 'amber' : 'red';
  // health_frame fill_rect: x=30, w=196 of a 256 px wide sprite (atlas metadata).
  const visible = ((30 + 196 * ratio) / 256) * 100;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-4 short:p-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Hull">
          <span className="sr-only">Hull integrity</span>
          <img src={icon.heart} alt="" className="h-9 w-9 sm:h-11 sm:w-11 short:h-7 short:w-7" />
          <div className="relative h-[36px] w-[192px] sm:h-[48px] sm:w-[256px] short:h-[30px] short:w-[160px]">
            <img src={icon.healthFrame} alt="" className="absolute inset-0 h-full w-full" />
            <img
              src={icon.healthFill(fill)}
              alt=""
              className="absolute inset-0 h-full w-full"
              style={{ clipPath: `inset(0 ${100 - (ratio <= 0 ? 0 : visible)}% 0 0)` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-white [text-shadow:0_1px_2px_#000] sm:text-base short:text-xs" data-testid="hud-health">
              {hud.health} / {hud.maxHealth}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <p className="pb-counter m-0" data-testid="hud-score">
            <img src={icon.score} alt="" />
            <span className="sr-only">Score </span>
            <span>{hud.score}</span>
          </p>
          <p className="pb-counter m-0" data-testid="hud-time">
            <img src={icon.time} alt="" />
            <span className="sr-only">Time remaining </span>
            <span>{formatClock(hud.timeRemainingSec)}</span>
          </p>
          <button type="button" className="pb-round-btn pointer-events-auto" onClick={onPause} aria-label="Pause (Esc)" disabled={hud.status !== 'running'}>
            <img src={icon.pause} alt="" />
          </button>
        </div>
      </div>
      <p className="desktop-only pointer-events-none absolute inset-x-0 bottom-2 m-0 text-center text-xs font-bold text-amber-50/90 [text-shadow:0_1px_2px_#000]">
        W/↑ sail · A/D turn · Space front cannon · Q/E broadsides · Esc pause
      </p>
      <Announcer hud={hud} />
    </>
  );
}

/**
 * Screen-reader announcements for meaningful changes only (score, damage thresholds, pause,
 * time warnings, end) — never once per frame or per second.
 */
function Announcer({ hud }: { hud: HudState }) {
  const [message, setMessage] = useState('');
  const prev = useRef(hud);

  useEffect(() => {
    const p = prev.current;
    prev.current = hud;
    if (hud.matchIndex !== p.matchIndex) return setMessage('New match started.');
    if (hud.status !== p.status) {
      if (hud.status === 'paused') return setMessage('Game paused.');
      if (hud.status === 'running') return setMessage('Game resumed.');
      if (hud.status === 'ended') return setMessage(hud.endReason === 'destroyed' ? `Your ship was destroyed. Final score ${hud.score}.` : `Time is up. Final score ${hud.score}.`);
    }
    if (hud.score !== p.score) return setMessage(`Enemy sunk. Score ${hud.score}.`);
    const crossed = (t: number) => p.health / p.maxHealth > t && hud.health / hud.maxHealth <= t;
    if (crossed(0.3)) return setMessage(`Hull critical: ${hud.health} of ${hud.maxHealth}.`);
    if (crossed(0.6)) return setMessage(`Hull damaged: ${hud.health} of ${hud.maxHealth}.`);
    if ([30, 10].includes(hud.timeRemainingSec) && hud.timeRemainingSec !== p.timeRemainingSec) {
      return setMessage(`${hud.timeRemainingSec} seconds remaining.`);
    }
  }, [hud]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="game-announcer">
      {message}
    </div>
  );
}
