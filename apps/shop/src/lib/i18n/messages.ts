import deepmerge from 'deepmerge'
import type { Locale, Messages } from 'next-intl'
import { routing } from './routing'

export { default as defaultMessages } from '../../../messages/en.json'

const importLocale = async (locale: Locale): Promise<Messages> => {
  return (await import(`../../../messages/${locale}.json`)).default as Messages
}

export const getDefaultMessages = async (): Promise<Messages> => {
  return await importLocale(routing.defaultLocale)
}

export const getMessagesForLocale = async (locale: Locale): Promise<Messages> => {
  const localeMessages = await importLocale(locale)
  if (locale === routing.defaultLocale) {
    return localeMessages
  }
  const defaultMessages = await getDefaultMessages()
  return deepmerge(defaultMessages, localeMessages)
}
