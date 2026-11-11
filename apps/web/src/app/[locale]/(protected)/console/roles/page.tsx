import { redirect } from 'next/navigation'

export default function LegacyConsoleRedirectPage() {
  redirect('/settings/roles')
}
