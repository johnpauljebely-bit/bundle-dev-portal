'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { LanyardCard } from '@/components/LanyardCard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ROLE_LABELS, ROLE_COLORS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants/modules'
import { Clock, Calendar, Sparkles, ListChecks, Activity } from 'lucide-react'

const fetcher = (u) => fetch(u).then(r => r.json())
const fmt = (m) => { if (!m) return '0m'; const h = Math.floor(m/60), r = m%60; return h ? `${h}h ${r}m` : `${r}m` }

export default function DevPage() {
  return <AppShell><Content /></AppShell>
}

function Content() {
  const { id } = useParams()
  const { data: userData } = useSWR(id ? `/api/users/${id}` : null, fetcher)
  const [range, setRange] = useState('7d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const statsUrl = range === 'custom' && from && to ? `/api/stats?dev_id=${id}&range=custom&from=${from}&to=${to}` : `/api/stats?dev_id=${id}&range=${range}`
  const { data: stats } = useSWR(id ? statsUrl : null, fetcher)
  const { data: sessionsData } = useSWR(id ? `/api/sessions?dev_id=${id}` : null, fetcher)
  const { data: activeData } = useSWR(id ? `/api/sessions/active?dev_id=${id}` : null, fetcher, { refreshInterval: 5000 })
  const { data: featuresData } = useSWR('/api/features', fetcher)

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!activeData?.session) { setElapsed(0); return }
    const start = new Date(activeData.session.start_time).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i)
  }, [activeData])

  if (!userData?.user) return <div className="p-6">Loading…</div>
  const u = userData.user
  const sessions = sessionsData?.sessions || []
  const allFeatures = featuresData?.features || []
  const submittedByDev = allFeatures.filter(f => f.submitted_by === id)
  const claimedByDev = allFeatures.filter(f => f.claimed_by === id)

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 space-y-4">
          <LanyardCard discord_id={u.discord_id} displayName={u.display_name} />
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Role</div>
                <Badge variant="outline" className={`mt-1 ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</Badge>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Duty</div>
                {activeData?.session ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 pulse-dot" />
                    <span className="text-sm font-mono">{Math.floor(elapsed/3600)}h {Math.floor((elapsed%3600)/60)}m</span>
                  </div>
                ) : <Badge variant="outline" className="mt-1">Offline</Badge>}
              </div>
            </div>
          </Card>
        </div>
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="text-lg font-semibold">Statistics</h2>
              <div className="flex items-center gap-1">
                {['7d','30d','all','custom'].map(r => (
                  <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r)}>
                    {r === '7d' ? '7 days' : r === '30d' ? '30 days' : r === 'all' ? 'All time' : 'Custom'}
                  </Button>
                ))}
              </div>
            </div>
            {range === 'custom' && (
              <div className="flex items-center gap-2 mb-4">
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="max-w-[180px]" />
                <span className="text-muted-foreground">to</span>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="max-w-[180px]" />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox icon={<Clock className="h-4 w-4" />} label="Total hours" value={`${stats?.total_hours ?? 0}h`} />
              <StatBox icon={<ListChecks className="h-4 w-4" />} label="Claimed" value={stats?.features_claimed ?? 0} />
              <StatBox icon={<Sparkles className="h-4 w-4" />} label="Shipped" value={stats?.features_shipped ?? 0} />
              <StatBox icon={<Activity className="h-4 w-4" />} label="Avg / day" value={`${stats?.avg_hours_per_day ?? 0}h`} />
              <StatBox icon={<Calendar className="h-4 w-4" />} label="Sessions" value={stats?.sessions_count ?? 0} />
              <StatBox icon={<Clock className="h-4 w-4" />} label="Longest session" value={fmt(stats?.longest_session_minutes)} />
              <StatBox icon={<ListChecks className="h-4 w-4" />} label="Submitted" value={stats?.features_submitted ?? 0} />
              <StatBox icon={<Clock className="h-4 w-4" />} label="This week" value={fmt(stats?.week_minutes)} />
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <Tabs defaultValue="sessions">
              <TabsList className="w-full grid grid-cols-3 rounded-none border-b border-border bg-transparent">
                <TabsTrigger value="sessions">Sessions</TabsTrigger>
                <TabsTrigger value="submitted">Submitted ({submittedByDev.length})</TabsTrigger>
                <TabsTrigger value="claimed">Claimed ({claimedByDev.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="sessions" className="p-4 max-h-[400px] overflow-y-auto">
                {sessions.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No sessions yet</div>}
                <div className="space-y-1.5">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2.5 rounded-md hover:bg-secondary/30 text-sm">
                      <div>
                        <div>{new Date(s.start_time).toLocaleDateString()} {s.manual && <Badge variant="outline" className="text-[10px] ml-1">manual</Badge>}</div>
                        <div className="text-xs text-muted-foreground">{new Date(s.start_time).toLocaleTimeString()} {s.end_time && `→ ${new Date(s.end_time).toLocaleTimeString()}`}</div>
                      </div>
                      <div className="font-semibold">{s.end_time ? fmt(s.duration_minutes) : <span className="text-emerald-400">active</span>}</div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="submitted" className="p-4 max-h-[400px] overflow-y-auto space-y-1.5">
                {submittedByDev.map(f => <FeatureRow key={f.id} f={f} />)}
                {submittedByDev.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">None</div>}
              </TabsContent>
              <TabsContent value="claimed" className="p-4 max-h-[400px] overflow-y-auto space-y-1.5">
                {claimedByDev.map(f => <FeatureRow key={f.id} f={f} />)}
                {claimedByDev.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">None</div>}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatBox({ icon, label, value }) {
  return (
    <div className="p-3 rounded-md bg-secondary/30 border border-border">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wider">{icon}{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  )
}
function FeatureRow({ f }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-md hover:bg-secondary/30">
      <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{f.title}</div><div className="text-xs text-muted-foreground">{f.module}</div></div>
      <Badge variant="outline" className={STATUS_COLORS[f.status]}>{STATUS_LABELS[f.status]}</Badge>
    </div>
  )
}
