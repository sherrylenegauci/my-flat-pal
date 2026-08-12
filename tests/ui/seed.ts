import { save } from '../../src/storage/repository'
import { emptyDocument } from '../../src/storage/schema'
import type { Completion, Interval, MaintenanceItem } from '../../src/domain/types'

/**
 * Putting a schedule in place before the app boots.
 *
 * The US1 test files each grew their own copy of this. Five US2 files would
 * have made seven, so it is factored out here — a second use case exists, which
 * is what Principle I asks for before an abstraction appears.
 *
 * Seeding through the repository rather than through the form is deliberate:
 * these tests are about ticking a job off, not about adding one, and driving
 * the form first would make every one of them fail when the form changes.
 */
export function anItem(overrides: Partial<MaintenanceItem> = {}): MaintenanceItem {
  return {
    id: `itm_${overrides.name ?? 'test'}`,
    name: 'Boiler service',
    interval: { count: 1, unit: 'year' },
    createdAt: '2026-01-01',
    completions: [],
    ...overrides,
  }
}

/** A tick-off. `recordedAt` defaults to matching `completedOn`. */
export function aCompletion(completedOn: string, overrides: Partial<Completion> = {}): Completion {
  return {
    id: `cmp_${completedOn}`,
    completedOn,
    recordedAt: `${completedOn}T12:00:00.000Z`,
    ...overrides,
  }
}

export function seed(items: MaintenanceItem[]): void {
  save({ ...emptyDocument(), items })
}

export const YEARLY: Interval = { count: 1, unit: 'year' }
export const MONTHLY: Interval = { count: 1, unit: 'month' }
