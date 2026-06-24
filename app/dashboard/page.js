'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { AppShell, useMe } from '@/components/AppShell'
import { LanyardAvatar } from '@/components/LanyardCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Clock, Play, Square, TrendingUp, ListChecks, Sparkles, Flame } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants/modules'

const fetcher = (u) => fetch(u).then(r => r.json())

function fmtDuration(min) {
  if (!min || min < 0) return '0m'
  const h = Math.floor(min / 60), m = min % 60
  return h ? `${h}h ${m}m` : `${m}m`
}
function fmtLive(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

export default function DashboardPage() {
  return <AppShell><DashContent /></AppShell>
}

function DashContent() {
  const { data: meData } = useMe()
  const me = meData?.user
  const { data: activeData, mutate: refreshActive } = useSWR('/api/sessions/active', fetcher, { refreshInterval: 5000 })
  const { data: stats, mutate: refreshStats } = useSWR('/api/stats?range=7d', fetcher, { refreshInterval: 15000 })
  const { data: featuresData } = useSWR('/api/features', fetcher, { refreshInterval: 30000 })
  const { data: sessionsData } = useSWR(me ? `/api/sessions?dev_id=${me.id}` : null, fetcher)
  const [elapsed, setElapsed] = useState(0)
  const active = activeData?.session

  useEffect(() => {
    if (!active) { setElapsed(0); return }
    const start = new Date(active.start_time).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [active])

  async function toggle() {
    const r = await fetch('/api/sessions/toggle', { method: 'POST' })
    const d = await r.json()
    if (d.action === 'started') toast.success('On duty — timer started')
    else if (d.action === 'stopped') toast.success(`Logged ${fmtDuration(d.duration_minutes)}`)
    refreshActive(); refreshStats()
  }

  if (!me) return null

  const dailyGoalMin = (me.daily_goal || 4) * 60
  const weeklyGoalMin = (me.weekly_goal || 25) * 60
  const todayMin = stats?.today_minutes || 0
  const weekMin = stats?.week_minutes || 0
  const liveBonus = active ? Math.floor(elapsed / 60) : 0
  const todayPct = Math.min(100, ((todayMin + liveBonus) / dailyGoalMin) * 100)
  const weekPct = Math.min(100, ((weekMin + liveBonus) / weeklyGoalMin) * 100)

  const myFeatures = (featuresData?.features || []).filter(f => f.submitted_by === me.id || f.claimed_by === me.id)
  const recentSessions = (sessionsData?.sessions || []).slice(0, 5)

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <LanyardAvatar discord_id={me.discord_id} fallback={me.display_name} className="h-14 w-14" />
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {me.display_name}</h1>
            <p className="text-sm text-muted-foreground">Here’s how your work is going</p>
          </div>
        </div>
        <Button size="lg" onClick={toggle} className={active ? 'bg-red-500 hover:bg-red-600' : ''}>
          {active ? <><Square className="h-4 w-4 mr-2" /> Clock Out</> : <><Play className="h-4 w-4 mr-2" /> Clock In</>}
        </Button>
      </div>

      {active && (
        <Card className="p-5 border-primary/30 bg-gradient-to-r from-primary/10 to-purple-500/10 glow-blurple">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 pulse-dot" />
                <span className="font-medium text-emerald-300">On Duty</span>
              </div>
              <div className="text-sm text-muted-foreground">Started at {new Date(active.start_time).toLocaleTimeString()}</div>
            </div>
            <div className="text-3xl font-bold font-mono tracking-tight">{fmtLive(elapsed)}</div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Clock className="h-4 w-4" />} label="Today" value={fmtDuration(todayMin + liveBonus)} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="This Week" value={fmtDuration(weekMin + liveBonus)} />
        <StatCard icon={<ListChecks className="h-4 w-4" />} label="Features Claimed" value={stats?.features_claimed ?? 0} />
        <StatCard icon={<Sparkles className="h-4 w-4" />} label="Features Shipped" value={stats?.features_shipped ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-medium">Daily Goal</div>
            <div className="text-xs text-muted-foreground">{fmtDuration(todayMin + liveBonus)} / {me.daily_goal || 4}h</div>
          </div>
          <Progress value={todayPct} className="h-2" />
          {todayPct >= 100 && <div className="flex items-center gap-1 text-xs text-emerald-300 mt-2"><Flame className="h-3 w-3" /> Goal smashed!</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-medium">Weekly Goal</div>
            <div className="text-xs text-muted-foreground">{fmtDuration(weekMin + liveBonus)} / {me.weekly_goal || 25}h</div>
          </div>
          <Progress value={weekPct} className="h-2" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Recent Features</h2>
          {myFeatures.length === 0 && <div className="text-sm text-muted-foreground py-3">No features yet. <Link href="/features" className="text-primary hover:underline">Submit one</Link>.</div>}
          <div className="space-y-2">
            {myFeatures.slice(0, 5).map(f => (
              <Link key={f.id} href="/features" className="flex items-center justify-between p-2.5 rounded-md hover:bg-secondary/50 transition-colors">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{f.title}</div><div className="text-xs text-muted-foreground">{f.module}</div></div>
                <Badge variant="outline" className={STATUS_COLORS[f.status]}>{STATUS_LABELS[f.status]}</Badge>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Sessions</h2>
          {recentSessions.length === 0 && <div className="text-sm text-muted-foreground py-3">No completed sessions yet — clock in above to start tracking.</div>}
          <div className="space-y-2">
            {recentSessions.map(s => s.end_time && (
              <div key={s.id} className="flex items-center justify-between p-2.5 rounded-md bg-secondary/30">
                <div className="text-sm"><div>{new Date(s.start_time).toLocaleDateString()}</div><div className="text-xs text-muted-foreground">{new Date(s.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} → {new Date(s.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></div>
                <div className="text-sm font-semibold">{fmtDuration(s.duration_minutes)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">{icon}{label}</div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </Card>
  )
}
