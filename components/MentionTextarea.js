'use client'
import { useState, useRef } from 'react'
import useSWR from 'swr'
import { Textarea } from '@/components/ui/textarea'

const fetcher = (u) => fetch(u).then(r => r.json())

export function MentionTextarea({ value, onChange, placeholder, rows = 2, onKeyDown, className = '' }) {
  const ref = useRef(null)
  const [query, setQuery] = useState(null) // null when not mentioning; string when actively typing after '@'
  const [position, setPosition] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const { data } = useSWR('/api/users?lite=1', fetcher, { dedupingInterval: 60000 })
  const users = (data?.users || []).filter(u => u.active)

  function handleChange(e) {
    const v = e.target.value
    const cursor = e.target.selectionStart ?? v.length
    onChange(v)
    const before = v.slice(0, cursor)
    const lastAt = before.lastIndexOf('@')
    if (lastAt === -1) { setQuery(null); return }
    // Stop if char before @ isn't whitespace or start (avoid emails)
    if (lastAt > 0 && !/\s/.test(before[lastAt - 1])) { setQuery(null); return }
    const after = before.slice(lastAt + 1)
    if (/\n/.test(after) || after.length > 40) { setQuery(null); return }
    setQuery(after.toLowerCase())
    setPosition(lastAt)
    setActiveIdx(0)
  }

  function selectUser(u) {
    if (query === null) return
    const before = value.slice(0, position)
    const after = value.slice(position + 1 + query.length)
    const newVal = before + '@' + u.display_name + ' ' + after
    onChange(newVal)
    setQuery(null)
    setTimeout(() => {
      ref.current?.focus()
      const newCursor = (before + '@' + u.display_name + ' ').length
      ref.current?.setSelectionRange?.(newCursor, newCursor)
    }, 10)
  }

  const filtered = query !== null
    ? users.filter(u => u.display_name.toLowerCase().includes(query)).slice(0, 6)
    : []

  function handleKeyDown(e) {
    if (query !== null && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectUser(filtered[activeIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return }
    }
    if (onKeyDown) onKeyDown(e)
  }

  return (
    <div className="relative w-full">
      <Textarea ref={ref} value={value} onChange={handleChange} placeholder={placeholder} rows={rows} onKeyDown={handleKeyDown} className={`resize-none ${className}`} />
      {query !== null && filtered.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 bg-popover border border-border rounded-md shadow-xl p-1 z-50 min-w-[220px] max-w-[300px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Mention a teammate</div>
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectUser(u) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${i === activeIdx ? 'bg-secondary' : 'hover:bg-secondary/60'}`}
            >
              <span className="font-medium truncate">{u.display_name}</span>
              <span className="text-[10px] text-muted-foreground capitalize flex-shrink-0">{u.role.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Render a note string, converting @DisplayName matches into clickable pills
export function renderNoteWithMentions(note, users, LinkComponent) {
  if (!note) return note
  if (!users || users.length === 0) return note
  const sorted = [...users].sort((a, b) => b.display_name.length - a.display_name.length)
  const escaped = sorted.map(u => u.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp('@(' + escaped.join('|') + ')(?=\\s|$|[.,!?;:])', 'gi')
  const result = []
  let lastEnd = 0
  let m
  let key = 0
  while ((m = regex.exec(note)) !== null) {
    if (m.index > lastEnd) result.push(<span key={key++}>{note.slice(lastEnd, m.index)}</span>)
    const matchedName = m[1]
    const user = sorted.find(u => u.display_name.toLowerCase() === matchedName.toLowerCase())
    if (user && LinkComponent) {
      result.push(
        <LinkComponent key={key++} href={`/devs/${user.id}`} className="text-primary bg-primary/15 rounded px-1 hover:bg-primary/25 font-medium transition-colors">
          @{user.display_name}
        </LinkComponent>
      )
    } else {
      result.push(<span key={key++}>{m[0]}</span>)
    }
    lastEnd = m.index + m[0].length
  }
  if (lastEnd < note.length) result.push(<span key={key++}>{note.slice(lastEnd)}</span>)
  return result
}
