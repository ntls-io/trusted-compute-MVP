import { Inter } from 'next/font/google'
import './globals.css'
import LayoutClient from './LayoutClient'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div id="app-root">
          <LayoutClient>
            {children}
          </LayoutClient>
        </div>
      </body>
    </html>
  )
}