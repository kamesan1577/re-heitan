import type { ModerationStats } from "./moderator"
import type { PostInput, VerdictResult } from "./types"

/**
 * content script はページの DOM だけを見て、判定は background に投げる。
 * jev の API キーをページ側に載せないためと、タブをまたいでキャッシュと
 * 同時実行数を一元管理するため。
 */
export type Request =
  | { kind: "moderate"; posts: PostInput[] }
  | { kind: "stats" }
  | { kind: "clearCache" }

export type Response =
  | { kind: "moderate"; verdicts: Record<string, VerdictResult> }
  | { kind: "stats"; stats: ModerationStats; cacheSize: number }
  | { kind: "clearCache" }
  | { kind: "error"; message: string }

export async function send<T extends Request>(req: T): Promise<Response> {
  return (await chrome.runtime.sendMessage(req)) as Response
}
