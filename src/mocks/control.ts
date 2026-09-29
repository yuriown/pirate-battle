// Runtime control of the mock server: dev panel, URL parameters and Playwright (window.__pbMock).
import type { MatchRecord } from '@/api/contracts';
import { setClientTimeout } from '@/api/client';
import { clearOutbox, getOutboxSnapshot, type OutboxEntry } from '@/net/pendingQueue';
import { clearDb, listRecords } from './db';
import { resetHandlerState } from './handlers';
import {
  applyUrlOverrides,
  getControl,
  isScenarioId,
  resetControl,
  setControl,
  subscribeControl,
  type MockControl,
} from './scenarios';

export interface PbMockApi {
  setScenario: (scenario: string) => MockControl;
  getControl: () => MockControl;
  setControl: (patch: Partial<MockControl>) => MockControl;
  reset: () => void;
  db: { list: () => MatchRecord[] };
  outbox: { list: () => readonly OutboxEntry[] };
}

declare global {
  interface Window {
    __pbMock?: PbMockApi;
  }
}

/** Back to a clean slate: no confirmed matches, nothing pending, default scenario. Identity is kept. */
export function resetMockState(): void {
  clearDb();
  clearOutbox();
  resetControl();
  resetHandlerState();
}

let installed = false;

export function installMockControl(): void {
  if (installed) return;
  installed = true;
  applyUrlOverrides(window.location.search);
  setClientTimeout(getControl().clientTimeoutMs);
  subscribeControl((control) => setClientTimeout(control.clientTimeoutMs));

  window.__pbMock = {
    setScenario: (scenario) => {
      if (!isScenarioId(scenario)) throw new Error(`Unknown scenario "${scenario}"`);
      return setControl({ scenario });
    },
    getControl,
    setControl,
    reset: resetMockState,
    db: { list: listRecords },
    outbox: { list: () => getOutboxSnapshot().entries },
  };
}
