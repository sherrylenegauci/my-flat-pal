import type { Completion, Interval, MaintenanceItem } from '../../src/domain/types'

/** Build a job for tests. Everything has a sensible default. */
export function anItem(overrides: Partial<MaintenanceItem> = {}): MaintenanceItem {
  return {
    id: 'itm_test',
    name: 'Boiler service',
    interval: { count: 1, unit: 'year' },
    createdAt: '2026-01-01',
    completions: [],
    ...overrides,
  }
}

/** Build a tick-off. `recordedAt` defaults to matching `completedOn`. */
export function aCompletion(
  completedOn: string,
  overrides: Partial<Completion> = {},
): Completion {
  return {
    id: `cmp_${completedOn}`,
    completedOn,
    recordedAt: `${completedOn}T12:00:00.000Z`,
    ...overrides,
  }
}

export const yearly: Interval = { count: 1, unit: 'year' }
export const monthly: Interval = { count: 1, unit: 'month' }
export const daily: Interval = { count: 1, unit: 'day' }
