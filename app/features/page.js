'use client'
import { useState, useMemo } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { AppShell, useMe } from '@/components/AppShell'
import { LanyardAvatar } from '@/components/LanyardCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { ChevronUp, MoreHorizontal, Plus, Pin, Trash2, MessageSquare, Filter } from 'lucide-react'
import { BUNDLE_MODULES, PRIORITIES, STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants/modules'
import { toast } from 'sonner'

const fetcher = (u) => fetch(u).then(r => r.json())

export default function FeaturesPage() {
  return <AppShell><FeaturesContent /></AppShell>
}

function FeaturesContent() {
  const { data: meData } = useMe()
  const me = meData?.user
  const { data, mutate } = useSWR('/api/features', fetcher, { refreshInterval: 15000 })
  const features = data?.features || []
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterModule, setFilterModule] = useState('all')
  const [filterClaim, setFilterClaim] = useState('all')
  const [sort, setSort] = useState('newest')
  const [openNew, setOpenNew] = useState(false)
  const isAdmin = me?.role === 'admin' || me?.role === 'lead_admin'

  const filtered = useMemo(() => {
    let arr = [...features]
    if (filterStatus !== 'all') arr = arr.filter(f => f.status === filterStatus)
    if (filterPriority !== 'all') arr = arr.filter(f => f.priority === filterPriority)
    if (filterModule !== 'all') arr = arr.filter(f => f.module === filterModule)
    if (filterClaim === 'claimed') arr = arr.filter(f => f.claimed_by)
    if (filterClaim === 'unclaimed') arr = arr.filter(f => !f.claimed_by)
    if (sort === 'upvotes') arr.sort((a,b) => (b.upvote_count - a.upvote_count) || (b.pinned - a.pinned))
    else if (sort === 'oldest') arr.sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
    else if (sort === 'priority') {
      const order = { critical: 4, high: 3, medium: 2, low: 1 }
      arr.sort((a,b) => (order[b.priority]||0) - (order[a.priority]||0))
    }
    // pinned always first
    arr.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    return arr
  }, [features, filterStatus, filterPriority, filterModule, filterClaim, sort])

  async function upvote(id) {
    await fetch(`/api/features/${id}/upvote`, { method: 'POST' })
    mutate()
  }
  async function claim(id) {
    const r = await fetch(`/api/features/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim: true }) })
    if (r.ok) { toast.success('Feature claimed'); mutate() } else { const d = await r.json(); toast.error(d.error) }
  }
  async function updateFeature(id, patch) {
    const r = await fetch(`/api/features/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (r.ok) mutate(); else { const d = await r.json(); toast.error(d.error) }
  }
  async function deleteFeature(id) {
    if (!confirm('Delete this feature request?')) return
    await fetch(`/api/features/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); mutate()
  }

  if (!me) return null

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Feature Requests</h1>
          <p className="text-sm text-muted-foreground">{features.length} total — {features.filter(f => !f.claimed_by).length} unclaimed</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Request</Button></DialogTrigger>
          <NewFeatureDialog onCreated={() => { setOpenNew(false); mutate() }} />
        </Dialog>
      </div>

      <Card className="p-3 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground ml-1" />
        <FilterSelect value={filterStatus} onChange={setFilterStatus} options={[{v:'all',l:'All status'}, ...STATUSES.map(s => ({v:s, l:STATUS_LABELS[s]}))]} />
        <FilterSelect value={filterPriority} onChange={setFilterPriority} options={[{v:'all',l:'All priority'}, ...PRIORITIES.map(p => ({v:p,l:p[0].toUpperCase()+p.slice(1)}))]} />
        <FilterSelect value={filterModule} onChange={setFilterModule} options={[{v:'all',l:'All modules'}, ...BUNDLE_MODULES.map(m => ({v:m,l:m}))]} />
        <FilterSelect value={filterClaim} onChange={setFilterClaim} options={[{v:'all',l:'All claims'},{v:'claimed',l:'Claimed'},{v:'unclaimed',l:'Unclaimed'}]} />
        <div className="ml-auto" />
        <FilterSelect value={sort} onChange={setSort} options={[{v:'newest',l:'Newest'},{v:'oldest',l:'Oldest'},{v:'upvotes',l:'Most upvoted'},{v:'priority',l:'Priority'}]} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(f => (
          <Card key={f.id} className={`p-5 flex flex-col gap-3 transition-colors hover:border-primary/40 ${f.pinned ? 'border-primary/40 bg-primary/5' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {f.pinned && <Badge variant="outline" className="text-primary border-primary/40"><Pin className="h-3 w-3 mr-1" /> Pinned</Badge>}
                <Badge variant="outline" className={PRIORITY_COLORS[f.priority]}>{f.priority}</Badge>
                <Badge variant="outline" className={STATUS_COLORS[f.status]}>{STATUS_LABELS[f.status]}</Badge>
              </div>
              <FeatureMenu feature={f} me={me} isAdmin={isAdmin} onUpdate={updateFeature} onDelete={deleteFeature} />
            </div>
            <Link href={`/features/${f.id}`} className="group block">
              <div className="font-semibold text-base leading-snug group-hover:text-primary transition-colors">{f.title}</div>
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-3">{f.description}</p>
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">{f.module}</Badge>
              <span>•</span>
              <span>{f.submitted_by_user?.display_name || 'Unknown'}</span>
              <span>•</span>
              <span>{new Date(f.created_at).toLocaleDateString()}</span>
            </div>
            {f.claimed_by_user && (
              <div className="flex items-center gap-2 text-xs bg-secondary/40 rounded-md p-2">
                <LanyardAvatar discord_id={f.claimed_by_user.discord_id} fallback={f.claimed_by_user.display_name} className="h-6 w-6" />
                <span className="text-muted-foreground">Claimed by</span>
                <span className="font-medium text-foreground">{f.claimed_by_user.display_name}</span>
              </div>
            )}
            <div className="flex items-center justify-between mt-auto pt-2">
              <Button variant={f.upvoted_by_me ? 'default' : 'outline'} size="sm" onClick={() => upvote(f.id)}>
                <ChevronUp className="h-4 w-4 mr-1" /> {f.upvote_count}
              </Button>
              <div className="flex items-center gap-2">
                {!f.claimed_by && f.status !== 'rejected' && f.status !== 'shipped' && (
                  <Button size="sm" variant="secondary" onClick={() => claim(f.id)}>Claim</Button>
                )}
                <FeatureNotesButton feature={f} me={me} />
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">No features match your filters.</div>
        )}
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
    </Select>
  )
}

function NewFeatureDialog({ onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mod, setMod] = useState('Utility')
  const [submitting, setSubmitting] = useState(false)
  async function submit() {
    if (!title || !description) return toast.error('All fields required')
    setSubmitting(true)
    const r = await fetch('/api/features', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, module: mod }) })
    setSubmitting(false)
    if (r.ok) { toast.success('Feature submitted'); setTitle(''); setDescription(''); onCreated() }
    else { const d = await r.json(); toast.error(d.error || 'Failed') }
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New feature request</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Add ban appeal modal" /></div>
        <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the feature…" /></div>
        <div><Label>Module</Label>
          <Select value={mod} onValueChange={setMod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{BUNDLE_MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button></DialogFooter>
    </DialogContent>
  )
}

function FeatureMenu({ feature: f, me, isAdmin, onUpdate, onDelete }) {
  const canChangeOwnStatus = f.claimed_by === me.id
  if (!isAdmin && !canChangeOwnStatus) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canChangeOwnStatus && !isAdmin && (<>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onUpdate(f.id, { status: 'in_progress' })}>Mark In Progress</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onUpdate(f.id, { status: 'in_review' })}>Mark In Review</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onUpdate(f.id, { unclaim: true })}>Unclaim</DropdownMenuItem>
        </>)}
        {isAdmin && (<>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {STATUSES.map(s => <DropdownMenuItem key={s} onClick={() => onUpdate(f.id, { status: s })}>{STATUS_LABELS[s]}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          {PRIORITIES.map(p => <DropdownMenuItem key={p} onClick={() => onUpdate(f.id, { priority: p })}>{p[0].toUpperCase()+p.slice(1)}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onUpdate(f.id, { pinned: !f.pinned })}><Pin className="h-3.5 w-3.5 mr-2" /> {f.pinned ? 'Unpin' : 'Pin to top'}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(f.id)} className="text-red-300"><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
        </>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FeatureNotesButton({ feature, me }) {
  const [open, setOpen] = useState(false)
  const { data, mutate } = useSWR(open ? `/api/features/${feature.id}/notes` : null, fetcher)
  const [note, setNote] = useState('')
  async function add() {
    if (!note) return
    await fetch(`/api/features/${feature.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) })
    setNote(''); mutate()
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm"><MessageSquare className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Progress notes — {feature.title}</DialogTitle></DialogHeader>
        <div className="max-h-72 overflow-y-auto space-y-2">
          {(data?.notes || []).map(n => (
            <div key={n.id} className="p-3 rounded-md bg-secondary/40">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><span className="font-medium text-foreground">{n.dev_name}</span> <span>• {new Date(n.created_at).toLocaleString()}</span></div>
              <div className="text-sm">{n.note}</div>
            </div>
          ))}
          {(data?.notes || []).length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No notes yet</div>}
        </div>
        <div className="flex gap-2">
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a progress note…" onKeyDown={e => e.key === 'Enter' && add()} />
          <Button onClick={add}>Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
