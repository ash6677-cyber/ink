import { describe, expect, it } from 'vitest'

import { applySpokenCommands, spokenCommandHelp } from './dictation'

describe('applySpokenCommands', () => {
  it('turns the classic dictated sentence into typed prose', () => {
    expect(
      applySpokenCommands(
        'the river said comma we go now period new paragraph and so they went',
      ),
    ).toBe('The river said, we go now.\n\nAnd so they went')
  })

  it('handles every terminal mark and capitalizes what follows', () => {
    expect(applySpokenCommands('is it you question mark it is exclamation mark good')).toBe(
      'Is it you? It is! Good',
    )
    expect(applySpokenCommands('wait full stop no more')).toBe('Wait. No more')
  })

  it('heals spacing around mid-sentence marks', () => {
    expect(applySpokenCommands('bread comma salt semicolon and time colon plenty')).toBe(
      'Bread, salt; and time: plenty',
    )
  })

  it('wraps speech in curly quotes with tight spacing', () => {
    expect(applySpokenCommands('she said open quote not tonight close quote and left')).toBe(
      'She said “not tonight” and left',
    )
  })

  it('prefers the longer command: exclamation mark is not a mark named exclamation', () => {
    expect(applySpokenCommands('go exclamation point now')).toBe('Go! Now')
  })

  it('treats dash as a word-like em dash and ellipsis as one mark', () => {
    expect(applySpokenCommands('it was dash somehow dash enough ellipsis')).toBe(
      'It was — somehow — enough…',
    )
  })

  it('starts a new line without a blank line for new line', () => {
    expect(applySpokenCommands('first line new line second line')).toBe(
      'First line\nSecond line',
    )
  })

  it('passes ordinary words through untouched, case kept', () => {
    expect(applySpokenCommands('Marta went to Coldharbour')).toBe('Marta went to Coldharbour')
  })

  it('is safe on empty and whitespace-only input', () => {
    expect(applySpokenCommands('')).toBe('')
    expect(applySpokenCommands('   ')).toBe('')
  })
})

describe('spokenCommandHelp', () => {
  it('derives the help sheet from the real command table', () => {
    const help = spokenCommandHelp()
    expect(help.find((h) => h.say === 'comma')?.get).toBe(',')
    expect(help.find((h) => h.say === 'new paragraph')?.get).toContain('paragraph')
    expect(help.length).toBeGreaterThanOrEqual(12)
  })
})
