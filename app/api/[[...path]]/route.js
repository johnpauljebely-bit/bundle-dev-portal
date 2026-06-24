import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const COOKIE_NAME = 'bundle_auth'
const LEAD_ADMIN_DISCORD_ID = '1349737404449296414'
const LEAD_ADMIN_NAME = 'Vance'

let _client = null
let _db = null
async function getDb() {
  if (!_client) {
    _client = new MongoClient(process.env.MONGO_URL)
    await _client.connect()
    _db = _client.db(process.env.DB_NAME)
    try {
      await _db.collection('users').createIndex({ discord_id: 1 }, { unique: true })
      await _db.collection('feature_upvotes').createIndex({ feature_id: 1, user_id: 1 }, { unique: true })
      await _db.collection('work_sessions').createIndex({ dev_id: 1, start_time: -1 })
    } catch {}
  }
  return _db
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, discord_id: user.discord_id, display_name: user.display_name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  )
}

function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return match ? match[1] : null
}

async function getCurrentUser(request) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const db = await getDb()
    const user = await db.collection('users').findOne({ id: payload.id, active: true })
    if (!user) return null
    return cleanUser(user)
  } catch { return null }
}

function cleanUser(u) {
  if (!u) return u
  const { _id, password_hash, ...rest } = u
  return rest
}

function json(data, status = 200) {
  const res = NextResponse.json(data, { status })
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Credentials', 'true')
  return res
}

function setCookie(res, token) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 24 * 30, secure: true,
  })
  return res
}
function clearCookie(res) {
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

async function checkLanyard(discord_id) {
  try {
    const r = await fetch(`https://api.lanyard.rest/v1/users/${discord_id}`, { cache: 'no-store' })
    if (r.status === 404) return false
    if (!r.ok) return true
    const d = await r.json()
    return d?.success === true
  } catch { return true }
}

async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const method = request.method
  const seg = path
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams)
  try {
    const db = await getDb()

    // ============== AUTH ==============
    if (seg[0] === 'auth') {
      if (seg[1] === 'login' && method === 'POST') {
        const { identifier, password } = await request.json()
        if (!identifier || !password) return json({ error: 'Missing credentials' }, 400)
        // Lead admin path
        if (identifier === LEAD_ADMIN_NAME || identifier === LEAD_ADMIN_DISCORD_ID) {
          if (password !== process.env.LEAD_ADMIN_PASSWORD) return json({ error: 'Invalid credentials' }, 401)
          let user = await db.collection('users').findOne({ discord_id: LEAD_ADMIN_DISCORD_ID })
          if (!user) {
            user = { id: uuidv4(), discord_id: LEAD_ADMIN_DISCORD_ID, display_name: LEAD_ADMIN_NAME, password_hash: null, role: 'lead_admin', active: true, daily_goal: 4, weekly_goal: 25, created_at: new Date() }
            await db.collection('users').insertOne({ ...user })
          } else if (user.role !== 'lead_admin' || !user.active) {
            await db.collection('users').updateOne({ id: user.id }, { $set: { role: 'lead_admin', active: true } })
            user.role = 'lead_admin'; user.active = true
          }
          const token = signToken(user)
          return setCookie(json({ user: cleanUser(user) }), token)
        }
        const dbUser = await db.collection('users').findOne({ $or: [{ display_name: identifier }, { discord_id: identifier }] })
        if (!dbUser || !dbUser.active) return json({ error: 'Invalid credentials' }, 401)
        if (!dbUser.password_hash) return json({ error: 'Invalid credentials' }, 401)
        const ok = await bcrypt.compare(password, dbUser.password_hash)
        if (!ok) return json({ error: 'Invalid credentials' }, 401)
        if (dbUser.role === 'developer') {
          const lOk = await checkLanyard(dbUser.discord_id)
          if (!lOk) return json({ error: 'lanyard_required', message: 'You need to join the Lanyard Discord server to use this portal.', invite: 'https://discord.com/invite/lanyard' }, 403)
        }
        const token = signToken(dbUser)
        return setCookie(json({ user: cleanUser(dbUser) }), token)
      }
      if (seg[1] === 'logout' && method === 'POST') {
        return clearCookie(json({ ok: true }))
      }
      if (seg[1] === 'me' && method === 'GET') {
        const u = await getCurrentUser(request)
        if (!u) return json({ user: null }, 401)
        return json({ user: u })
      }
    }

    // ============== LANYARD PROXY ==============
    if (seg[0] === 'lanyard' && seg[1] && method === 'GET') {
      try {
        const r = await fetch(`https://api.lanyard.rest/v1/users/${seg[1]}`, { cache: 'no-store' })
        if (r.status === 404) return json({ success: false, error: 'not_found' }, 404)
        const d = await r.json()
        return json(d)
      } catch { return json({ success: false, error: 'fetch_failed' }, 502) }
    }

    // ============== CHANGELOG PUBLIC GET ==============
    if (seg[0] === 'changelog' && !seg[1] && method === 'GET') {
      const entries = await db.collection('changelog_entries').find({}).sort({ created_at: -1 }).toArray()
      return json({ entries: entries.map(e => { const { _id, ...r } = e; return r }) })
    }

    // ============== AUTH-GATED ==============
    const me = await getCurrentUser(request)
    if (!me) return json({ error: 'unauthorized' }, 401)
    const isAdmin = me.role === 'admin' || me.role === 'lead_admin'

    // ============== USERS ==============
    if (seg[0] === 'users') {
      if (!seg[1] && method === 'GET') {
        const users = await db.collection('users').find({}).sort({ created_at: -1 }).toArray()
        return json({ users: users.map(cleanUser) })
      }
      if (!seg[1] && method === 'POST') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        const { discord_id, display_name, password, role } = await request.json()
        if (!discord_id || !display_name || !password || !role) return json({ error: 'missing fields' }, 400)
        if (role === 'lead_admin') return json({ error: 'cannot create lead admin' }, 400)
        if (role === 'admin' && me.role !== 'lead_admin') return json({ error: 'only lead admin can create admins' }, 403)
        if (!['admin', 'developer'].includes(role)) return json({ error: 'invalid role' }, 400)
        const existing = await db.collection('users').findOne({ $or: [{ discord_id }, { display_name }] })
        if (existing) return json({ error: 'user already exists' }, 400)
        const hash = await bcrypt.hash(password, 10)
        const newUser = { id: uuidv4(), discord_id, display_name, password_hash: hash, role, active: true, daily_goal: 4, weekly_goal: 25, created_at: new Date() }
        await db.collection('users').insertOne({ ...newUser })
        return json({ user: cleanUser(newUser) })
      }
      if (seg[1] && !seg[2] && method === 'GET') {
        const u = await db.collection('users').findOne({ id: seg[1] })
        if (!u) return json({ error: 'not found' }, 404)
        return json({ user: cleanUser(u) })
      }
      if (seg[1] && !seg[2] && method === 'PATCH') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        const target = await db.collection('users').findOne({ id: seg[1] })
        if (!target) return json({ error: 'not found' }, 404)
        if (target.role === 'lead_admin') return json({ error: 'cannot modify lead admin' }, 403)
        if (target.role === 'admin' && me.role !== 'lead_admin') return json({ error: 'only lead admin can modify admins' }, 403)
        const body = await request.json()
        const update = {}
        if (typeof body.active === 'boolean') update.active = body.active
        if (body.display_name) update.display_name = body.display_name
        if (typeof body.daily_goal === 'number') update.daily_goal = body.daily_goal
        if (typeof body.weekly_goal === 'number') update.weekly_goal = body.weekly_goal
        if (body.password) update.password_hash = await bcrypt.hash(body.password, 10)
        await db.collection('users').updateOne({ id: seg[1] }, { $set: update })
        return json({ ok: true })
      }
      if (seg[1] && !seg[2] && method === 'DELETE') {
        if (me.role !== 'lead_admin') return json({ error: 'forbidden' }, 403)
        const target = await db.collection('users').findOne({ id: seg[1] })
        if (!target) return json({ error: 'not found' }, 404)
        if (target.role === 'lead_admin') return json({ error: 'cannot remove lead admin' }, 403)
        await db.collection('users').deleteOne({ id: seg[1] })
        return json({ ok: true })
      }
    }

    // ============== FEATURES ==============
    if (seg[0] === 'features') {
      if (!seg[1] && method === 'GET') {
        const features = await db.collection('feature_requests').find({}).sort({ pinned: -1, created_at: -1 }).toArray()
        const upvotes = await db.collection('feature_upvotes').find({}).toArray()
        const users = await db.collection('users').find({}).toArray()
        const userMap = new Map(users.map(u => [u.id, { id: u.id, display_name: u.display_name, discord_id: u.discord_id, role: u.role }]))
        const result = features.map(f => {
          const { _id, ...rest } = f
          const fu = upvotes.filter(u => u.feature_id === f.id)
          return {
            ...rest,
            upvote_count: fu.length,
            upvoted_by_me: fu.some(u => u.user_id === me.id),
            submitted_by_user: userMap.get(f.submitted_by) || null,
            claimed_by_user: f.claimed_by ? userMap.get(f.claimed_by) || null : null,
          }
        })
        return json({ features: result })
      }
      if (!seg[1] && method === 'POST') {
        const body = await request.json()
        const { title, description } = body
        const mod = body.module
        if (!title || !description || !mod) return json({ error: 'missing fields' }, 400)
        const f = { id: uuidv4(), title, description, module: mod, priority: 'medium', status: 'pending', submitted_by: me.id, claimed_by: null, pinned: false, created_at: new Date(), updated_at: new Date() }
        await db.collection('feature_requests').insertOne({ ...f })
        return json({ feature: f })
      }
      if (seg[1] && !seg[2] && method === 'PATCH') {
        const body = await request.json()
        const f = await db.collection('feature_requests').findOne({ id: seg[1] })
        if (!f) return json({ error: 'not found' }, 404)
        const update = { updated_at: new Date() }
        if (body.claim === true) {
          if (f.claimed_by) return json({ error: 'already claimed' }, 400)
          update.claimed_by = me.id; update.status = 'claimed'
        }
        if (body.unclaim === true) {
          if (f.claimed_by !== me.id && !isAdmin) return json({ error: 'forbidden' }, 403)
          update.claimed_by = null; update.status = 'pending'
        }
        if (body.status) {
          if (!isAdmin && f.claimed_by !== me.id) return json({ error: 'forbidden' }, 403)
          if (!isAdmin && !['in_progress', 'in_review'].includes(body.status)) return json({ error: 'forbidden status' }, 403)
          update.status = body.status
        }
        if (body.priority) { if (!isAdmin) return json({ error: 'forbidden' }, 403); update.priority = body.priority }
        if (typeof body.pinned === 'boolean') { if (!isAdmin) return json({ error: 'forbidden' }, 403); update.pinned = body.pinned }
        await db.collection('feature_requests').updateOne({ id: seg[1] }, { $set: update })
        return json({ ok: true })
      }
      if (seg[1] && !seg[2] && method === 'DELETE') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        await db.collection('feature_requests').deleteOne({ id: seg[1] })
        await db.collection('feature_upvotes').deleteMany({ feature_id: seg[1] })
        await db.collection('feature_notes').deleteMany({ feature_id: seg[1] })
        return json({ ok: true })
      }
      if (seg[1] && seg[2] === 'upvote' && method === 'POST') {
        const existing = await db.collection('feature_upvotes').findOne({ feature_id: seg[1], user_id: me.id })
        if (existing) {
          await db.collection('feature_upvotes').deleteOne({ feature_id: seg[1], user_id: me.id })
          return json({ upvoted: false })
        }
        await db.collection('feature_upvotes').insertOne({ id: uuidv4(), feature_id: seg[1], user_id: me.id, created_at: new Date() })
        return json({ upvoted: true })
      }
      if (seg[1] && seg[2] === 'notes' && method === 'GET') {
        const notes = await db.collection('feature_notes').find({ feature_id: seg[1] }).sort({ created_at: -1 }).toArray()
        const users = await db.collection('users').find({}).toArray()
        const um = new Map(users.map(u => [u.id, u.display_name]))
        return json({ notes: notes.map(n => { const { _id, ...r } = n; return { ...r, dev_name: um.get(n.dev_id) || 'Unknown' } }) })
      }
      if (seg[1] && seg[2] === 'notes' && method === 'POST') {
        const { note } = await request.json()
        if (!note) return json({ error: 'missing note' }, 400)
        const n = { id: uuidv4(), feature_id: seg[1], dev_id: me.id, note, created_at: new Date() }
        await db.collection('feature_notes').insertOne({ ...n })
        return json({ note: n })
      }
    }

    // ============== SESSIONS ==============
    if (seg[0] === 'sessions') {
      if (seg[1] === 'toggle' && method === 'POST') {
        const active = await db.collection('work_sessions').findOne({ dev_id: me.id, end_time: null })
        if (active) {
          const end = new Date()
          const duration = Math.max(0, Math.floor((end - new Date(active.start_time)) / 60000))
          await db.collection('work_sessions').updateOne({ id: active.id }, { $set: { end_time: end, duration_minutes: duration } })
          return json({ action: 'stopped', duration_minutes: duration })
        }
        const s = { id: uuidv4(), dev_id: me.id, start_time: new Date(), end_time: null, duration_minutes: null, manual: false, manual_reason: null, created_at: new Date() }
        await db.collection('work_sessions').insertOne({ ...s })
        return json({ action: 'started', session: s })
      }
      if (seg[1] === 'active' && method === 'GET') {
        const devId = q.dev_id || me.id
        const active = await db.collection('work_sessions').findOne({ dev_id: devId, end_time: null })
        if (active) delete active._id
        return json({ session: active || null })
      }
      if (seg[1] === 'export' && method === 'GET') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        const filter = {}
        if (q.dev_id) filter.dev_id = q.dev_id
        if (q.from || q.to) {
          filter.start_time = {}
          if (q.from) filter.start_time.$gte = new Date(q.from)
          if (q.to) filter.start_time.$lte = new Date(q.to)
        }
        const sessions = await db.collection('work_sessions').find(filter).sort({ start_time: -1 }).toArray()
        const users = await db.collection('users').find({}).toArray()
        const um = new Map(users.map(u => [u.id, u.display_name]))
        let csv = 'dev_name,dev_id,start_time,end_time,duration_minutes,manual,manual_reason\n'
        for (const s of sessions) {
          const dn = (um.get(s.dev_id) || '').replace(/"/g,'""')
          const reason = (s.manual_reason||'').replace(/"/g,'""')
          csv += `"${dn}","${s.dev_id}","${s.start_time?.toISOString() || ''}","${s.end_time?.toISOString() || ''}","${s.duration_minutes ?? ''}","${s.manual}","${reason}"\n`
        }
        return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="time_logs.csv"' } })
      }
      if (seg[1] === 'manual' && method === 'POST') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        const { dev_id, start_time, end_time, reason } = await request.json()
        if (!dev_id || !start_time || !end_time) return json({ error: 'missing fields' }, 400)
        const start = new Date(start_time)
        const end = new Date(end_time)
        const duration = Math.max(0, Math.floor((end - start) / 60000))
        const s = { id: uuidv4(), dev_id, start_time: start, end_time: end, duration_minutes: duration, manual: true, manual_reason: reason || '', created_at: new Date() }
        await db.collection('work_sessions').insertOne({ ...s })
        return json({ session: s })
      }
      if (seg[1] && !seg[2] && method === 'DELETE') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        await db.collection('work_sessions').deleteOne({ id: seg[1] })
        return json({ ok: true })
      }
      if (!seg[1] && method === 'GET') {
        const filter = {}
        if (q.dev_id) filter.dev_id = q.dev_id
        if (q.from || q.to) {
          filter.start_time = {}
          if (q.from) filter.start_time.$gte = new Date(q.from)
          if (q.to) filter.start_time.$lte = new Date(q.to)
        }
        const sessions = await db.collection('work_sessions').find(filter).sort({ start_time: -1 }).limit(500).toArray()
        const users = await db.collection('users').find({}).toArray()
        const um = new Map(users.map(u => [u.id, u.display_name]))
        return json({ sessions: sessions.map(s => { const { _id, ...r } = s; return { ...r, dev_name: um.get(s.dev_id) || '' } }) })
      }
    }

    // ============== STATS ==============
    if (seg[0] === 'stats' && method === 'GET') {
      const devId = q.dev_id || me.id
      const now = new Date()
      let from = null, to = null
      if (q.range === '7d') from = new Date(now.getTime() - 7 * 86400000)
      else if (q.range === '30d') from = new Date(now.getTime() - 30 * 86400000)
      else if (q.range === 'custom') { from = q.from ? new Date(q.from) : null; to = q.to ? new Date(q.to) : null }
      const sessFilter = { dev_id: devId, end_time: { $ne: null } }
      if (from || to) {
        sessFilter.start_time = {}
        if (from) sessFilter.start_time.$gte = from
        if (to) sessFilter.start_time.$lte = to
      }
      const sessions = await db.collection('work_sessions').find(sessFilter).toArray()
      const totalMin = sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0)
      const longestMin = sessions.reduce((m, x) => Math.max(m, x.duration_minutes || 0), 0)
      const dayCount = from ? Math.max(1, Math.ceil(((to||now) - from) / 86400000)) : 30
      const avgHoursDay = (totalMin / 60) / dayCount
      const claimed = await db.collection('feature_requests').countDocuments({ claimed_by: devId })
      const shipped = await db.collection('feature_requests').countDocuments({ claimed_by: devId, status: 'shipped' })
      const submitted = await db.collection('feature_requests').countDocuments({ submitted_by: devId })
      const sod = new Date(); sod.setHours(0,0,0,0)
      const sow = new Date(); sow.setDate(sow.getDate() - sow.getDay()); sow.setHours(0,0,0,0)
      const todayS = await db.collection('work_sessions').find({ dev_id: devId, start_time: { $gte: sod }, end_time: { $ne: null } }).toArray()
      const weekS = await db.collection('work_sessions').find({ dev_id: devId, start_time: { $gte: sow }, end_time: { $ne: null } }).toArray()
      const todayMin = todayS.reduce((s, x) => s + (x.duration_minutes || 0), 0)
      const weekMin = weekS.reduce((s, x) => s + (x.duration_minutes || 0), 0)
      return json({ total_minutes: totalMin, total_hours: +(totalMin/60).toFixed(1), longest_session_minutes: longestMin, avg_hours_per_day: +avgHoursDay.toFixed(2), sessions_count: sessions.length, features_claimed: claimed, features_shipped: shipped, features_submitted: submitted, today_minutes: todayMin, week_minutes: weekMin })
    }

    // ============== LEADERBOARD ==============
    if (seg[0] === 'leaderboard' && method === 'GET') {
      const metric = q.metric || 'hours'
      const range = q.range || 'month'
      let from = null
      if (range === 'month') { const now = new Date(); from = new Date(now.getFullYear(), now.getMonth(), 1) }
      const users = await db.collection('users').find({ active: true }).toArray()
      const result = []
      for (const u of users) {
        if (metric === 'hours') {
          const sf = { dev_id: u.id, end_time: { $ne: null } }
          if (from) sf.start_time = { $gte: from }
          const sessions = await db.collection('work_sessions').find(sf).toArray()
          const min = sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0)
          result.push({ user: cleanUser(u), value: min / 60, label: `${(min/60).toFixed(1)}h` })
        } else {
          const ff = { claimed_by: u.id, status: 'shipped' }
          if (from) ff.updated_at = { $gte: from }
          const count = await db.collection('feature_requests').countDocuments(ff)
          result.push({ user: cleanUser(u), value: count, label: `${count}` })
        }
      }
      result.sort((a, b) => b.value - a.value)
      return json({ leaderboard: result })
    }

    // ============== CHANGELOG (auth POST/PATCH/DELETE) ==============
    if (seg[0] === 'changelog') {
      if (!seg[1] && method === 'POST') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        const { feature_id, title, description, version_tag, module_tags } = await request.json()
        if (!title || !description) return json({ error: 'missing fields' }, 400)
        const e = { id: uuidv4(), feature_id: feature_id || null, title, description, version_tag: version_tag || null, module_tags: module_tags || [], created_at: new Date() }
        await db.collection('changelog_entries').insertOne({ ...e })
        return json({ entry: e })
      }
      if (seg[1] && method === 'DELETE') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        await db.collection('changelog_entries').deleteOne({ id: seg[1] })
        return json({ ok: true })
      }
      if (seg[1] && method === 'PATCH') {
        if (!isAdmin) return json({ error: 'forbidden' }, 403)
        const body = await request.json()
        const update = {}
        for (const k of ['title','description','version_tag','module_tags']) if (k in body) update[k] = body[k]
        await db.collection('changelog_entries').updateOne({ id: seg[1] }, { $set: update })
        return json({ ok: true })
      }
    }

    // ============== OVERVIEW ==============
    if (seg[0] === 'overview' && method === 'GET') {
      if (!isAdmin) return json({ error: 'forbidden' }, 403)
      const now = new Date()
      const sow = new Date(); sow.setDate(now.getDate() - now.getDay()); sow.setHours(0,0,0,0)
      const som = new Date(now.getFullYear(), now.getMonth(), 1)
      const users = await db.collection('users').find({ active: true }).toArray()
      const out = []
      for (const u of users) {
        const ws = await db.collection('work_sessions').find({ dev_id: u.id, start_time: { $gte: sow }, end_time: { $ne: null } }).toArray()
        const wmin = ws.reduce((s, x) => s + (x.duration_minutes || 0), 0)
        const active = await db.collection('work_sessions').findOne({ dev_id: u.id, end_time: null })
        const mShipped = await db.collection('feature_requests').countDocuments({ claimed_by: u.id, status: 'shipped', updated_at: { $gte: som } })
        out.push({ user: cleanUser(u), week_minutes: wmin, on_duty: !!active, on_duty_since: active?.start_time || null, month_shipped: mShipped })
      }
      return json({ overview: out })
    }

    return json({ error: `Route /${seg.join('/')} not found` }, 404)
  } catch (err) {
    console.error('API Error:', err)
    return json({ error: 'Internal server error', detail: err.message }, 500)
  }
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 200 })
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Credentials', 'true')
  return res
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
