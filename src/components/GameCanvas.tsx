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
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';

      // Prevent scrolling on game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }

      // Movement
      if (['ArrowUp', 'KeyW'].includes(code) || key === 'w' || key === 'arrowup') keys.forward = true;
      if (['ArrowLeft', 'KeyA'].includes(code) || key === 'a' || key === 'arrowleft') keys.turnLeft = true;
      if (['ArrowRight', 'KeyD'].includes(code) || key === 'd' || key === 'arrowright') keys.turnRight = true;

      // Frontal Cannon (1x Ball) - Space, J, F, Enter
      if (['Space', 'KeyJ', 'KeyF', 'Enter'].includes(code) || key === ' ' || key === 'j' || key === 'f' || key === 'enter') {
        engine.playerFireFront();
      }

      // Broadside Left (Port 3x Salvo) - Q, K, Z
      if (['KeyQ', 'KeyK', 'KeyZ'].includes(code) || key === 'q' || key === 'k' || key === 'z') {
        engine.playerFireBroadside('LEFT');
      }

      // Broadside Right (Starboard 3x Salvo) - E, L, C, X
      if (['KeyE', 'KeyL', 'KeyC', 'KeyX'].includes(code) || key === 'e' || key === 'l' || key === 'c' || key === 'x') {
        engine.playerFireBroadside('RIGHT');
      }

      // Pause
      if (code === 'KeyP' || code === 'Escape' || key === 'p' || key === 'escape') {
        engine.togglePause();
      }

      engine.setInput(keys.forward, keys.turnLeft, keys.turnRight);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key ? e.key.toLowerCase() : '';

      if (['ArrowUp', 'KeyW'].includes(code) || key === 'w' || key === 'arrowup') keys.forward = false;
      if (['ArrowLeft', 'KeyA'].includes(code) || key === 'a' || key === 'arrowleft') keys.turnLeft = false;
      if (['ArrowRight', 'KeyD'].includes(code) || key === 'd' || key === 'arrowright') keys.turnRight = false;

      engine.setInput(keys.forward, keys.turnLeft, keys.turnRight);
    };

    const handleBlur = () => {
      engine.setPaused(true);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left click = Front shot
        engine.playerFireFront();
      } else if (e.button === 2) {
        // Right click = Broadside right
        e.preventDefault();
        engine.playerFireBroadside('RIGHT');
      } else if (e.button === 1) {
        // Middle click = Broadside left
        e.preventDefault();
        engine.playerFireBroadside('LEFT');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('contextmenu', handleContextMenu);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('contextmenu', handleContextMenu);
      }
      engine.destroy();
      engineRef.current = null;
    };
  }, [config]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative flex items-center justify-center overflow-hidden select-none bg-ocean-900 cursor-crosshair"
      style={{ touchAction: 'none' }}
    />
  );
};
