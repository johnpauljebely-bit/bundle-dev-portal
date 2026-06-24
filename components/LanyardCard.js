'use client'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Music2, Gamepad2, Code2 } from 'lucide-react'

const lanyardFetcher = async (u) => {
  const r = await fetch(u)
  // 404 means not in Lanyard server — cache as such, don't retry
  const data = await r.json().catch(() => ({ success: false }))
  return { ...data, _status: r.status }
}

const statusColor = {
  online: 'bg-emerald-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-slate-500',
}
const statusLabel = {
  online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline',
}

export function LanyardAvatar({ discord_id, fallback, className = 'h-10 w-10' }) {
  const { data } = useSWR(discord_id ? `/api/lanyard/${discord_id}` : null, lanyardFetcher, { refreshInterval: 0, dedupingInterval: 300000, revalidateOnFocus: false, shouldRetryOnError: false })
  const u = data?.data?.discord_user
  const url = u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} />}
      <AvatarFallback className="bg-secondary text-foreground text-xs">{(fallback || u?.username || '?').slice(0,2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

export function LanyardCard({ discord_id, displayName }) {
  const { data } = useSWR(discord_id ? `/api/lanyard/${discord_id}` : null, lanyardFetcher, { refreshInterval: 30000, dedupingInterval: 15000, revalidateOnFocus: false, shouldRetryOnError: false })
  if (!data || !data.success) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-secondary">{(displayName||'?').slice(0,2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold">{displayName}</div>
            <div className="text-xs text-muted-foreground">Discord presence unavailable</div>
          </div>
        </div>
      </Card>
    )
  }
  const d = data.data
  const u = d.discord_user
  const status = d.discord_status
  const avatarUrl = u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null
  const activities = (d.activities || []).filter(a => a.type !== 4) // skip custom status
  const spotify = d.listening_to_spotify ? d.spotify : null

  return (
    <Card className="overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-primary/30 via-indigo-500/20 to-purple-500/20" />
      <div className="px-5 pb-5 -mt-10">
        <div className="flex items-end gap-3">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-4 ring-card">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="bg-secondary text-lg">{(u?.username||'?').slice(0,2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full ring-2 ring-card ${statusColor[status] || 'bg-slate-500'}`} />
          </div>
          <div className="pb-2 flex-1 min-w-0">
            <div className="text-base font-semibold truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground truncate">@{u?.username} • {statusLabel[status] || status}</div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {spotify && (
            <div className="flex items-center gap-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3">
              <img src={spotify.album_art_url} className="h-12 w-12 rounded" alt="" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-medium"><Music2 className="h-3 w-3" /> Listening on Spotify</div>
                <div className="text-sm font-medium truncate">{spotify.song}</div>
                <div className="text-xs text-muted-foreground truncate">{spotify.artist}</div>
              </div>
            </div>
          )}
          {activities.map((a, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md bg-secondary/50 border border-border p-3">
              {a.type === 0 ? <Gamepad2 className="h-4 w-4 text-blue-400" /> : <Code2 className="h-4 w-4 text-purple-400" />}
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{a.type === 0 ? 'Playing' : 'Activity'}</div>
                <div className="text-sm font-medium truncate">{a.name}</div>
                {a.details && <div className="text-xs text-muted-foreground truncate">{a.details}</div>}
              </div>
            </div>
          ))}
          {!spotify && activities.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-2">No current activity</div>
          )}
        </div>
      </div>
    </Card>
  )
}
