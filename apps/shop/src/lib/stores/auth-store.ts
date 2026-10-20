import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthMode = 'phone' | 'email'

interface AuthState {
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void

  isPending: boolean
  setIsPending: (pending: boolean) => void

  error: string | undefined
  setError: (error: string | undefined) => void
  success: string | undefined
  setSuccess: (success: string | undefined) => void

  isSendingCode: boolean
  setIsSendingCode: (sending: boolean) => void
  countdown: number
  setCountdown: (countdown: number) => void
  codeSent: boolean
  setCodeSent: (sent: boolean) => void

  showPassword: boolean
  setShowPassword: (show: boolean) => void

  resetStates: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      authMode: 'phone',
      setAuthMode: (mode) => {
        set({ authMode: mode })
        get().resetStates()
      },

      isPending: false,
      setIsPending: (pending) => set({ isPending: pending }),

      error: undefined,
      setError: (error) => set({ error }),
      success: undefined,
      setSuccess: (success) => set({ success }),

      isSendingCode: false,
      setIsSendingCode: (sending) => set({ isSendingCode: sending }),
      countdown: 0,
      setCountdown: (countdown) => set({ countdown }),
      codeSent: false,
      setCodeSent: (sent) => set({ codeSent: sent }),

      showPassword: false,
      setShowPassword: (show) => set({ showPassword: show }),

      resetStates: () =>
        set({
          error: undefined,
          success: undefined,
          isPending: false,
          isSendingCode: false,
          countdown: 0,
          codeSent: false,
          showPassword: false,
        }),
    }),
    {
      name: 'merchant-auth-store',
      partialize: (state) => ({ authMode: state.authMode }),
    }
  )
)
