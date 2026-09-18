import { defineContentScript } from "#imports"

import { applyAnonymize } from "../content/anonymize"
import "../content/anonymize.css"
import { Pipeline } from "../content/pipeline"
import "../content/veil.css"
import { getSettings, watchSettings, type Settings } from "../core/settings"

export default defineContentScript({
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_idle",
  cssInjectionMode: "manifest",

  async main() {
    let pipeline: Pipeline | null = null

    const sync = (settings: Settings) => {
      // 目隠しは検閲とは独立に効く。検閲を切った状態の録画も撮れるように。
      applyAnonymize(settings.anonymize)

      if (settings.enabled) {
        if (pipeline) pipeline.updateSettings(settings)
        else {
          pipeline = new Pipeline(settings)
          pipeline.start()
        }
      } else {
        pipeline?.stop()
        pipeline = null
        // 残っているぼかしを剥がす。
        for (const el of document.querySelectorAll("[data-rh-state]")) {
          el.removeAttribute("data-rh-state")
          el.querySelector(".rh-overlay")?.remove()
        }
      }
    }

    sync(await getSettings())
    watchSettings(sync)
  },
})
