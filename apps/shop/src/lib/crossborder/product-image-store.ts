"use client"

import { createDemoStore } from "./local-store"

export type DemoImageSet = {
  cover?: string
  images: string[]
}

const store = createDemoStore<Record<string, DemoImageSet>>(
  "open-shop.console.demo.product-images.v1",
  {}
)

export function useProductImageSet(
  key: string,
  fallback?: DemoImageSet
): DemoImageSet {
  const all = store.useStore()
  return all[key] ?? fallback ?? { images: [] }
}

export function getProductImageSet(
  key: string,
  fallback?: DemoImageSet
): DemoImageSet {
  return store.get()[key] ?? fallback ?? { images: [] }
}

export function setProductImageSet(key: string, value: DemoImageSet) {
  store.set({ ...store.get(), [key]: value })
}

export function removeProductImageSet(key: string) {
  const current = { ...store.get() }
  delete current[key]
  store.set(current)
}
