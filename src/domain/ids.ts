/**
 * Id generation.
 *
 * plan.md § Data model requires ids to be "stable, unique, never reused". A
 * counter cannot promise that — it resets when storage is cleared, and would
 * then hand out ids that already exist in a document restored from elsewhere.
 * Random ids make reuse effectively impossible instead of nominally forbidden.
 */

function randomId(): string {
  // `crypto.randomUUID` needs a secure context in browsers. localhost and any
  // https origin qualify, which covers dev and the installed app — but the
  // fallback means a plain-http origin degrades rather than crashing.
  const cryptoObj = globalThis.crypto as Crypto | undefined

  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID().replaceAll('-', '').slice(0, 16)
  }

  if (cryptoObj?.getRandomValues) {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(8))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Last resort. Not cryptographic, but collision-resistant enough at this
  // scale — and this branch should be unreachable in any supported browser.
  return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10)
}

export function newItemId(): string {
  return `itm_${randomId()}`
}

export function newCompletionId(): string {
  return `cmp_${randomId()}`
}
