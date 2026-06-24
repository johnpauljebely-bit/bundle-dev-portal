'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BundleLogo } from '@/components/BundleLogo'
import { AlertCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lanyardBlock, setLanyardBlock] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError(null); setLanyardBlock(false)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await r.json()
      if (!r.ok) {
        if (data.error === 'lanyard_required') setLanyardBlock(true)
        else setError(data.error || 'Login failed')
        return
      }
      router.replace('/dashboard')
    } catch (e) {
      setError('Network error')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-grid relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
      <div className="w-full max-w-md px-4 relative">
        <div className="flex flex-col items-center mb-8">
          <div className="glow-blurple rounded-2xl p-3 bg-card border border-border mb-4">
            <BundleLogo className="h-14 w-14" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to <span className="gradient-text">Bundle</span></h1>
          <p className="text-muted-foreground text-sm mt-1">Internal developer portal — sign in to continue</p>
        </div>
        <Card className="p-6 border-border/60 backdrop-blur-sm">
          {lanyardBlock ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                <AlertCircle className="h-5 w-5 text-yellow-300 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-yellow-200 mb-1">Lanyard membership required</div>
                  <div className="text-yellow-100/80">You need to join the Lanyard Discord server to use this portal.</div>
                </div>
              </div>
              <Button asChild className="w-full" size="lg">
                <a href="https://discord.com/invite/lanyard" target="_blank" rel="noreferrer">
                  Join Lanyard Discord <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLanyardBlock(false)}>
                Back to login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Display name or Discord ID</Label>
                <Input id="identifier" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="e.g. Vance" required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  <AlertCircle className="h-4 w-4" /> {error}
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </Card>
        <div className="text-center mt-6 text-xs text-muted-foreground">
          <Link href="/changelog" className="hover:text-foreground transition-colors">View public changelog →</Link>
        </div>
      </div>
    </div>
  )
}
