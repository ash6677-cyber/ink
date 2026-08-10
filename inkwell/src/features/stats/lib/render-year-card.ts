/**
 * The "your writing year" card as a picture — a canvas twin of nothing in
 * the DOM this time: the card exists to leave the app (saved, posted,
 * sent to the group chat), so it is drawn at share size from the start.
 * 1080×1350, the 4:5 portrait every feed accepts.
 */

import type { YearReview } from '@/features/stats/lib/year-review'

export const YEAR_CARD_WIDTH = 1080
export const YEAR_CARD_HEIGHT = 1350

const SERIF = "'Source Serif 4', ui-serif, Georgia, serif"
const SANS = "'Inter', ui-sans-serif, system-ui, sans-serif"

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' })

export function renderYearCard(
  canvas: HTMLCanvasElement,
  review: YearReview,
  authorName?: string | null,
): void {
  const w = (canvas.width = YEAR_CARD_WIDTH)
  const h = (canvas.height = YEAR_CARD_HEIGHT)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable.')

  // Ground: the app's deep-violet night, lit from the top corner.
  const ground = ctx.createLinearGradient(0, 0, w * 0.9, h)
  ground.addColorStop(0, 'oklch(24% 0.055 300)')
  ground.addColorStop(0.55, 'oklch(17% 0.04 290)')
  ground.addColorStop(1, 'oklch(13% 0.025 280)')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, w, h)

  // A soft brand glow behind the headline number.
  const glow = ctx.createRadialGradient(w / 2, h * 0.34, 60, w / 2, h * 0.34, w * 0.75)
  glow.addColorStop(0, 'oklch(55% 0.18 295 / 0.28)')
  glow.addColorStop(1, 'oklch(55% 0.18 295 / 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  ctx.textAlign = 'center'

  // Masthead.
  ctx.fillStyle = 'oklch(78% 0.06 295)'
  ctx.font = `600 34px ${SANS}`
  ctx.letterSpacing = '10px'
  ctx.fillText('INKWELL', w / 2, 120)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = 'oklch(92% 0.02 295)'
  ctx.font = `600 58px ${SERIF}`
  ctx.fillText(`My ${review.year} in words`, w / 2, 220)
  if (authorName) {
    ctx.fillStyle = 'oklch(70% 0.03 295)'
    ctx.font = `400 34px ${SANS}`
    ctx.fillText(authorName, w / 2, 274)
  }

  // The headline: total words, enormous.
  ctx.fillStyle = 'oklch(97% 0.01 295)'
  ctx.font = `700 170px ${SERIF}`
  ctx.fillText(review.totalWords.toLocaleString(), w / 2, 520)
  ctx.fillStyle = 'oklch(75% 0.05 295)'
  ctx.font = `400 44px ${SANS}`
  ctx.fillText('words written', w / 2, 585)

  // Three facts in a row.
  const facts: { value: string; label: string }[] = [
    { value: String(review.daysWritten), label: review.daysWritten === 1 ? 'day at the desk' : 'days at the desk' },
    { value: String(review.longestStreak), label: review.longestStreak === 1 ? 'day best streak' : 'days best streak' },
    {
      value: review.biggestDay ? review.biggestDay.words.toLocaleString() : '—',
      label: review.biggestDay ? `best day · ${dayFormat.format(review.biggestDay.day)}` : 'best day',
    },
  ]
  const factY = 760
  facts.forEach((fact, i) => {
    const x = w * ((i + 1) / 4) + (i - 1) * 40
    ctx.fillStyle = 'oklch(93% 0.02 295)'
    ctx.font = `600 72px ${SERIF}`
    ctx.fillText(fact.value, x, factY)
    ctx.fillStyle = 'oklch(68% 0.04 295)'
    ctx.font = `400 27px ${SANS}`
    ctx.fillText(fact.label, x, factY + 46)
  })

  // Twelve months as a skyline.
  const chart = { left: 140, right: w - 140, top: 950, bottom: 1180 }
  const peak = Math.max(1, ...review.monthlyWords)
  const slot = (chart.right - chart.left) / 12
  const barW = slot * 0.52
  review.monthlyWords.forEach((words, month) => {
    const x = chart.left + slot * month + (slot - barW) / 2
    const height = Math.max(words > 0 ? 10 : 4, (words / peak) * (chart.bottom - chart.top))
    const y = chart.bottom - height
    const bar = ctx.createLinearGradient(0, y, 0, chart.bottom)
    if (words > 0) {
      bar.addColorStop(0, 'oklch(72% 0.16 295)')
      bar.addColorStop(1, 'oklch(48% 0.12 295)')
    } else {
      bar.addColorStop(0, 'oklch(35% 0.03 295)')
      bar.addColorStop(1, 'oklch(30% 0.03 295)')
    }
    ctx.fillStyle = bar
    ctx.beginPath()
    ctx.roundRect(x, y, barW, height, 8)
    ctx.fill()
    ctx.fillStyle = 'oklch(60% 0.03 295)'
    ctx.font = `500 24px ${SANS}`
    ctx.fillText(MONTHS[month], x + barW / 2, chart.bottom + 42)
  })

  // Foot.
  ctx.fillStyle = 'oklch(58% 0.04 295)'
  ctx.font = `400 28px ${SANS}`
  ctx.fillText('written with INKWELL', w / 2, h - 64)
}
