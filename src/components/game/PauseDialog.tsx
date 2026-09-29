import type { PauseReason } from '@/game/GameSession';
import { Dialog } from '../ui/Dialog';

const REASON_TEXT: Record<PauseReason, string> = {
  manual: 'Ready when you are.',
  blur: 'Paused because the game lost focus.',
  hidden: 'Paused while the tab was hidden.',
  orientation: 'Rotate your device to landscape, then resume.',
};

interface PauseDialogProps {
  reason: PauseReason;
  onResume: () => void;
  onRestart: () => void;
  onOptions: () => void;
  onMainMenu: () => void;
  canResume: boolean;
}

export function PauseDialog({ reason, onResume, onRestart, onOptions, onMainMenu, canResume }: PauseDialogProps) {
  return (
    <Dialog labelledBy="pause-title" describedBy="pause-desc" onEscape={canResume ? onResume : undefined}
      shortcuts={canResume ? { KeyP: onResume } : undefined} className="max-w-[420px] px-4 py-4 short:max-w-[560px] short:py-1" testId="pause-dialog">
      <div className="flex flex-col items-center gap-3 text-center short:gap-1.5">
        <h2 id="pause-title" className="pb-heading text-3xl short:text-xl">
          Paused
        </h2>
        <p id="pause-desc" className="text-sm font-bold text-amber-50/90">
          {REASON_TEXT[reason]}
        </p>
        <div className="mt-2 flex w-60 flex-col gap-3 short:mt-0 short:grid short:w-auto short:grid-cols-2 short:gap-2">
          <button type="button" className="pb-btn" onClick={onResume} disabled={!canResume}>
            Resume
          </button>
          <button type="button" className="pb-btn" onClick={onRestart}>
            Restart
          </button>
          <button type="button" className="pb-btn" onClick={onOptions}>
            Options
          </button>
          <button type="button" className="pb-btn" onClick={onMainMenu}>
            Main Menu
          </button>
        </div>
        <p className="text-xs text-amber-50/70">Leaving now abandons the match: it is not recorded.</p>
      </div>
    </Dialog>
  );
}
