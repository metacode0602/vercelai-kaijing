import { z } from 'zod'
import { router, publicProcedure } from './trpc'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export const authRouter = router({
  signUp: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8).max(32),
      }),
    )
    .mutation(async () => {
      return { error: true, message: '注册已关闭，请联系管理员开通账号' }
    }),

  signIn: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
        remember: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        await auth.api.signInEmail({
          body: {
            email: input.email,
            password: input.password,
            rememberMe: input.remember,
          },
          headers: await headers(),
        })

        return { error: false, message: 'Signed in successfully.' }
      } catch (error: unknown) {
        console.log(error)

        return { error: true, message: 'Internal Server Error' }
      }
    }),

  signOut: publicProcedure.mutation(async () => {
    try {
      await auth.api.signOut({
        headers: await headers(),
      })

      return { error: false, message: 'Signed out successfully.' }
    } catch (error: unknown) {
      console.log(error)

      return { error: true, message: 'Internal Server Error' }
    }
  }),
})
