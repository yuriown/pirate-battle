import React, { useEffect, useRef } from 'react';
import { GameConfig, GameSnapshot, EndReason } from '@/types/game.types';
import { PirateEngine } from '@/game/PirateEngine';

interface GameCanvasProps {
  config: GameConfig;
  onSnapshotUpdate: (snapshot: GameSnapshot) => void;
  onGameOver: (score: number, durationSeconds: number, reason: EndReason) => void;
  engineRef: React.MutableRefObject<PirateEngine | null>;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  config,
  onSnapshotUpdate,
  onGameOver,
  engineRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new PirateEngine(canvasRef.current, config, {
      onSnapshotUpdate,
      onGameOver,
    });

    engine.init(canvasRef.current).then(() => {
      engineRef.current = engine;
    });

    // Keyboard Listeners
    const keys = { forward: false, turnLeft: false, turnRight: false };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) keys.forward = true;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.turnLeft = true;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keys.turnRight = true;

      // Combat keys
      if (['Space', 'KeyJ'].includes(e.code)) {
        e.preventDefault();
        engine.playerFireFront();
      }
      if (e.code === 'KeyK') {
        engine.playerFireBroadside('LEFT');
      }
      if (e.code === 'KeyL') {
        engine.playerFireBroadside('RIGHT');
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        engine.togglePause();
      }

      engine.setInput(keys.forward, keys.turnLeft, keys.turnRight);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) keys.forward = false;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.turnLeft = false;
      if (['ArrowRight', 'KeyD'].includes(e.code)) keys.turnRight = false;

      engine.setInput(keys.forward, keys.turnLeft, keys.turnRight);
    };

    const handleBlur = () => {
      // Auto pause on tab blur
      engine.setPaused(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      engine.destroy();
      engineRef.current = null;
    };
  }, [config]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-ocean-900">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain max-w-[1920px] max-h-[1080px] shadow-2xl"
      />
    </div>
  );
};
