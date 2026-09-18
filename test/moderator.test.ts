import assert from "node:assert/strict"
import { beforeEach, test, vi } from "vitest"

import * as jev from "../src/core/jev"
import * as cache from "../src/core/cache"
import { getStats, moderate, resetStats } from "../src/core/moderator"
import { DEFAULT_SETTINGS, type Settings } from "../src/core/settings"
import { Level, isError } from "../src/core/types"

// chrome.storage.local は cache.ts が直接触るので最小限のダミーを置く。
const store: Record<string, unknown> = {}
;(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
      set: async (o: Record<string, unknown>) => Object.assign(store, o),
      remove: async (k: string) => {
        delete store[k]
      },
    },
  },
}

const settings: Settings = { ...DEFAULT_SETTINGS, apiKey: "test-key" }

/** score/noul の答えを 1 投稿ぶん作る。harm が高いほど誹謗中傷寄り。 */
function answersFor(prefix: string, harm: number) {
  const p = prefix ? `${prefix}_` : ""
  return {
    [`${p}sev`]: {
      type: "score" as const,
      score: harm * 2,
      legend: { "0": "a", "1": "b", "2": "c" },
      probabilities: {},
      confidence: 0.9,
    },
    [`${p}attack`]: { type: "noul" as const, noul: harm },
  }
}

let asked: Array<{ state: unknown; questions: Record<string, unknown> }> = []

beforeEach(async () => {
  asked = []
  resetStats()
  await cache.clear()
  vi.restoreAllMocks()
  vi.spyOn(jev, "ask").mockImplementation(async (opts) => {
    asked.push({ state: opts.state, questions: opts.questions })
    const answers: Record<string, any> = {}
    for (const key of Object.keys(opts.questions)) {
      const slot = key.replace(/_(sev|attack)$/, "")
      // state に "死ね" を含む投稿だけ有害としておく。
      const posts = (opts.state as any)?.posts as
        | Array<{ id: string; text: string }>
        | undefined
      const text = posts
        ? (posts.find((p) => p.id === slot)?.text ?? "")
        : String(opts.state)
      Object.assign(answers, answersFor(posts ? slot : "", text.includes("死ね") ? 0.98 : 0.02))
    }
    return { model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 0 } }
  })
})

test("URL だけ・絵文字だけの投稿は jev に送らない", async () => {
  const out = await moderate(
    [
      { id: "a", text: "https://example.com/x" },
      { id: "b", text: "😂😂😂" },
      { id: "c", text: "@someone" },
    ],
    settings,
  )
  assert.equal(asked.length, 0)
  for (const id of ["a", "b", "c"]) {
    const v = out[id]!
    assert.ok(!isError(v) && v.level === Level.Safe)
  }
})

test("pack モードは packSize ごとに 1 リクエストにまとめる", async () => {
  const posts = Array.from({ length: 17 }, (_, i) => ({
    id: `t${i}`,
    text: `これは投稿 ${i} です`,
  }))
  await moderate(posts, { ...settings, packSize: 8 })
  assert.equal(asked.length, 3) // 8 + 8 + 1
  assert.equal(Object.keys(asked[0]!.questions).length, 16)
  assert.equal(getStats().requests, 3)
})

test("同じ本文は 1 度しか判定せず、両方に同じ結果が返る", async () => {
  const out = await moderate(
    [
      { id: "a", text: "死ね" },
      { id: "b", text: "死ね" },
      { id: "c", text: " 死ね " }, // 空白の差は正規化で吸収する
    ],
    settings,
  )
  // 3 件が 1 件に畳まれた結果、送るのは 1 投稿ぶん。
  // 1 投稿しか残らなければ pack ではなく 6 問の solo で聞くほうが精度が出る。
  assert.equal(asked.length, 1)
  assert.equal(asked[0]!.state, "死ね")
  assert.equal(Object.keys(asked[0]!.questions).length, 6)
  for (const id of ["a", "b", "c"]) {
    const v = out[id]!
    assert.ok(!isError(v) && v.level === Level.Blocked, `${id}: ${JSON.stringify(v)}`)
  }
})

test("2 回目はキャッシュから返り jev を呼ばない", async () => {
  const posts = [{ id: "a", text: "ひどいことを言う投稿 死ね" }]
  await moderate(posts, settings)
  assert.equal(asked.length, 1)

  const out = await moderate([{ id: "b", text: posts[0]!.text }], settings)
  assert.equal(asked.length, 1)
  const v = out["b"]!
  assert.ok(!isError(v) && v.cached && v.level === Level.Blocked)
  assert.equal(getStats().cacheHits, 1)
})

test("閾値を動かすとキャッシュ済みの投稿にも問い合わせなしで効く", async () => {
  await moderate([{ id: "a", text: "死ね" }], settings)
  const before = asked.length

  // 隠す閾値を上げれば、同じ判定でも Veiled 止まりになる。
  const out = await moderate([{ id: "b", text: "死ね" }], {
    ...settings,
    blockThreshold: 0.99,
    veilThreshold: 0.5,
  })
  assert.equal(asked.length, before)
  const v = out["b"]!
  assert.ok(!isError(v) && v.level === Level.Veiled)
})

test("solo モードは 1 投稿 1 リクエストで 6 問投げる", async () => {
  await moderate(
    [
      { id: "a", text: "投稿ひとつめ" },
      { id: "b", text: "投稿ふたつめ" },
    ],
    { ...settings, packRequests: false },
  )
  assert.equal(asked.length, 2)
  assert.equal(Object.keys(asked[0]!.questions).length, 6)
  assert.equal(typeof asked[0]!.state, "string")
})

test("jev が落ちたらエラーを返し、DOM 側は素通しにできる", async () => {
  vi.spyOn(jev, "ask").mockImplementation(async () => {
    throw new jev.JevError("jev が 429 を返しました", 429, true)
  })
  const out = await moderate([{ id: "a", text: "なにかの投稿" }], settings)
  assert.ok(isError(out["a"]!))
})

test("API キーが無ければ 1 度も送らない", async () => {
  const out = await moderate([{ id: "a", text: "なにかの投稿" }], {
    ...settings,
    apiKey: "",
  })
  assert.equal(asked.length, 0)
  assert.ok(isError(out["a"]!))
})
