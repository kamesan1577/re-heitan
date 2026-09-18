import { send } from "../core/messages"
import type { Settings } from "../core/settings"
import type { PostInput } from "../core/types"
import { collect, mayContainTweet, type Tweet } from "./tweets"
import { apply, markPending } from "./veil"

/**
 * DOM の変化から判定要求までの流れ。
 *
 * 1. MutationObserver が新しい投稿を見つけ、判定待ちのぼかしを当てる
 * 2. IntersectionObserver が画面に近づいた投稿だけをキューに入れる
 * 3. 短い窓でまとめて background に渡す
 *
 * 旧実装は変更が起きるたびにタイムライン全体を送り直していた。
 * 見えないものを判定しない、同じものを二度判定しないという 2 点だけで
 * リクエスト数がスクロール量に比例しなくなる。
 */

/** キューを寝かせる時間。長くすると 1 リクエストに詰まるが、表示が遅れる。 */
const FLUSH_DELAY_MS = 60

/** 画面外どのくらい先まで先に判定しておくか。 */
const PREFETCH_MARGIN = "600px"

export class Pipeline {
  private settings: Settings
  private readonly cells = new Map<string, HTMLElement>()
  private readonly queue = new Set<string>()
  private readonly texts = new Map<string, string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  private readonly intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const id = entry.target.getAttribute("data-rh-id")
        if (!id) continue
        this.intersection.unobserve(entry.target)
        this.queue.add(id)
      }
      if (this.queue.size > 0) this.scheduleFlush()
    },
    { rootMargin: PREFETCH_MARGIN },
  )

  private readonly mutation = new MutationObserver((mutations) => {
    let candidate = false
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (mayContainTweet(node)) {
          candidate = true
          break
        }
      }
      if (candidate) break
    }
    if (candidate) this.ingest()
  })

  constructor(settings: Settings) {
    this.settings = settings
  }

  start(): void {
    this.ingest()
    this.mutation.observe(document.body, { childList: true, subtree: true })
  }

  stop(): void {
    this.mutation.disconnect()
    this.intersection.disconnect()
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.queue.clear()
  }

  updateSettings(settings: Settings): void {
    this.settings = settings
  }

  private ingest(): void {
    for (const tweet of collect()) this.register(tweet)
  }

  private register(tweet: Tweet): void {
    this.cells.set(tweet.id, tweet.cell)
    this.texts.set(tweet.id, tweet.text)
    if (this.settings.veilUntilJudged) markPending(tweet.cell)
    this.intersection.observe(tweet.cell)
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, FLUSH_DELAY_MS)
  }

  private async flush(): Promise<void> {
    const ids = [...this.queue]
    this.queue.clear()
    if (ids.length === 0) return

    const posts: PostInput[] = []
    for (const id of ids) {
      const text = this.texts.get(id)
      const cell = this.cells.get(id)
      // 仮想スクロールで消えた行は判定しない。
      if (text && cell?.isConnected) posts.push({ id, text })
    }
    if (posts.length === 0) return

    try {
      const res = await send({ kind: "moderate", posts })
      if (res.kind !== "moderate") throw new Error("unexpected response")
      for (const [id, verdict] of Object.entries(res.verdicts)) {
        const cell = this.cells.get(id)
        if (cell?.isConnected) apply(cell, verdict, this.settings)
      }
      // 応答に含まれなかったぶん（拡張が無効化された等）はぼかしを外す。
      for (const post of posts) {
        if (post.id in res.verdicts) continue
        const cell = this.cells.get(post.id)
        if (cell?.isConnected) apply(cell, { error: "判定なし" }, this.settings)
      }
    } catch {
      // background が落ちている間のぼかしを残すと読めなくなるので外す。
      for (const post of posts) {
        const cell = this.cells.get(post.id)
        if (cell?.isConnected) apply(cell, { error: "接続なし" }, this.settings)
      }
    } finally {
      for (const id of ids) {
        this.texts.delete(id)
      }
    }
  }
}
