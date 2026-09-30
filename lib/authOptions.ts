import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { isAllowedSender } from '@/lib/allowedSenders'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, user }) {
      const email = profile?.email ?? user?.email
      // Google sets email_verified; only the verified claim can be trusted to
      // prove the account really belongs to the allowed domain.
      if ((profile as { email_verified?: boolean } | undefined)?.email_verified === false) {
        console.warn(`[auth] Sign-in blocked — ${email ?? 'unknown account'} has an unverified email`)
        return false
      }
      if (!isAllowedSender(email)) {
        console.warn(`[auth] Sign-in blocked — ${email ?? 'unknown account'} is not an allowed sender`)
        return false
      }
      return true
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        token.email = profile?.email ?? token.email
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      if (session.user) session.user.email = token.email ?? session.user.email
      return session
    },
  },
}
