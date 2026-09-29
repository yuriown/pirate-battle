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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new PirateEngine(containerRef.current, config, {
      onSnapshotUpdate,
      onGameOver,
    });

    engineRef.current = engine;
    engine.init().catch(err => {
      console.error('Failed to initialize PirateEngine:', err);
    });

    const handleResize = () => {
      engine.handleResize();
    };

    window.addEventListener('resize', handleResize);

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
      engine.setPaused(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      engine.destroy();
      engineRef.current = null;
    };
  }, [config]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative flex items-center justify-center overflow-hidden select-none bg-ocean-900"
      style={{ touchAction: 'none' }}
    />
  );
};
