import { useSyncExternalStore } from 'react';
import { isRecord, readJson, writeJson } from '@/net/storage';
import { generateId } from '@/net/uuid';

export const PLAYER_KEY = 'pb.player.v1';

export interface Player {
  playerId: string;
  playerName: string;
}

// Every default name ('Captain ' + word) must pass validatePlayerName (at most 16 characters).
const NAME_WORDS = ['Barnacle', 'Kraken', 'Cutlass', 'Doubloon', 'Tempest', 'Anchor', 'Squall', 'Corsair', 'Gull', 'Reef'];
const NAME_PATTERN = /^[\p{L}\p{N} '-]{2,16}$/u;

function defaultName(playerId: string): string {
  let hash = 0;
  for (const ch of playerId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `Captain ${NAME_WORDS[hash % NAME_WORDS.length]}`;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Returns an error message, or null when the name is acceptable. */
export function validatePlayerName(name: string): string | null {
  const normalized = normalizeName(name);
  if (normalized.length < 2 || normalized.length > 16) return 'Name must be 2 to 16 characters long.';
  if (!NAME_PATTERN.test(normalized)) return "Use only letters, digits, spaces, apostrophes and hyphens.";
  return null;
}

function load(): Player {
  const stored = readJson(PLAYER_KEY);
  if (isRecord(stored) && typeof stored.playerId === 'string' && stored.playerId.length > 0) {
    const name = typeof stored.playerName === 'string' ? stored.playerName : '';
    return {
      playerId: stored.playerId,
      playerName: validatePlayerName(name) === null ? normalizeName(name) : defaultName(stored.playerId),
    };
  }
  const playerId = generateId();
  const player = { playerId, playerName: defaultName(playerId) };
  writeJson(PLAYER_KEY, player);
  return player;
}

let player: Player = load();
const listeners = new Set<() => void>();

export function getPlayer(): Player {
  return player;
}

export type SetNameResult = { ok: true; player: Player } | { ok: false; error: string };

export function setPlayerName(name: string): SetNameResult {
  const error = validatePlayerName(name);
  if (error) return { ok: false, error };
  player = { ...player, playerName: normalizeName(name) };
  writeJson(PLAYER_KEY, player);
  listeners.forEach((listener) => listener());
  return { ok: true, player };
}

export function subscribePlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlayer(): Player {
  return useSyncExternalStore(subscribePlayer, getPlayer, getPlayer);
}
