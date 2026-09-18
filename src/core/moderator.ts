import * as cache from "./cache"
import { ask, JevError } from "./jev"
import { packPlan, soloQuestions } from "./questions"
import { judgementFingerprint, type Settings } from "./settings"
import { Level, type PostInput, type VerdictResult } from "./types"
import { readSignals, toVerdict, type Signals } from "./verdict"

/** jev の rate limit は 1,200 req/min。手元で詰まらせない程度に抑える。 */
const MAX_CONCURRENCY = 4

/** 同じ本文が別タブ・別スクロールから同時に来たときに問い合わせを共有する。 */
const inflight = new Map<string, Promise<Signals | null>>()

export interface ModerationStats {
  asked: number
  cacheHits: number
  requests: number
}

let stats: ModerationStats = { asked: 0, cacheHits: 0, requests: 0 }
export const getStats = (): ModerationStats => ({ ...stats })
export const resetStats = (): void => {
  stats = { asked: 0, cacheHits: 0, requests: 0 }
}

/**
 * タイムラインから拾った投稿をまとめて判定する。
 * 返り値は投稿 id をキーにした判定。判定できなかったものはエラーを入れる。
 */
export async function moderate(
  posts: PostInput[],
  settings: Settings,
): Promise<Record<string, VerdictResult>> {
  const out: Record<string, VerdictResult> = {}
  if (!settings.apiKey) {
    for (const p of posts) out[p.id] = { error: "API キーが未設定です" }
    return out
  }

  const fingerprint = judgementFingerprint(settings)
  /** キャッシュキー → 同じ本文を持つ投稿 id の集まり。同文の連投を 1 回にまとめる。 */
  const pending = new Map<string, { text: string; ids: string[] }>()

  for (const post of posts) {
    stats.asked++
    const text = normalize(post.text)

    if (isTriviallySafe(text)) {
      out[post.id] = {
        level: Level.Safe,
        score: 0,
        confidence: 1,
        reason: "",
        cached: true,
      }
      continue
    }

    const key = cacheKeyFor(text, fingerprint)
    const hit = await cache.get(key)
    if (hit) {
      stats.cacheHits++
      out[post.id] = { ...toVerdict(hit, settings), cached: true }
      continue
    }

    const slot = pending.get(key)
    if (slot) slot.ids.push(post.id)
    else pending.set(key, { text, ids: [post.id] })
  }

  if (pending.size === 0) return out

  const entries = [...pending.entries()]
  const chunkSize = settings.packRequests ? Math.max(1, settings.packSize) : 1
  const chunks: Array<typeof entries> = []
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize))
  }

  await runLimited(chunks, MAX_CONCURRENCY, async (chunk) => {
    const results = await askChunk(chunk, settings, fingerprint)
    for (const [key, result] of results) {
      const slot = pending.get(key)
      if (!slot) continue
      for (const id of slot.ids) {
        out[id] =
          result === null
            ? { error: "判定に失敗しました" }
            : result instanceof Error
              ? { error: result.message }
              : toVerdict(result, settings)
      }
    }
  })

  // 例外で欠けたぶんを埋める。DOM 側はエラーなら投稿に触らない。
  for (const post of posts) {
    out[post.id] ??= { error: "判定に失敗しました" }
  }
  return out
}

type ChunkEntry = [string, { text: string; ids: string[] }]

async function askChunk(
  chunk: ChunkEntry[],
  settings: Settings,
  fingerprint: string,
): Promise<Array<[string, Signals | null | Error]>> {
  // 同じ本文がすでに飛んでいれば、その結果に相乗りする。
  const shared = chunk.filter(([key]) => inflight.has(key))
  const fresh = chunk.filter(([key]) => !inflight.has(key))

  const results: Array<[string, Signals | null | Error]> = []

  if (fresh.length > 0) {
    const promise = requestSignals(fresh, settings)
    for (const [key] of fresh) {
      // 相乗り用のプロミスは必ず解決させる。ここで catch を付けておかないと、
      // 誰も相乗りしなかったリクエストが失敗したときに未処理の rejection になる。
      inflight.set(
        key,
        promise.then((m) => m.get(key) ?? null).catch(() => null),
      )
    }
    try {
      const map = await promise
      for (const [key, { text }] of fresh) {
        const s = map.get(key)
        if (s) {
          await cache.put(cacheKeyFor(text, fingerprint), s)
          results.push([key, s])
        } else {
          results.push([key, null])
        }
      }
    } catch (e) {
      const message =
        e instanceof JevError ? e.message : `判定に失敗しました: ${String(e)}`
      for (const [key] of fresh) results.push([key, new Error(message)])
    } finally {
      for (const [key] of fresh) inflight.delete(key)
    }
  }

  for (const [key] of shared) {
    try {
      results.push([key, (await inflight.get(key)!) ?? null])
    } catch {
      results.push([key, null])
    }
  }
  return results
}

/** 1 リクエストぶん。pack モードなら複数投稿、solo モードなら 1 投稿。 */
async function requestSignals(
  entries: ChunkEntry[],
  settings: Settings,
): Promise<Map<string, Signals>> {
  stats.requests++
  const out = new Map<string, Signals>()

  if (!settings.packRequests || entries.length === 1) {
    const [key, slot] = entries[0]!
    const res = await ask({
      apiKey: settings.apiKey,
      model: settings.model,
      state: slot.text,
      questions: soloQuestions(),
    })
    const s = readSignals(res.answers)
    if (s) out.set(key, s)
    return out
  }

  const inputs: PostInput[] = entries.map(([key, slot]) => ({
    id: key,
    text: slot.text,
  }))
  const plan = packPlan(inputs)
  const res = await ask({
    apiKey: settings.apiKey,
    model: settings.model,
    state: plan.state,
    questions: plan.questions,
  })
  for (const [slotName, key] of plan.slots) {
    const s = readSignals(res.answers, slotName)
    if (s) out.set(key, s)
  }
  return out
}

async function runLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!
      try {
        await fn(item)
      } catch {
        // 個々のチャンクの失敗は out の穴埋めで拾う。
      }
    }
  })
  await Promise.all(workers)
}

function cacheKeyFor(text: string, fingerprint: string): string {
  return cache.cacheKey(text, fingerprint)
}

/** 表記ゆれでキャッシュを外さないための正規化。 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 2000)
}

/**
 * 問い合わせるまでもない投稿を弾く。URL だけのポスト、絵文字だけのリプライ、
 * 1 文字の相槌はタイムラインの相当な割合を占めるので、ここで落ちる数が
 * そのままレイテンシと請求額に効く。
 */
function isTriviallySafe(text: string): boolean {
  if (text.length < 2) return true
  const stripped = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@#][\w一-龯ぁ-んァ-ヶ]+/g, "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\p{P}\p{S}]/gu, "")
  return stripped.length < 2
}
