'use client'

import { INITIAL_DICTIONARIES, type DictionaryCategory } from '@/lib/crossborder/platform-basics-data'
import { createDemoStore } from '@/lib/crossborder/local-store'

export type DictionaryState = {
  categories: DictionaryCategory[]
  inactiveValues: Record<string, string[]>
}

const store = createDemoStore<DictionaryState>('open-shop.console.demo.dictionaries.v2', {
  categories: INITIAL_DICTIONARIES,
  inactiveValues: {},
})

export function useDictionaries() {
  return store.useStore()
}

export function addDictionaryCategory(category: DictionaryCategory) {
  const current = store.get()
  store.set({ ...current, categories: [...current.categories, category] })
}

export function addDictionaryValue(key: string, value: string) {
  const current = store.get()
  store.set({
    ...current,
    categories: current.categories.map((category) =>
      category.key === key ? { ...category, values: [...category.values, value] } : category,
    ),
  })
}

export function updateDictionaryValue(key: string, previous: string, next: string) {
  const current = store.get()
  store.set({
    ...current,
    categories: current.categories.map((category) =>
      category.key === key
        ? { ...category, values: category.values.map((value) => (value === previous ? next : value)) }
        : category,
    ),
    inactiveValues: {
      ...current.inactiveValues,
      [key]: (current.inactiveValues[key] ?? []).map((value) => (value === previous ? next : value)),
    },
  })
}

export function setDictionaryValueActive(key: string, value: string, active: boolean) {
  const current = store.get()
  const inactive = current.inactiveValues[key] ?? []
  store.set({
    ...current,
    inactiveValues: {
      ...current.inactiveValues,
      [key]: active ? inactive.filter((item) => item !== value) : [...inactive, value],
    },
  })
}

export function activeDictionaryValues(state: DictionaryState, key: string) {
  const category = state.categories.find((item) => item.key === key)
  if (!category) return []
  const inactive = state.inactiveValues[key] ?? []
  return category.values.filter((value) => !inactive.includes(value))
}
