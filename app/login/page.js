'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BundleLogo } from '@/components/BundleLogo'
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import Link from 'next/link'

function DiscordIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.419c0-1.333.956-2.418 2.157-2.418c1.21 0 2.176 1.094 2.157 2.418c0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.182 0-2.157-1.086-2.157-2.419c0-1.333.955-2.418 2.157-2.418c1.21 0 2.176 1.094 2.157 2.418c0 1.333-.946 2.419-2.157 2.419z"/>
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lanyardBlock, setLanyardBlock] = useState(false)

  useEffect(() => {
    const de = params.get('discord_error')
    if (!de) return
    if (de === 'no_account') {
      const username = params.get('discord_username') || 'this Discord account'
      setError(`No account found for ${username}. Contact an admin to get registered.`)
    } else if (de === 'lanyard') {
      setLanyardBlock(true)
    } else if (de === 'deactivated') {
      setError('Your account has been deactivated. Contact an admin.')
    } else if (de === 'bad_state') {
      setError('OAuth session expired or invalid. Please try again.')
    } else {
      setError('Discord sign-in failed. Please try again or use your password.')
    }
  }, [params])

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
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 h-[600px] w-[900px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-200px] right-[-100px] h-[400px] w-[400px] bg-purple-500/15 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md px-4 relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="glow-blurple rounded-2xl p-3.5 bg-card border border-border/80 mb-5">
            <BundleLogo className="h-12 w-12" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-center leading-tight">
            Welcome to <span className="gradient-text">Bundle</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2.5 text-center max-w-xs">
            The all-in-one developer portal for the Bundle Discord bot team
          </p>
        </div>

        <Card className="p-7 border-border/60 backdrop-blur-xl bg-card/80 shadow-2xl">
          {lanyardBlock ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
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
              <Button variant="outline" className="w-full" onClick={() => { setLanyardBlock(false); router.replace('/login') }}>
                Back to login
              </Button>
            </div>
          ) : (
            <>
              <Button
                asChild
                size="lg"
                className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold shadow-lg shadow-[#5865F2]/25"
              >
                <a href="/api/auth/discord/start">
                  <DiscordIcon className="h-5 w-5 mr-2.5" />
                  Sign in with Discord
                </a>
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/60" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground uppercase tracking-wider">Or with password</span></div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="identifier" className="text-xs uppercase tracking-wider text-muted-foreground">Display name or Discord ID</Label>
                  <Input id="identifier" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="e.g. Vance" required autoFocus className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11" />
                </div>
                {error && (
                  <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in…</> : 'Sign in'}
                </Button>
              </form>
            </>
          )}
        </Card>

        <div className="text-center mt-6 text-xs text-muted-foreground">
          <Link href="/changelog" className="hover:text-foreground transition-colors">View public changelog →</Link>
        </div>
      </div>
    </div>
  )
}
