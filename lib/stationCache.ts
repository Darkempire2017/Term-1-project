'use client';

import { useSyncExternalStore } from 'react';
import type { MeResponse } from '@/lib/types';

type CachedUser = MeResponse['user'];
type StationCache = { me: MeResponse | null; user: CachedUser | null; generation: number };

const emptyCache: StationCache = { me: null, user: null, generation: 0 };
let cache: StationCache = emptyCache;
const listeners = new Set<() => void>();
let requestOrder = 0;
let lastAppliedOrder = 0;

type StationRequest = { generation: number; order: number };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: StationCache) {
  cache = next;
  listeners.forEach((listener) => listener());
}

// Kept in memory so navigation can show the last confirmed station state immediately.
// The server still validates every action, and each page rechecks /api/me in the background.
export function useStationCache() {
  return useSyncExternalStore(subscribe, () => cache, () => emptyCache);
}

export function beginStationRequest(): StationRequest {
  return { generation: cache.generation, order: ++requestOrder };
}

export function isCurrentStationRequest(request: StationRequest) {
  return cache.generation === request.generation && request.order >= lastAppliedOrder;
}

export function setStationResponse(me: MeResponse, request: StationRequest) {
  if (!isCurrentStationRequest(request)) return;
  lastAppliedOrder = request.order;
  publish({ ...cache, me, user: me.user });
}

export function seedStationUser(user: { index_no: string; username: string; email?: string }) {
  publish({
    me: null,
    user: { index_no: user.index_no, username: user.username, email: user.email || '' },
    generation: cache.generation + 1,
  });
}

export function restoreStationUser() {
  if (cache.user || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('astrix_user');
    if (!raw) return;
    const user = JSON.parse(raw);
    if (typeof user.index_no === 'string' && typeof user.username === 'string') {
      seedStationUser(user);
    }
  } catch {
    // A missing or invalid display cache never replaces the server session check.
  }
}

export function clearStationCache() {
  publish({ me: null, user: null, generation: cache.generation + 1 });
}
