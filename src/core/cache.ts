import type { Signals } from "./verdict"

/**
 * 旧実装は Redis に判定結果を 7 日キャッシュしていた。判定が拡張の中で
 * 完結した今、キャッシュも拡張の中に置ける。往復が 1 つ減るので、
 * ヒット時の応答はネットワーク越しの Redis より速い。
 *
 * 2 段構成。L1 はサービスワーカー常駐の Map、L2 は chrome.storage.local。
 * サービスワーカーは数十秒で落とされるので、L2 がないとタブを開き直す
 * たびに全件問い合わせ直しになる。
 */

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 5000
const STORAGE_KEY = "verdictCache"
const PERSIST_DEBOUNCE_MS = 2000

interface Entry {
  s: Signals
  /** 保存時刻。TTL 判定に使う。 */
  t: number
}

/**
 * 判定そのもの（Signals）を持ち、レベルは読み出し側で毎回計算する。
 * こうしておくと閾値を動かしたときに再問い合わせが要らない。
 */
const memory = new Map<string, Entry>()
let hydrated: Promise<void> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

/** cyrb53。暗号用途ではないが衝突が十分に稀で、同期に呼べるだけ速い。 */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function cacheKey(text: string, fingerprint: string): string {
  return `${fingerprint}:${hash(text)}`
}

async function hydrate(): Promise<void> {
  hydrated ??= (async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    const raw = stored[STORAGE_KEY] as Record<string, Entry> | undefined
    if (!raw) return
    const now = Date.now()
    for (const [k, v] of Object.entries(raw)) {
      if (now - v.t < TTL_MS) memory.set(k, v)
    }
  })()
  return hydrated
}

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void chrome.storage.local.set({
      [STORAGE_KEY]: Object.fromEntries(memory),
    })
  }, PERSIST_DEBOUNCE_MS)
}

export async function get(key: string): Promise<Signals | undefined> {
  await hydrate()
  const hit = memory.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.t >= TTL_MS) {
    memory.delete(key)
    return undefined
  }
  // Map の挿入順を LRU として使う。触れたものを末尾に送り直す。
  memory.delete(key)
  memory.set(key, hit)
  return hit.s
}

export async function put(key: string, s: Signals): Promise<void> {
  await hydrate()
  memory.delete(key)
  memory.set(key, { s, t: Date.now() })
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next()
    if (oldest.done) break
    memory.delete(oldest.value)
  }
  schedulePersist()
}

export async function clear(): Promise<void> {
  await hydrate()
  memory.clear()
  await chrome.storage.local.remove(STORAGE_KEY)
}

export async function size(): Promise<number> {
  await hydrate()
  return memory.size
}
