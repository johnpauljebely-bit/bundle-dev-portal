'use client'
import { useState, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import { AppShell, useMe } from '@/components/AppShell'
import { LanyardAvatar } from '@/components/LanyardCard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Plus, MoreHorizontal, Download, Trash2, KeyRound, UserX, UserCheck, Pin, Shield, Target, Webhook, CheckCircle2, Send } from 'lucide-react'
import { BUNDLE_MODULES, PRIORITIES, STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS, ROLE_LABELS, ROLE_COLORS } from '@/lib/constants/modules'
import { toast } from 'sonner'

const fetcher = (u) => fetch(u).then(r => r.json())
const fmt = (m) => { if (!m) return '0m'; const h = Math.floor(m/60), r = m%60; return h ? `${h}h ${r}m` : `${r}m` }

export default function AdminPage() { return <AppShell requireAdmin><Content /></AppShell> }

function Content() {
  const { data: meData } = useMe()
  const me = meData?.user
  if (!me) return null
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <Badge variant="outline" className={`ml-2 ${ROLE_COLORS[me.role]}`}>{ROLE_LABELS[me.role]}</Badge>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-6 max-w-3xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="time">Time Logs</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="team"><TeamTab me={me} /></TabsContent>
        <TabsContent value="features"><FeaturesAdminTab /></TabsContent>
        <TabsContent value="time"><TimeLogsTab /></TabsContent>
        <TabsContent value="changelog"><ChangelogTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function OverviewTab() {
  const { data } = useSWR('/api/overview', fetcher, { refreshInterval: 15000 })
  const ov = data?.overview || []
  const onDuty = ov.filter(o => o.on_duty)
  return (
    <div className="space-y-4 mt-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Currently on duty</h3>
        {onDuty.length === 0 ? <div className="text-sm text-muted-foreground">No one is on duty.</div> :
          <div className="flex flex-wrap gap-3">
            {onDuty.map(o => (
              <div key={o.user.id} className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                <LanyardAvatar discord_id={o.user.discord_id} fallback={o.user.display_name} className="h-8 w-8" />
                <div>
                  <div className="text-sm font-medium">{o.user.display_name}</div>
                  <div className="text-[10px] text-emerald-300">since {new Date(o.on_duty_since).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
        }
      </Card>
      <Card className="p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">This week — hours by dev</h3>
        <div className="space-y-2">
          {[...ov].sort((a,b) => b.week_minutes - a.week_minutes).map(o => (
            <div key={o.user.id} className="flex items-center gap-3">
              <LanyardAvatar discord_id={o.user.discord_id} fallback={o.user.display_name} className="h-8 w-8" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between"><div className="text-sm font-medium">{o.user.display_name}</div><div className="text-sm tabular-nums">{fmt(o.week_minutes)}</div></div>
                <div className="h-1.5 bg-secondary rounded-full mt-1 overflow-hidden"><div className="h-full bg-primary" style={{width: `${Math.min(100, (o.week_minutes / 1500) * 100)}%`}} /></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top shippers this month</h3>
        <div className="space-y-2">
          {[...ov].sort((a,b) => b.month_shipped - a.month_shipped).filter(o => o.month_shipped > 0).map(o => (
            <div key={o.user.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2"><LanyardAvatar discord_id={o.user.discord_id} fallback={o.user.display_name} className="h-7 w-7" /><span className="text-sm font-medium">{o.user.display_name}</span></div>
              <Badge>{o.month_shipped} shipped</Badge>
            </div>
          ))}
          {[...ov].filter(o => o.month_shipped > 0).length === 0 && <div className="text-sm text-muted-foreground">No features shipped this month yet.</div>}
        </div>
      </Card>
    </div>
  )
}

function TeamTab({ me }) {
  const { data, mutate } = useSWR('/api/users', fetcher)
  const users = data?.users || []
  const [openNew, setOpenNew] = useState(false)
  const isLead = me.role === 'lead_admin'
  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{users.length} members</h3>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Register new user</Button></DialogTrigger>
          <RegisterUserDialog isLead={isLead} onCreated={() => { setOpenNew(false); mutate() }} />
        </Dialog>
      </div>
      <Card className="divide-y divide-border">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-3">
            <LanyardAvatar discord_id={u.discord_id} fallback={u.display_name} className="h-10 w-10" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium">{u.display_name}</div>
                <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</Badge>
                {!u.active && <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-300 border-red-500/30">Deactivated</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{u.discord_id}</div>
            </div>
            <UserMenu user={u} me={me} onChanged={mutate} />
          </div>
        ))}
      </Card>
    </div>
  )
}

function RegisterUserDialog({ isLead, onCreated }) {
  const [discord_id, setDiscordId] = useState('')
  const [display_name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('developer')
  const [submitting, setSubmitting] = useState(false)
  async function submit() {
    if (!discord_id || !display_name || !password) return toast.error('All fields required')
    setSubmitting(true)
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discord_id, display_name, password, role }) })
    setSubmitting(false)
    if (r.ok) { toast.success(`${role} registered`); setDiscordId(''); setName(''); setPassword(''); onCreated() }
    else { const d = await r.json(); toast.error(d.error) }
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Register new {role === 'admin' ? 'admin' : 'developer'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Discord User ID</Label><Input value={discord_id} onChange={e => setDiscordId(e.target.value)} placeholder="e.g. 123456789012345678" /></div>
        <div><Label>Display Name</Label><Input value={display_name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex" /></div>
        <div><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div><Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="developer">Developer</SelectItem>
              {isLead && <SelectItem value="admin">Admin</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={submitting}>{submitting ? 'Creating…' : 'Create user'}</Button></DialogFooter>
    </DialogContent>
  )
}

function UserMenu({ user, me, onChanged }) {
  const [openPwd, setOpenPwd] = useState(false)
  const [openGoals, setOpenGoals] = useState(false)
  const isLead = me.role === 'lead_admin'
  if (user.role === 'lead_admin') return <Badge variant="outline" className="text-[10px]">Protected</Badge>
  if (user.role === 'admin' && !isLead) return null
  async function toggleActive() {
    await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !user.active }) })
    toast.success(user.active ? 'Deactivated' : 'Reactivated'); onChanged()
  }
  async function remove() {
    if (!confirm(`Remove ${user.display_name}? This cannot be undone.`)) return
    await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    toast.success('Removed'); onChanged()
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpenGoals(true)}><Target className="h-3.5 w-3.5 mr-2" /> Edit goals</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenPwd(true)}><KeyRound className="h-3.5 w-3.5 mr-2" /> Reset password</DropdownMenuItem>
          <DropdownMenuItem onClick={toggleActive}>{user.active ? <><UserX className="h-3.5 w-3.5 mr-2" /> Deactivate</> : <><UserCheck className="h-3.5 w-3.5 mr-2" /> Reactivate</>}</DropdownMenuItem>
          {isLead && user.role !== 'lead_admin' && <><DropdownMenuSeparator /><DropdownMenuItem onClick={remove} className="text-red-300"><Trash2 className="h-3.5 w-3.5 mr-2" /> Remove user</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={openPwd} onOpenChange={setOpenPwd}>
        <ResetPwdDialog user={user} onDone={() => { setOpenPwd(false); onChanged() }} />
      </Dialog>
      <Dialog open={openGoals} onOpenChange={setOpenGoals}>
        <GoalsDialog user={user} onDone={() => { setOpenGoals(false); onChanged() }} />
      </Dialog>
    </>
  )
}

function GoalsDialog({ user, onDone }) {
  const [daily, setDaily] = useState(user.daily_goal ?? 4)
  const [weekly, setWeekly] = useState(user.weekly_goal ?? 25)
  async function save() {
    const r = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_goal: Number(daily), weekly_goal: Number(weekly) }) })
    if (r.ok) { toast.success(`Goals updated for ${user.display_name}`); onDone() } else { toast.error('Failed') }
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Edit goals — {user.display_name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">Hours per day / week. These power the progress bars on the dashboard.</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Daily goal (hours)</Label><Input type="number" min="0" step="0.5" value={daily} onChange={e => setDaily(e.target.value)} /></div>
          <div><Label>Weekly goal (hours)</Label><Input type="number" min="0" step="0.5" value={weekly} onChange={e => setWeekly(e.target.value)} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={save}>Save goals</Button></DialogFooter>
    </DialogContent>
  )
}

function ResetPwdDialog({ user, onDone }) {
  const [pwd, setPwd] = useState('')
  async function save() {
    if (!pwd) return
    await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
    toast.success('Password reset'); onDone()
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Reset password — {user.display_name}</DialogTitle></DialogHeader>
      <div><Label>New password</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus /></div>
      <DialogFooter><Button onClick={save}>Reset</Button></DialogFooter>
    </DialogContent>
  )
}

function FeaturesAdminTab() {
  const { data, mutate } = useSWR('/api/features', fetcher, { refreshInterval: 20000 })
  const features = data?.features || []
  async function upd(id, patch) { await fetch(`/api/features/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); mutate() }
  async function del(id) { if (!confirm('Delete?')) return; await fetch(`/api/features/${id}`, { method: 'DELETE' }); mutate() }
  return (
    <Card className="mt-4 divide-y divide-border">
      {features.length === 0 && <div className="p-6 text-center text-muted-foreground">No feature requests</div>}
      {features.map(f => (
        <div key={f.id} className="p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              {f.pinned && <Pin className="h-3 w-3 text-primary" />}
              <div className="font-medium">{f.title}</div>
            </div>
            <div className="text-xs text-muted-foreground">{f.module} • {f.submitted_by_user?.display_name} • {new Date(f.created_at).toLocaleDateString()}{f.claimed_by_user && ` • claimed by ${f.claimed_by_user.display_name}`}</div>
          </div>
          <Select value={f.priority} onValueChange={v => upd(f.id, { priority: v })}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={f.status} onValueChange={v => upd(f.id, { status: v })}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => upd(f.id, { pinned: !f.pinned })}><Pin className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => del(f.id)} className="text-red-300"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
    </Card>
  )
}

function TimeLogsTab() {
  const { data: usersData } = useSWR('/api/users', fetcher)
  const users = usersData?.users || []
  const [devId, setDevId] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const qs = new URLSearchParams()
  if (devId !== 'all') qs.set('dev_id', devId)
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const { data, mutate } = useSWR(`/api/sessions?${qs.toString()}`, fetcher)
  const sessions = data?.sessions || []
  const [openManual, setOpenManual] = useState(false)
  return (
    <div className="space-y-4 mt-4">
      <Card className="p-3 flex items-center gap-2 flex-wrap">
        <Select value={devId} onValueChange={setDevId}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All developers</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 max-w-[160px]" />
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 max-w-[160px]" />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" asChild><a href={`/api/sessions/export?${qs.toString()}`}><Download className="h-4 w-4 mr-1" /> CSV</a></Button>
          <Dialog open={openManual} onOpenChange={setOpenManual}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Manual entry</Button></DialogTrigger>
            <ManualEntryDialog users={users} onCreated={() => { setOpenManual(false); mutate() }} />
          </Dialog>
        </div>
      </Card>
      <Card className="divide-y divide-border">
        {sessions.length === 0 && <div className="p-6 text-center text-muted-foreground">No sessions</div>}
        {sessions.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{s.dev_name} {s.manual && <Badge variant="outline" className="text-[10px] ml-1">manual</Badge>}</div>
              <div className="text-xs text-muted-foreground">{new Date(s.start_time).toLocaleString()} {s.end_time && `→ ${new Date(s.end_time).toLocaleString()}`}</div>
              {s.manual_reason && <div className="text-xs italic text-muted-foreground mt-0.5">“{s.manual_reason}”</div>}
            </div>
            <div className="text-sm font-semibold">{s.end_time ? fmt(s.duration_minutes) : <span className="text-emerald-400">active</span>}</div>
            <Button size="icon" variant="ghost" onClick={async () => { if (confirm('Delete this entry?')) { await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' }); mutate() } }}><Trash2 className="h-4 w-4 text-red-300" /></Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

function ManualEntryDialog({ users, onCreated }) {
  const [dev_id, setDevId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  async function save() {
    if (!dev_id || !start || !end) return toast.error('Missing fields')
    const r = await fetch('/api/sessions/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dev_id, start_time: start, end_time: end, reason }) })
    if (r.ok) { toast.success('Entry added'); onCreated() } else { const d = await r.json(); toast.error(d.error) }
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Manual time entry</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Developer</Label>
          <Select value={dev_id} onValueChange={setDevId}><SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Start time</Label><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><Label>End time</Label><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div>
        <div><Label>Reason (note)</Label><Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Forgot to clock in for morning standup" /></div>
      </div>
      <DialogFooter><Button onClick={save}>Save entry</Button></DialogFooter>
    </DialogContent>
  )
}

function ChangelogTab() {
  const { data, mutate } = useSWR('/api/changelog', fetcher)
  const { data: feats } = useSWR('/api/features', fetcher)
  const shippedFeatures = (feats?.features || []).filter(f => f.status === 'shipped')
  const entries = data?.entries || []
  const [open, setOpen] = useState(false)
  async function del(id) { if (!confirm('Delete?')) return; await fetch(`/api/changelog/${id}`, { method: 'DELETE' }); mutate() }
  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Publish what’s new for the public changelog page.</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New entry</Button></DialogTrigger>
          <NewChangelogDialog shippedFeatures={shippedFeatures} onCreated={() => { setOpen(false); mutate() }} />
        </Dialog>
      </div>
      <Card className="divide-y divide-border">
        {entries.length === 0 && <div className="p-6 text-center text-muted-foreground">No entries</div>}
        {entries.map(e => (
          <div key={e.id} className="p-4 flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {e.version_tag && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{e.version_tag}</Badge>}
                <div className="font-medium">{e.title}</div>
                <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{e.description}</p>
              {e.module_tags?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{e.module_tags.map(m => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => del(e.id)}><Trash2 className="h-4 w-4 text-red-300" /></Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

function NewChangelogDialog({ shippedFeatures, onCreated }) {
  const [featureId, setFeatureId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState('')
  const [modules, setModules] = useState([])
  function pickFeature(id) {
    setFeatureId(id)
    const f = shippedFeatures.find(x => x.id === id)
    if (f) { setTitle(f.title); setDescription(f.description); setModules([f.module]) }
  }
  function toggleMod(m) { setModules(modules.includes(m) ? modules.filter(x => x !== m) : [...modules, m]) }
  async function save() {
    if (!title || !description) return toast.error('Title and description required')
    const r = await fetch('/api/changelog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature_id: featureId || null, title, description, version_tag: version || null, module_tags: modules }) })
    if (r.ok) { toast.success('Published'); onCreated() } else { toast.error('Failed') }
  }
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>New changelog entry</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {shippedFeatures.length > 0 && (
          <div><Label>Auto-fill from shipped feature</Label>
            <Select value={featureId} onValueChange={pickFeature}><SelectTrigger><SelectValue placeholder="Optional…" /></SelectTrigger>
              <SelectContent>{shippedFeatures.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div><Label>Version tag (optional)</Label><Input value={version} onChange={e => setVersion(e.target.value)} placeholder="v1.4.0" /></div>
        <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div><Label>Modules</Label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {BUNDLE_MODULES.map(m => <Badge key={m} onClick={() => toggleMod(m)} className={`cursor-pointer ${modules.includes(m) ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{m}</Badge>)}
          </div>
        </div>
      </div>
      <DialogFooter><Button onClick={save}>Publish</Button></DialogFooter>
    </DialogContent>
  )
}


function SettingsTab() {
  const { data, mutate } = useSWR('/api/settings', fetcher)
  const s = data?.settings
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Sync state when settings load
  useEffect(() => {
    if (s) {
      setUrl(s.discord_webhook_url || '')
      setEnabled(s.notifications_enabled !== false)
    }
  }, [s?.discord_webhook_url, s?.notifications_enabled])

  async function save() {
    setSaving(true)
    const r = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discord_webhook_url: url.trim(), notifications_enabled: enabled }) })
    setSaving(false)
    if (r.ok) { toast.success('Settings saved'); mutate() } else { toast.error('Failed to save') }
  }
  async function testWebhook() {
    setTesting(true)
    const r = await fetch('/api/settings/test-webhook', { method: 'POST' })
    setTesting(false)
    if (r.ok) toast.success('Test message sent to Discord ✓')
    else { const d = await r.json(); toast.error(d.error || 'Test failed') }
  }

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-1">
          <Webhook className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Discord Webhook Notifications</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Get notified in your Discord channel when feature requests are submitted, claimed, change status, or get pinned. Set up a webhook in your Discord server settings and paste the URL below.</p>
        <div className="space-y-4">
          <div>
            <Label>Webhook URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." className="font-mono text-sm" type="password" />
            <p className="text-xs text-muted-foreground mt-1.5">Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL</p>
          </div>
          <div className="flex items-center justify-between p-3 rounded-md bg-secondary/40 border border-border">
            <div>
              <div className="text-sm font-medium">Enable notifications</div>
              <div className="text-xs text-muted-foreground">Turn off to silence all webhook deliveries without removing the URL</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving}><CheckCircle2 className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save settings'}</Button>
            <Button variant="outline" onClick={testWebhook} disabled={testing || !s?.discord_webhook_url}><Send className="h-4 w-4 mr-2" />{testing ? 'Sending…' : 'Send test message'}</Button>
          </div>
          <Card className="p-4 bg-secondary/30 border-border">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notification triggers</div>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>✨ New feature request submitted</li>
              <li>🙌 Feature claimed by a developer</li>
              <li>↩️ Feature unclaimed</li>
              <li>🔨 Status changed (Pending → Claimed → In Progress → In Review → Shipped/Rejected)</li>
              <li>📌 Feature pinned by an admin</li>
            </ul>
          </Card>
        </div>
      </Card>
    </div>
  )
}
