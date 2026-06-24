import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'Bundle Dev Portal',
  description: 'Internal developer portal for the Bundle Discord bot team',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <Providers>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
