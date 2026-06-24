'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { AppShell } from '@/components/AppShell'
import { LanyardAvatar } from '@/components/LanyardCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Trophy, Crown, Medal } from 'lucide-react'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants/modules'

const fetcher = (u) => fetch(u).then(r => r.json())

export default function LeaderboardPage() { return <AppShell><Content /></AppShell> }

function Content() {
  const [metric, setMetric] = useState('hours')
  const [range, setRange] = useState('month')
  const { data } = useSWR(`/api/leaderboard?metric=${metric}&range=${range}`, fetcher, { refreshInterval: 30000 })
  const board = data?.leaderboard || []
  return (
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-amber-300" />
        <h1 className="text-2xl font-bold">Leaderboard</h1>
      </div>
      <Card className="p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground ml-1">Metric:</span>
        <Button size="sm" variant={metric === 'hours' ? 'default' : 'outline'} onClick={() => setMetric('hours')}>Hours logged</Button>
        <Button size="sm" variant={metric === 'shipped' ? 'default' : 'outline'} onClick={() => setMetric('shipped')}>Features shipped</Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Range:</span>
        <Button size="sm" variant={range === 'month' ? 'default' : 'outline'} onClick={() => setRange('month')}>This month</Button>
        <Button size="sm" variant={range === 'all' ? 'default' : 'outline'} onClick={() => setRange('all')}>All time</Button>
      </Card>
      <Card className="p-2 divide-y divide-border">
        {board.map((row, i) => {
          const rank = i + 1
          return (
            <Link key={row.user.id} href={`/devs/${row.user.id}`} className="flex items-center gap-3 p-3 hover:bg-secondary/30 rounded-md">
              <div className="w-8 text-center font-bold text-lg">
                {rank === 1 ? <Crown className="h-6 w-6 text-amber-400 mx-auto" /> : rank === 2 ? <Medal className="h-6 w-6 text-slate-300 mx-auto" /> : rank === 3 ? <Medal className="h-6 w-6 text-orange-400 mx-auto" /> : <span className="text-muted-foreground">#{rank}</span>}
              </div>
              <LanyardAvatar discord_id={row.user.discord_id} fallback={row.user.display_name} className="h-10 w-10" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{row.user.display_name}</div>
                <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[row.user.role]}`}>{ROLE_LABELS[row.user.role]}</Badge>
              </div>
              <div className="text-xl font-bold tabular-nums">{row.label}</div>
            </Link>
          )
        })}
        {board.length === 0 && <div className="text-center py-10 text-muted-foreground">No data yet</div>}
      </Card>
    </div>
  )
}
