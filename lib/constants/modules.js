export const BUNDLE_MODULES = [
  'Moderation', 'Logging', 'Tickets', 'Economy', 'Leveling',
  'Utility', 'Fun', 'Welcomer', 'Automod', 'Giveaways',
  'Polls', 'Reaction Roles', 'Starboard', 'Music'
]

export const PRIORITIES = ['low', 'medium', 'high', 'critical']
export const STATUSES = ['pending', 'claimed', 'in_progress', 'in_review', 'shipped', 'rejected']

export const PRIORITY_COLORS = {
  low: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  medium: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
}

export const STATUS_COLORS = {
  pending: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  claimed: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  in_progress: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  in_review: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  shipped: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
}

export const STATUS_LABELS = {
  pending: 'Pending', claimed: 'Claimed', in_progress: 'In Progress',
  in_review: 'In Review', shipped: 'Shipped', rejected: 'Rejected'
}

export const ROLE_LABELS = {
  lead_admin: 'Lead Admin', admin: 'Admin', developer: 'Developer'
}
export const ROLE_COLORS = {
  lead_admin: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/40',
  admin: 'bg-primary/15 text-primary border-primary/30',
  developer: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
}
