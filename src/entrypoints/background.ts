import { defineBackground } from "#imports"

import * as cache from "../core/cache"
import type { Request, Response } from "../core/messages"
import { getStats, moderate, resetStats } from "../core/moderator"
import { getSettings } from "../core/settings"

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (req: Request, _sender, sendResponse: (r: Response) => void) => {
      handle(req)
        .then(sendResponse)
        .catch((e) => sendResponse({ kind: "error", message: String(e) }))
      // 非同期で返すので true を返してチャンネルを開いたままにする。
      return true
    },
  )
})

async function handle(req: Request): Promise<Response> {
  switch (req.kind) {
    case "moderate": {
      const settings = await getSettings()
      if (!settings.enabled) return { kind: "moderate", verdicts: {} }
      return { kind: "moderate", verdicts: await moderate(req.posts, settings) }
    }
    case "stats":
      return { kind: "stats", stats: getStats(), cacheSize: await cache.size() }
    case "clearCache":
      await cache.clear()
      resetStats()
      return { kind: "clearCache" }
  }
}
