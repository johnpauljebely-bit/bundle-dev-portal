'use client'
import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AppShell, useMe } from '@/components/AppShell'
import { LanyardAvatar } from '@/components/LanyardCard'
import { MentionTextarea, renderNoteWithMentions } from '@/components/MentionTextarea'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ArrowLeft, ChevronUp, Pin, Trash2, MessageSquare, MoreHorizontal, Send, Sparkles, Calendar, Users as UsersIcon } from 'lucide-react'
import { PRIORITIES, STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants/modules'
import { toast } from 'sonner'

const fetcher = (u) => fetch(u).then(r => r.json())

export default function FeatureDetailPage() {
  return <AppShell><Content /></AppShell>
}

function Content() {
  const router = useRouter()
  const { id } = useParams()
  const { data: meData } = useMe()
  const me = meData?.user
  const { data: featData, mutate: refresh } = useSWR(id ? `/api/features/${id}` : null, fetcher, { refreshInterval: 20000 })
  const { data: notesData, mutate: refreshNotes } = useSWR(id ? `/api/features/${id}/notes` : null, fetcher)
  const { data: upvotersData } = useSWR(id ? `/api/features/${id}/upvoters` : null, fetcher)
  const { data: usersData } = useSWR('/api/users', fetcher)
  const allUsers = (usersData?.users || []).filter(u => u.active)
  const [note, setNote] = useState('')
  const [posting, setPosting] = useState(false)

  if (!me) return null
  if (featData?.error) return (
    <div className="p-10 text-center">
      <div className="text-muted-foreground">Feature not found.</div>
      <Link href="/features" className="text-primary hover:underline mt-3 inline-block">← Back to all features</Link>
    </div>
  )
  if (!featData?.feature) return <div className="p-10 text-muted-foreground">Loading…</div>
  const f = featData.feature
  const isAdmin = me.role === 'admin' || me.role === 'lead_admin'
  const isClaimer = f.claimed_by === me.id

  async function patch(body) {
    const r = await fetch(`/api/features/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { refresh(); toast.success('Updated') } else { const d = await r.json(); toast.error(d.error) }
  }
  async function upvote() { await fetch(`/api/features/${id}/upvote`, { method: 'POST' }); refresh() }
  async function claim() { await patch({ claim: true }) }
  async function unclaim() { await patch({ unclaim: true }) }
  async function del() { if (!confirm('Delete this feature request?')) return; await fetch(`/api/features/${id}`, { method: 'DELETE' }); toast.success('Deleted'); router.push('/features') }
  async function addNote() {
    if (!note.trim()) return
    setPosting(true)
    const r = await fetch(`/api/features/${id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() }) })
    setPosting(false)
    if (r.ok) { setNote(''); refreshNotes(); toast.success('Note added') }
    else { const d = await r.json(); toast.error(d.error) }
  }

  const notes = notesData?.notes || []
  const upvoters = upvotersData?.upvoters || []

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">
      <Link href="/features" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> All features
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <Card className={`p-6 ${f.pinned ? 'border-primary/40 bg-primary/5' : ''}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                {f.pinned && <Badge variant="outline" className="text-primary border-primary/40"><Pin className="h-3 w-3 mr-1" /> Pinned</Badge>}
                <Badge variant="outline" className={PRIORITY_COLORS[f.priority]}>{f.priority}</Badge>
                <Badge variant="outline" className={STATUS_COLORS[f.status]}>{STATUS_LABELS[f.status]}</Badge>
                <Badge variant="secondary" className="text-[10px]">{f.module}</Badge>
              </div>
              {(isAdmin || isClaimer) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {(isClaimer || isAdmin) && (<>
                      <DropdownMenuLabel>Status</DropdownMenuLabel>
                      {(isAdmin ? STATUSES : ['in_progress', 'in_review']).map(s => <DropdownMenuItem key={s} onClick={() => patch({ status: s })}>{STATUS_LABELS[s]}</DropdownMenuItem>)}
                    </>)}
                    {isAdmin && (<>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Priority</DropdownMenuLabel>
                      {PRIORITIES.map(p => <DropdownMenuItem key={p} onClick={() => patch({ priority: p })}>{p[0].toUpperCase()+p.slice(1)}</DropdownMenuItem>)}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => patch({ pinned: !f.pinned })}><Pin className="h-3.5 w-3.5 mr-2" /> {f.pinned ? 'Unpin' : 'Pin to top'}</DropdownMenuItem>
                      <DropdownMenuItem onClick={del} className="text-red-300"><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                    </>)}
                    {isClaimer && !isAdmin && <DropdownMenuItem onClick={unclaim}>Unclaim</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <h1 className="text-2xl font-bold leading-tight">{f.title}</h1>
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Submitted {new Date(f.created_at).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })} • Updated {new Date(f.updated_at).toLocaleDateString()}</div>
            <p className="text-foreground/90 leading-relaxed mt-4 whitespace-pre-wrap">{f.description}</p>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Discussion & Progress Notes</h2>
              <Badge variant="secondary" className="ml-auto">{notes.length}</Badge>
            </div>
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {notes.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No notes yet. Be the first to share an update.
                </div>
              )}
              {notes.map(n => (
                <div key={n.id} className="px-5 py-4 flex gap-3">
                  <NoteAvatar devId={n.dev_id} name={n.dev_name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{n.dev_name}</span>
                      <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{renderNoteWithMentions(n.note, allUsers, Link)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-border bg-secondary/20">
              <div className="flex gap-2 items-end">
                <MentionTextarea value={note} onChange={setNote} placeholder="Share a progress update… type @ to mention a teammate" rows={2} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addNote() }} />
                <Button onClick={addNote} disabled={posting || !note.trim()} className="self-end"><Send className="h-4 w-4" /></Button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5">⌘/Ctrl + Enter to post • @ to mention</div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <Button variant={f.upvoted_by_me ? 'default' : 'outline'} size="lg" onClick={upvote} className="w-full">
              <ChevronUp className="h-5 w-5 mr-1" /> {f.upvote_count} {f.upvote_count === 1 ? 'upvote' : 'upvotes'}
            </Button>
            {!f.claimed_by && f.status !== 'rejected' && f.status !== 'shipped' && (
              <Button onClick={claim} className="w-full" variant="secondary"><Sparkles className="h-4 w-4 mr-2" /> Claim this feature</Button>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Submitted by</h3>
            {f.submitted_by_user ? (
              <Link href={`/devs/${f.submitted_by_user.id}`} className="flex items-center gap-3 -mx-1 px-1 py-1 rounded-md hover:bg-secondary/40">
                <LanyardAvatar discord_id={f.submitted_by_user.discord_id} fallback={f.submitted_by_user.display_name} className="h-10 w-10" />
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{f.submitted_by_user.display_name}</div>
                  <div className="text-xs text-muted-foreground">{f.submitted_by_user.role.replace('_', ' ')}</div>
                </div>
              </Link>
            ) : <div className="text-sm text-muted-foreground">Unknown</div>}
          </Card>

          {f.claimed_by_user && (
            <Card className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Claimed by</h3>
              <Link href={`/devs/${f.claimed_by_user.id}`} className="flex items-center gap-3 -mx-1 px-1 py-1 rounded-md hover:bg-secondary/40">
                <LanyardAvatar discord_id={f.claimed_by_user.discord_id} fallback={f.claimed_by_user.display_name} className="h-10 w-10" />
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{f.claimed_by_user.display_name}</div>
                  <div className="text-xs text-muted-foreground">{f.claimed_by_user.role.replace('_', ' ')}</div>
                </div>
              </Link>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><UsersIcon className="h-3 w-3" /> Upvoters ({upvoters.length})</h3>
            {upvoters.length === 0 ? <div className="text-sm text-muted-foreground">No upvotes yet</div> : (
              <div className="flex flex-wrap gap-1.5">
                {upvoters.map(u => (
                  <Link key={u.id} href={`/devs/${u.id}`} title={u.display_name}>
                    <LanyardAvatar discord_id={u.discord_id} fallback={u.display_name} className="h-8 w-8 ring-1 ring-border hover:ring-primary transition-all" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function NoteAvatar({ devId, name }) {
  const { data } = useSWR(devId ? `/api/users/${devId}` : null, fetcher)
  const did = data?.user?.discord_id
  return <LanyardAvatar discord_id={did} fallback={name} className="h-9 w-9 flex-shrink-0" />
}
