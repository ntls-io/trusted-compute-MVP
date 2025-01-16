import { Inter } from 'next/font/google'
import './globals.css'
import LayoutClient from './LayoutClient'
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton
} from '@clerk/nextjs'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <div id="app-root">
            <LayoutClient>
              {children}
            </LayoutClient>
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}