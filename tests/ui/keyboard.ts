import type userEvent from '@testing-library/user-event'

/**
 * Reaching a control the way someone without a mouse reaches it.
 *
 * Lifted out of `keyboard-us2.test.tsx` when US3 became the second file needing
 * it — the same point at which `seed.ts` was extracted, and the same rule from
 * Principle I: a shared helper appears when a second concrete use exists, not
 * before.
 *
 * The point of tabbing rather than clicking is that clicking proves nothing
 * about keyboard operation. An early US1 test clicked its way to a control,
 * pressed Enter, and claimed to have shown the flow worked without a mouse.
 * Hence the return value: callers assert the control was actually *found*, so a
 * traversal that never arrived cannot pass as one that did.
 */
export async function tabUntil(
  user: ReturnType<typeof userEvent.setup>,
  matches: (el: Element | null) => boolean,
  limit = 25,
): Promise<Element | null> {
  for (let i = 0; i < limit; i++) {
    if (matches(document.activeElement)) return document.activeElement
    await user.tab()
  }
  return matches(document.activeElement) ? document.activeElement : null
}

/** A button whose visible text matches. */
export const named = (re: RegExp) => (el: Element | null) =>
  el?.tagName === 'BUTTON' && re.test(el.textContent ?? '')
