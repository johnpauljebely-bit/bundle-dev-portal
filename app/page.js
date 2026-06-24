'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function App() {
  const router = useRouter()
  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (r.ok) router.replace('/dashboard')
      else router.replace('/login')
    }).catch(() => router.replace('/login'))
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading Bundle Portal…</p>
      </div>
    </div>
  )
}
