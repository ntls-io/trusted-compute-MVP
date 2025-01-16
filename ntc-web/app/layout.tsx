import { Inter } from 'next/font/google'
import './globals.css'
import LayoutClient from './LayoutClient'
import {
  ClerkProvider,
} from '@clerk/nextjs'
import AuthLayout from './AuthLayout'  // Add this import

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
            <AuthLayout>
              {children}
            </AuthLayout>
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}