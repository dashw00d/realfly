import { describe, expect, it } from 'vitest'
import { formatDisplayLabel } from '../shared/display-label'

describe('formatDisplayLabel', () => {
  it('uses the OS label and size', () => {
    expect(formatDisplayLabel({ label: 'HP 24mh', width: 1920, height: 1080 }, 0)).toBe(
      'HP 24mh — 1920x1080',
    )
  })

  it('falls back to Display N when label is empty', () => {
    expect(formatDisplayLabel({ label: '  ', width: 2560, height: 1440 }, 1)).toBe(
      'Display 2 — 2560x1440',
    )
  })

  it('marks the primary display', () => {
    expect(
      formatDisplayLabel({ label: 'Built-in', width: 1512, height: 982, primary: true }, 0),
    ).toBe('Built-in — 1512x982 (primary)')
  })
})
