'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BundleLogo } from '@/components/BundleLogo'
import { FileText, ArrowLeft } from 'lucide-react'

const fetcher = (u) => fetch(u).then(r => r.json())

export default function ChangelogPage() {
  const { data: meData } = useSWR('/api/auth/me', fetcher, { revalidateOnFocus: false })
  const { data } = useSWR('/api/changelog', fetcher)
  const entries = data?.entries || []
  const isAuthed = !!meData?.user
  return (
    <div className="min-h-screen bg-background bg-grid">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BundleLogo className="h-9 w-9" />
            <div>
              <div className="font-bold">Bundle</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Changelog</div>
            </div>
          </Link>
          <Link href={isAuthed ? '/dashboard' : '/login'} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> {isAuthed ? 'Back to dashboard' : 'Sign in'}
          </Link>
        </div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight"><span className="gradient-text">What’s new</span></h1>
          <p className="text-muted-foreground mt-2">Latest features, improvements and fixes shipped to Bundle.</p>
        </div>
        <div className="space-y-5">
          {entries.length === 0 && (
            <Card className="p-10 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              No changelog entries yet — stay tuned.
            </Card>
          )}
          {entries.map(e => (
            <Card key={e.id} className="p-6">
              <div className="flex items-center gap-2 mb-2">
                {e.version_tag && <Badge className="bg-primary/15 text-primary border border-primary/30" variant="outline">{e.version_tag}</Badge>}
                <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <h2 className="text-xl font-semibold">{e.title}</h2>
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{e.description}</p>
              {e.module_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {e.module_tags.map(m => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
