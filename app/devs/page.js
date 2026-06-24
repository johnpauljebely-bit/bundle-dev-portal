'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { LanyardAvatar } from '@/components/LanyardCard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants/modules'

const fetcher = (u) => fetch(u).then(r => r.json())

export default function DevsPage() {
  return <AppShell><Content /></AppShell>
}

function Content() {
  const { data } = useSWR('/api/users', fetcher)
  const { data: overview } = useSWR('/api/overview', fetcher)
  const users = (data?.users || []).filter(u => u.active)
  const onDutyMap = new Map((overview?.overview || []).map(o => [o.user.id, o.on_duty]))
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Developers</h1>
        <p className="text-sm text-muted-foreground">The team behind Bundle</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(u => (
          <Link key={u.id} href={`/devs/${u.id}`}>
            <Card className="p-5 hover:border-primary/40 transition-colors h-full">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <LanyardAvatar discord_id={u.discord_id} fallback={u.display_name} className="h-14 w-14" />
                  {onDutyMap.get(u.id) && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-card pulse-dot" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{u.display_name}</div>
                  <Badge variant="outline" className={`text-[10px] mt-1 ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</Badge>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{onDutyMap.get(u.id) ? <span className="text-emerald-400">• On duty now</span> : 'Off duty'}</div>
            </Card>
          </Link>
        ))}
        {users.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12">No developers yet</div>}
      </div>
    </div>
  )
}
