import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

export function FeatureCardSkeleton() {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-8 w-14 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
    </Card>
  )
}

export function FeatureGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => <FeatureCardSkeleton key={i} />)}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-7 w-16" />
    </Card>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-32" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <StatCardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-2 w-full" /></Card>
        <Card className="p-5"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-2 w-full" /></Card>
      </div>
    </div>
  )
}

export function DevGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function LeaderboardSkeleton({ count = 6 }) {
  return (
    <Card className="p-2 divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div>
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </Card>
  )
}

export function ChangelogSkeleton({ count = 3 }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-6 space-y-3">
          <div className="flex items-center gap-2"><Skeleton className="h-5 w-14" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </Card>
      ))}
    </div>
  )
}
