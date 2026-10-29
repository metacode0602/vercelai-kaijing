'use client'

import * as React from 'react'

export function createDemoStore<T>(storageKey: string, initial: T) {
  let snapshot = initial
  let hydrated = false
  const listeners = new Set<() => void>()

  function readStorage(): T {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return initial
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  }

  function getSnapshot() {
    if (!hydrated && typeof window !== 'undefined') {
      snapshot = readStorage()
      hydrated = true
    }
    return snapshot
  }

  function getServerSnapshot() {
    return initial
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function set(next: T) {
    snapshot = next
    hydrated = true
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch (cause) {
        console.warn(`Failed to persist demo store ${storageKey}`, cause)
      }
    }
    for (const listener of listeners) listener()
  }

  function useStore() {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  }

  return { useStore, get: getSnapshot, set }
}
