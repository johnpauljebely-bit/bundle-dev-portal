import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const COOKIE_NAME = 'bundle_auth'
const LEAD_ADMIN_DISCORD_ID = '1349737404449296414'
const LEAD_ADMIN_NAME = 'Vance'

// ============== MONGO CONNECTION (serverless-safe) ==============
// Cache the connection promise on globalThis so warm Lambda/Vercel containers
// reuse a single MongoClient across all invocations.
const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'bundle'

if (!MONGO_URL) {
  console.error('[STARTUP] MONGO_URL env var is NOT set. Database calls will fail.')
}

async function getDb() {
  if (!process.env.MONGO_URL) {
    const err = new Error('MONGO_URL is not configured. Set it in Vercel → Project → Settings → Environment Variables.')
    err.code = 'MONGO_URL_MISSING'
    throw err
  }
  if (!globalThis._bundleMongoClientPromise) {
    console.log('[MONGO] Creating new MongoClient connection (cold start)')
    const client = new MongoClient(process.env.MONGO_URL, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    })
    globalThis._bundleMongoClientPromise = client.connect()
      .then(c => {
        console.log('[MONGO] Connected successfully')
        return c
      })
      .catch(err => {
        console.error('[MONGO] Connection failed:', err?.message, err?.code)
        globalThis._bundleMongoClientPromise = null  // allow retry on next request
        throw err
      })
  }
  const client = await globalThis._bundleMongoClientPromise
  const db = client.db(process.env.DB_NAME || 'bundle')
  if (!globalThis._bundleIndexesReady) {
    globalThis._bundleIndexesReady = true
    ;(async () => {
      try {
        await db.collection('users').createIndex({ discord_id: 1 }, { unique: true })
        await db.collection('feature_upvotes').createIndex({ feature_id: 1, user_id: 1 }, { unique: true })
        await db.collection('work_sessions').createIndex({ dev_id: 1, start_time: -1 })
      } catch (e) { /* indexes likely already exist */ }
    })()
  }
  return db
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

const STALE_SESSION_HOURS = 12

async function autoCleanupStaleSessions(db) {
  const cutoff = new Date(Date.now() - STALE_SESSION_HOURS * 3600 * 1000)
  const stale = await db.collection('work_sessions').find({ end_time: null, start_time: { $lt: cutoff } }).toArray()
  for (const s of stale) {
    const start = new Date(s.start_time)
    const end = new Date(start.getTime() + STALE_SESSION_HOURS * 3600 * 1000)
    await db.collection('work_sessions').updateOne(
      { id: s.id },
      { $set: { end_time: end, duration_minutes: STALE_SESSION_HOURS * 60, manual: true, manual_reason: `Auto-stopped after ${STALE_SESSION_HOURS}h (forgot to clock out)` } }
    )
  }
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

// ============== DISCORD WEBHOOK ==============
async function getSettings(db) {
  let s = await db.collection('settings').findOne({ id: 'app-settings' })
  if (!s) {
    s = { id: 'app-settings', discord_webhook_url: '', notifications_enabled: true }
    await db.collection('settings').insertOne({ ...s })
  }
  const { _id, ...rest } = s
  return rest
}

const STATUS_META = {
  pending:     { emoji: '📋', color: 9807270,  label: 'Pending' },
  claimed:     { emoji: '🙌', color: 5793266,  label: 'Claimed' },
  in_progress: { emoji: '🔨', color: 16312092, label: 'In Progress' },
  in_review:   { emoji: '👀', color: 10181046, label: 'In Review' },
  shipped:     { emoji: '🚢', color: 5763719,  label: 'Shipped' },
  rejected:    { emoji: '🚫', color: 15548997, label: 'Rejected' },
}
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', critical: '🔥 Critical' }

function notifyFeatureChange(db, payload) {
  // Fire-and-forget — never block the request
  ;(async () => {
    try {
      const settings = await getSettings(db)
      if (!settings.notifications_enabled || !settings.discord_webhook_url) return
      const { feature, oldFeature, actor, type } = payload
      const meta = STATUS_META[feature.status] || STATUS_META.pending
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
      const url = `${baseUrl}/features/${feature.id}`
      const users = await db.collection('users').find({}).toArray()
      const um = new Map(users.map(u => [u.id, u]))
      const submitter = um.get(feature.submitted_by)
      const claimer = feature.claimed_by ? um.get(feature.claimed_by) : null

      let title, description
      if (type === 'status_change') {
        const oldMeta = STATUS_META[oldFeature.status] || STATUS_META.pending
        title = `${meta.emoji} ${feature.title}`
        description = `**Status:** ${oldMeta.label} → **${meta.label}**`
      } else if (type === 'claimed') {
        title = `🙌 Claimed: ${feature.title}`
        description = `**${claimer?.display_name || 'Someone'}** claimed this feature`
      } else if (type === 'unclaimed') {
        title = `↩️ Unclaimed: ${feature.title}`
        description = `Back in the pool — anyone can pick it up`
      } else if (type === 'created') {
        title = `✨ New feature request: ${feature.title}`
        description = feature.description.length > 200 ? feature.description.slice(0, 200) + '…' : feature.description
      } else if (type === 'pinned') {
        title = `📌 Pinned: ${feature.title}`
        description = `Featured at the top of the feature wall`
      } else {
        return
      }

      const fields = [
        { name: 'Module', value: feature.module, inline: true },
        { name: 'Priority', value: PRIORITY_LABELS[feature.priority] || feature.priority, inline: true },
      ]
      if (claimer) fields.push({ name: 'Claimed by', value: claimer.display_name, inline: true })

      const body = {
        username: 'Bundle Dev Portal',
        embeds: [{
          title: title.slice(0, 256),
          description: description.slice(0, 2048),
          color: meta.color,
          url,
          fields,
          author: submitter ? { name: `Submitted by ${submitter.display_name}` } : undefined,
          footer: { text: actor ? `Action by ${actor.display_name}` : 'Bundle' },
          timestamp: new Date().toISOString(),
        }]
      }
      await fetch(settings.discord_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      console.error('Discord webhook failed:', e?.message)
    }
  })()
}

// ============== WEEKLY RECAP ==============
async function buildWeeklyRecap(db) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const users = await db.collection('users').find({ active: true }).toArray()
  const um = new Map(users.map(u => [u.id, u]))
  const sessions = await db.collection('work_sessions').find({ start_time: { $gte: weekAgo }, end_time: { $ne: null } }).toArray()
  const hoursByUser = {}
  let totalMin = 0
  for (const s of sessions) {
    hoursByUser[s.dev_id] = (hoursByUser[s.dev_id] || 0) + (s.duration_minutes || 0)
    totalMin += (s.duration_minutes || 0)
  }
  const top = Object.entries(hoursByUser).map(([id, min]) => ({ user: um.get(id), minutes: min })).filter(x => x.user).sort((a,b) => b.minutes - a.minutes).slice(0, 5)
  const shipped = await db.collection('feature_requests').find({ status: 'shipped', updated_at: { $gte: weekAgo } }).toArray()
  const newSubmitted = await db.collection('feature_requests').find({ created_at: { $gte: weekAgo } }).toArray()
  const inProgress = await db.collection('feature_requests').find({ status: { $in: ['claimed', 'in_progress', 'in_review'] } }).toArray()
  return { totalMin, top, shipped, newSubmitted, inProgress, weekAgo, now }
}

async function sendWeeklyRecap(db) {
  const settings = await getSettings(db)
  if (!settings.discord_webhook_url) return { error: 'No webhook configured' }
  const recap = await buildWeeklyRecap(db)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
  const totalHours = (recap.totalMin / 60).toFixed(1)
  const fields = []
  if (recap.top.length > 0) {
    fields.push({
      name: '🏆 Top contributors',
      value: recap.top.map((t, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`
        return `${medal} **${t.user.display_name}** — ${(t.minutes/60).toFixed(1)}h`
      }).join('\n'),
      inline: false,
    })
  }
  if (recap.shipped.length > 0) fields.push({ name: `🚢 Shipped (${recap.shipped.length})`, value: recap.shipped.slice(0, 8).map(f => `• ${f.title}`).join('\n').slice(0, 1024), inline: false })
  if (recap.newSubmitted.length > 0) fields.push({ name: `✨ New requests (${recap.newSubmitted.length})`, value: recap.newSubmitted.slice(0, 8).map(f => `• ${f.title}`).join('\n').slice(0, 1024), inline: false })
  if (recap.inProgress.length > 0) fields.push({ name: `🔨 In flight (${recap.inProgress.length})`, value: recap.inProgress.slice(0, 8).map(f => `• ${f.title}`).join('\n').slice(0, 1024), inline: false })
  const body = {
    username: 'Bundle Dev Portal',
    embeds: [{
      title: `📊 Bundle weekly recap`,
      description: `**${totalHours}h** logged across the team this week.\n${recap.weekAgo.toLocaleDateString()} → ${recap.now.toLocaleDateString()}`,
      color: 6011838,
      url: `${baseUrl}/dashboard`,
      fields,
      footer: { text: 'Bundle Dev Portal' },
      timestamp: recap.now.toISOString(),
    }]
  }
  try {
    const r = await fetch(settings.discord_webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) return { error: `Discord returned ${r.status}` }
    await db.collection('settings').updateOne({ id: 'app-settings' }, { $set: { last_recap_sent_at: new Date() } })
    return { ok: true, totals: { total_minutes: recap.totalMin, shipped: recap.shipped.length, new: recap.newSubmitted.length, in_progress: recap.inProgress.length } }
  } catch (e) {
    return { error: e.message }
  }
}

async function maybeSendScheduledRecap(db) {
  try {
    const s = await getSettings(db)
    if (!s.weekly_recap_enabled || !s.discord_webhook_url || !s.notifications_enabled) return
    const last = s.last_recap_sent_at ? new Date(s.last_recap_sent_at) : null
    const now = new Date()
    if (last && (now - last) < 7 * 86400000) return
    if (now.getUTCDay() !== 1) return
    await sendWeeklyRecap(db)
  } catch (e) { console.error('Auto recap failed:', e?.message) }
}

// ============== MENTION PARSING ==============
function parseMentions(noteText, users) {
  if (!noteText || !users || users.length === 0) return []
  const mentioned = []
  const sorted = [...users].sort((a,b) => b.display_name.length - a.display_name.length)
  for (const u of sorted) {
    const escaped = u.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`@${escaped}(?=\\s|$|[.,!?;:])`, 'i')
    if (re.test(noteText)) mentioned.push(u)
  }
  return mentioned
}

function notifyMention(db, { feature, note, actor, mentionedUsers }) {
  ;(async () => {
    try {
      const settings = await getSettings(db)
      if (!settings.notifications_enabled || !settings.discord_webhook_url) return
      if (mentionedUsers.length === 0) return
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
      const pingContent = mentionedUsers.map(u => `<@${u.discord_id}>`).join(' ')
      const body = {
        username: 'Bundle Dev Portal',
        content: pingContent,
        allowed_mentions: { parse: ['users'], users: mentionedUsers.map(u => u.discord_id) },
        embeds: [{
          title: `💬 New mention in: ${feature.title}`,
          description: `**${actor.display_name}** wrote:\n\n>>> ${note.length > 800 ? note.slice(0, 800) + '…' : note}`,
          color: 5793266,
          url: `${baseUrl}/features/${feature.id}`,
          footer: { text: `In feature: ${feature.title}` },
          timestamp: new Date().toISOString(),
        }]
      }
      await fetch(settings.discord_webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch (e) { console.error('Mention webhook failed:', e?.message) }
  })()
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
        try {
          const { identifier, password } = await request.json()
          if (!identifier || !password) return json({ error: 'Missing credentials' }, 400)
          // Lead admin path
          if (identifier === LEAD_ADMIN_NAME || identifier === LEAD_ADMIN_DISCORD_ID) {
            if (password !== process.env.LEAD_ADMIN_PASSWORD) {
              console.log('[AUTH] Lead admin login: wrong password for identifier=', identifier)
              return json({ error: 'Invalid credentials' }, 401)
            }
            if (!process.env.LEAD_ADMIN_PASSWORD) {
              console.error('[AUTH] LEAD_ADMIN_PASSWORD env var is not set')
              return json({ error: 'Server not configured: LEAD_ADMIN_PASSWORD missing' }, 500)
            }
            let user = await db.collection('users').findOne({ discord_id: LEAD_ADMIN_DISCORD_ID })
            if (!user) {
              user = { id: uuidv4(), discord_id: LEAD_ADMIN_DISCORD_ID, display_name: LEAD_ADMIN_NAME, password_hash: null, role: 'lead_admin', active: true, daily_goal: 4, weekly_goal: 25, created_at: new Date() }
              await db.collection('users').insertOne({ ...user })
              console.log('[AUTH] Lead admin auto-seeded:', user.id)
            } else if (user.role !== 'lead_admin' || !user.active) {
              await db.collection('users').updateOne({ id: user.id }, { $set: { role: 'lead_admin', active: true } })
              user.role = 'lead_admin'; user.active = true
            }
            if (!process.env.JWT_SECRET) {
              console.error('[AUTH] JWT_SECRET env var is not set')
              return json({ error: 'Server not configured: JWT_SECRET missing' }, 500)
            }
            const token = signToken(user)
            console.log('[AUTH] Lead admin login OK:', user.id)
            return setCookie(json({ user: cleanUser(user) }), token)
          }
          const dbUser = await db.collection('users').findOne({ $or: [{ display_name: identifier }, { discord_id: identifier }] })
          if (!dbUser || !dbUser.active) {
            console.log('[AUTH] Login: user not found or inactive, identifier=', identifier)
            return json({ error: 'Invalid credentials' }, 401)
          }
          if (!dbUser.password_hash) {
            console.log('[AUTH] Login: user has no password_hash:', dbUser.id)
            return json({ error: 'Invalid credentials' }, 401)
          }
          const ok = await bcrypt.compare(password, dbUser.password_hash)
          if (!ok) {
            console.log('[AUTH] Login: bcrypt mismatch for', dbUser.id)
            return json({ error: 'Invalid credentials' }, 401)
          }
          if (dbUser.role === 'developer') {
            const lOk = await checkLanyard(dbUser.discord_id)
            if (!lOk) {
              console.log('[AUTH] Login: lanyard gate failed for', dbUser.id)
              return json({ error: 'lanyard_required', message: 'You need to join the Lanyard Discord server to use this portal.', invite: 'https://discord.com/invite/lanyard' }, 403)
            }
          }
          if (!process.env.JWT_SECRET) {
            console.error('[AUTH] JWT_SECRET env var is not set')
            return json({ error: 'Server not configured: JWT_SECRET missing' }, 500)
          }
          const token = signToken(dbUser)
          console.log('[AUTH] Login OK:', dbUser.id, dbUser.role)
          return setCookie(json({ user: cleanUser(dbUser) }), token)
        } catch (e) {
          console.error('[AUTH] Login error:', e?.message, '| code:', e?.code, '| stack:', e?.stack)
          return json({ error: 'Login failed', detail: e?.message || 'unknown', code: e?.code || 'unknown' }, 500)
        }
      }
      if (seg[1] === 'logout' && method === 'POST') {
        return clearCookie(json({ ok: true }))
      }
      if (seg[1] === 'me' && method === 'GET') {
        const u = await getCurrentUser(request)
        if (!u) return json({ user: null }, 401)
        return json({ user: u })
      }

      // ===== DISCORD OAUTH START =====
      if (seg[1] === 'discord' && seg[2] === 'start' && method === 'GET') {
        try {
          const clientId = process.env.DISCORD_CLIENT_ID
          const clientSecret = process.env.DISCORD_CLIENT_SECRET
          const origin = new URL(request.url).origin
          const redirectUri = process.env.DISCORD_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || origin}/api/auth/discord/callback`

          const missing = []
          if (!clientId) missing.push('DISCORD_CLIENT_ID')
          if (!clientSecret) missing.push('DISCORD_CLIENT_SECRET')
          if (missing.length > 0) {
            console.error('[DISCORD_OAUTH] /start missing env vars:', missing.join(', '))
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || origin}/login?discord_error=not_configured&missing=${encodeURIComponent(missing.join(','))}`)
          }
          console.log('[DISCORD_OAUTH] /start redirect_uri=', redirectUri)
          const state = uuidv4()
          const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${state}&prompt=none`
          const res = NextResponse.redirect(oauthUrl)
          res.cookies.set('discord_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600, secure: true })
          return res
        } catch (e) {
          console.error('[DISCORD_OAUTH] /start error:', e?.message, '| stack:', e?.stack)
          const origin = (() => { try { return new URL(request.url).origin } catch { return '' } })()
          return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || origin}/login?discord_error=unexpected`)
        }
      }

      // ===== DISCORD OAUTH CALLBACK =====
      if (seg[1] === 'discord' && seg[2] === 'callback' && method === 'GET') {
        const origin = (() => { try { return new URL(request.url).origin } catch { return '' } })()
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || origin
        try {
          const code = q.code
          const state = q.state
          const clientId = process.env.DISCORD_CLIENT_ID
          const clientSecret = process.env.DISCORD_CLIENT_SECRET
          const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl}/api/auth/discord/callback`

          if (!clientId || !clientSecret) {
            console.error('[DISCORD_OAUTH] /callback missing env vars: clientId?', !!clientId, 'clientSecret?', !!clientSecret)
            return NextResponse.redirect(`${baseUrl}/login?discord_error=not_configured`)
          }

          const cookieState = (request.headers.get('cookie') || '').match(/discord_oauth_state=([^;]+)/)?.[1]
          if (!code || !state || state !== cookieState) {
            console.warn('[DISCORD_OAUTH] /callback bad state: hasCode=', !!code, 'hasState=', !!state, 'matchesCookie=', state === cookieState)
            return NextResponse.redirect(`${baseUrl}/login?discord_error=bad_state`)
          }
          const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
          })
          if (!tokenRes.ok) {
            const body = await tokenRes.text().catch(() => '')
            console.error('[DISCORD_OAUTH] token exchange failed:', tokenRes.status, body)
            return NextResponse.redirect(`${baseUrl}/login?discord_error=token_exchange`)
          }
          const tokenData = await tokenRes.json()
          const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } })
          if (!meRes.ok) {
            const body = await meRes.text().catch(() => '')
            console.error('[DISCORD_OAUTH] /users/@me failed:', meRes.status, body)
            return NextResponse.redirect(`${baseUrl}/login?discord_error=fetch_user`)
          }
          const discordUser = await meRes.json()
          console.log('[DISCORD_OAUTH] Discord user resolved:', discordUser.id, discordUser.username)
          const dbUser = await db.collection('users').findOne({ discord_id: discordUser.id })
          if (!dbUser) {
            console.log('[DISCORD_OAUTH] No account for discord_id=', discordUser.id)
            return NextResponse.redirect(`${baseUrl}/login?discord_error=no_account&discord_username=${encodeURIComponent(discordUser.username)}`)
          }
          if (!dbUser.active) {
            console.log('[DISCORD_OAUTH] Account deactivated:', dbUser.id)
            return NextResponse.redirect(`${baseUrl}/login?discord_error=deactivated`)
          }
          if (dbUser.role === 'developer') {
            const lOk = await checkLanyard(dbUser.discord_id)
            if (!lOk) {
              console.log('[DISCORD_OAUTH] Lanyard gate failed for dev:', dbUser.id)
              return NextResponse.redirect(`${baseUrl}/login?discord_error=lanyard`)
            }
          }
          await db.collection('users').updateOne({ id: dbUser.id }, { $set: {
            discord_access_token: tokenData.access_token,
            discord_refresh_token: tokenData.refresh_token,
            discord_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 0) * 1000),
            discord_username: discordUser.username,
            discord_avatar: discordUser.avatar,
          } })
          if (!process.env.JWT_SECRET) {
            console.error('[DISCORD_OAUTH] JWT_SECRET env var is not set')
            return NextResponse.redirect(`${baseUrl}/login?discord_error=not_configured&missing=JWT_SECRET`)
          }
          const token = signToken(dbUser)
          console.log('[DISCORD_OAUTH] Login OK:', dbUser.id, dbUser.role)
          const res = NextResponse.redirect(`${baseUrl}/dashboard`)
          res.cookies.set(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30, secure: true })
          res.cookies.set('discord_oauth_state', '', { httpOnly: true, path: '/', maxAge: 0 })
          return res
        } catch (e) {
          console.error('[DISCORD_OAUTH] /callback unexpected error:', e?.message, '| code:', e?.code, '| stack:', e?.stack)
          return NextResponse.redirect(`${baseUrl}/login?discord_error=unexpected&detail=${encodeURIComponent(e?.message || 'unknown')}`)
        }
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
        // Lite mode for dropdowns/avatars — minimal fields
        const lite = q.lite === '1'
        const projection = lite ? { id: 1, discord_id: 1, display_name: 1, role: 1, active: 1, _id: 0 } : { _id: 0, password_hash: 0 }
        const users = await db.collection('users').find({}).project(projection).sort({ created_at: -1 }).toArray()
        return json({ users })
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
        notifyFeatureChange(db, { feature: f, actor: me, type: 'created' })
        return json({ feature: f })
      }
      if (seg[1] && !seg[2] && method === 'GET') {
        const f = await db.collection('feature_requests').findOne({ id: seg[1] })
        if (!f) return json({ error: 'not found' }, 404)
        const upvotes = await db.collection('feature_upvotes').find({ feature_id: f.id }).toArray()
        const users = await db.collection('users').find({}).toArray()
        const um = new Map(users.map(u => [u.id, { id: u.id, display_name: u.display_name, discord_id: u.discord_id, role: u.role }]))
        const { _id, ...rest } = f
        return json({ feature: { ...rest, upvote_count: upvotes.length, upvoted_by_me: upvotes.some(u => u.user_id === me.id), submitted_by_user: um.get(f.submitted_by) || null, claimed_by_user: f.claimed_by ? um.get(f.claimed_by) || null : null } })
      }
      if (seg[1] && seg[2] === 'upvoters' && method === 'GET') {
        const upvotes = await db.collection('feature_upvotes').find({ feature_id: seg[1] }).sort({ created_at: 1 }).toArray()
        const users = await db.collection('users').find({}).toArray()
        const um = new Map(users.map(u => [u.id, u]))
        return json({ upvoters: upvotes.map(uv => { const u = um.get(uv.user_id); return u ? { id: u.id, display_name: u.display_name, discord_id: u.discord_id, role: u.role, upvoted_at: uv.created_at } : null }).filter(Boolean) })
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
        // Build updated feature for notification
        const updatedFeature = { ...f, ...update }
        const events = []
        if (update.claimed_by && update.claimed_by !== f.claimed_by) events.push('claimed')
        if (update.claimed_by === null && f.claimed_by !== null) events.push('unclaimed')
        if (update.status && update.status !== f.status) events.push('status_change')
        if (typeof body.pinned === 'boolean' && body.pinned && !f.pinned) events.push('pinned')
        for (const ev of events) {
          notifyFeatureChange(db, { feature: updatedFeature, oldFeature: f, actor: me, type: ev })
        }
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
        const allUsers = await db.collection('users').find({ active: true }).toArray()
        const mentionedUsers = parseMentions(note, allUsers)
        const n = { id: uuidv4(), feature_id: seg[1], dev_id: me.id, note, mentioned_user_ids: mentionedUsers.map(u => u.id), created_at: new Date() }
        await db.collection('feature_notes').insertOne({ ...n })
        if (mentionedUsers.length > 0) {
          const feature = await db.collection('feature_requests').findOne({ id: seg[1] })
          if (feature) notifyMention(db, { feature, note, actor: me, mentionedUsers })
        }
        return json({ note: n, mentioned: mentionedUsers.map(u => ({ id: u.id, display_name: u.display_name })) })
      }
    }

    // ============== SESSIONS ==============
    if (seg[0] === 'sessions') {
      await autoCleanupStaleSessions(db)
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
      await autoCleanupStaleSessions(db)
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
      await autoCleanupStaleSessions(db)
      maybeSendScheduledRecap(db)  // lazy cron — fire-and-forget
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

    // ============== SETTINGS (admin) ==============
    if (seg[0] === 'settings') {
      if (!isAdmin) return json({ error: 'forbidden' }, 403)
      if (!seg[1] && method === 'GET') {
        const s = await getSettings(db)
        return json({ settings: s })
      }
      if (!seg[1] && method === 'PATCH') {
        const body = await request.json()
        const update = {}
        if (typeof body.discord_webhook_url === 'string') update.discord_webhook_url = body.discord_webhook_url
        if (typeof body.notifications_enabled === 'boolean') update.notifications_enabled = body.notifications_enabled
        if (typeof body.weekly_recap_enabled === 'boolean') update.weekly_recap_enabled = body.weekly_recap_enabled
        await db.collection('settings').updateOne({ id: 'app-settings' }, { $set: update }, { upsert: true })
        const s = await getSettings(db)
        return json({ settings: s })
      }
      if (seg[1] === 'test-webhook' && method === 'POST') {
        const s = await getSettings(db)
        if (!s.discord_webhook_url) return json({ error: 'No webhook configured' }, 400)
        try {
          const r = await fetch(s.discord_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: 'Bundle Dev Portal',
              embeds: [{
                title: '✅ Webhook test successful',
                description: `Hello from **${me.display_name}**! This webhook is wired up correctly.`,
                color: 5793266,
                timestamp: new Date().toISOString(),
              }]
            })
          })
          if (!r.ok) return json({ error: `Discord returned ${r.status}` }, 400)
          return json({ ok: true })
        } catch (e) {
          return json({ error: e.message }, 500)
        }
      }
      if (seg[1] === 'send-recap' && method === 'POST') {
        const r = await sendWeeklyRecap(db)
        if (r.error) return json({ error: r.error }, 400)
        return json(r)
      }
      if (seg[1] === 'recap-preview' && method === 'GET') {
        const r = await buildWeeklyRecap(db)
        return json({ total_minutes: r.totalMin, total_hours: +(r.totalMin/60).toFixed(1), top: r.top.map(t => ({ display_name: t.user.display_name, minutes: t.minutes })), shipped_count: r.shipped.length, new_count: r.newSubmitted.length, in_progress_count: r.inProgress.length, shipped_titles: r.shipped.map(f => f.title), new_titles: r.newSubmitted.map(f => f.title) })
      }
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
