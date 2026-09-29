const base = `${import.meta.env.BASE_URL}assets/ui/2x`;

export const icon = {
  close: `${base}/controls/icon_close.png`,
  fireFront: `${base}/controls/icon_fire_front.png`,
  fireLeft: `${base}/controls/icon_fire_left.png`,
  fireRight: `${base}/controls/icon_fire_right.png`,
  forward: `${base}/controls/icon_forward.png`,
  home: `${base}/controls/icon_home.png`,
  minus: `${base}/controls/icon_minus.png`,
  pause: `${base}/controls/icon_pause.png`,
  play: `${base}/controls/icon_play.png`,
  plus: `${base}/controls/icon_plus.png`,
  restart: `${base}/controls/icon_restart.png`,
  settings: `${base}/controls/icon_settings.png`,
  turnLeft: `${base}/controls/icon_turn_left.png`,
  turnRight: `${base}/controls/icon_turn_right.png`,
  heart: `${base}/hud/icon_heart.png`,
  score: `${base}/hud/icon_score.png`,
  time: `${base}/hud/icon_time.png`,
  title: `${base}/menu/title_pirate_battle.png`,
  logo: `${import.meta.env.BASE_URL}assets/logo_jungle_gaming.svg`,
} as const;

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
