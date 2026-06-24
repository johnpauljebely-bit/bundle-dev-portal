'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { BundleLogo } from './BundleLogo'
import { LanyardAvatar } from './LanyardCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LayoutDashboard, ListTodo, Users, Trophy, Shield, FileText, LogOut } from 'lucide-react'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants/modules'

const fetcher = (u) => fetch(u).then(async r => { if (!r.ok) throw new Error('unauth'); return r.json() })

export function useMe() {
  return useSWR('/api/auth/me', fetcher, { revalidateOnFocus: false })
}

export function AppShell({ children, requireAdmin = false }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data, error, isLoading } = useMe()

  useEffect(() => {
    if (error) router.replace('/login')
  }, [error, router])

  useEffect(() => {
    if (requireAdmin && data?.user) {
      if (data.user.role !== 'admin' && data.user.role !== 'lead_admin') router.replace('/dashboard')
    }
  }, [data, requireAdmin, router])

  if (isLoading || !data?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  const me = data.user
  const isAdmin = me.role === 'admin' || me.role === 'lead_admin'

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/features', icon: ListTodo, label: 'Features' },
    { href: '/devs', icon: Users, label: 'Developers' },
    { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { href: '/changelog', icon: FileText, label: 'Changelog' },
  ]
  if (isAdmin) navItems.push({ href: '/admin', icon: Shield, label: 'Admin' })

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-sidebar-border">
          <BundleLogo className="h-8 w-8" />
          <div>
            <div className="font-bold text-base text-foreground leading-none">Bundle</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Dev Portal</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? 'bg-sidebar-accent text-foreground font-medium' : 'hover:bg-sidebar-accent/60'}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-3 py-3 border-t border-sidebar-border">
          <Link href={`/devs/${me.id}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent/60 transition-colors">
            <LanyardAvatar discord_id={me.discord_id} fallback={me.display_name} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate text-foreground">{me.display_name}</div>
              <Badge variant="outline" className={`text-[10px] py-0 h-4 px-1.5 ${ROLE_COLORS[me.role]}`}>{ROLE_LABELS[me.role]}</Badge>
            </div>
          </Link>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start mt-1 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="md:hidden border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><BundleLogo className="h-7 w-7" /><span className="font-bold">Bundle</span></div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
        </div>
        {children}
      </main>
    </div>
  )
}
