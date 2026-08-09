import { BookMarked, Box, Crown, MapPin, Sparkles, User, Shapes } from 'lucide-react'

import type { CodexEntryType } from '@/types'

export const ENTRY_TYPE_LABEL: Record<CodexEntryType, string> = {
  character: 'Character',
  location: 'Location',
  item: 'Item',
  faction: 'Faction',
  lore: 'Lore',
  concept: 'Concept',
  other: 'Other',
}

export const ENTRY_TYPE_ICON: Record<CodexEntryType, typeof User> = {
  character: User,
  location: MapPin,
  item: Box,
  faction: Crown,
  lore: BookMarked,
  concept: Sparkles,
  other: Shapes,
}

export const ENTRY_TYPES: CodexEntryType[] = [
  'character',
  'location',
  'item',
  'faction',
  'lore',
  'concept',
  'other',
]
