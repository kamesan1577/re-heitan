import { useEffect, useState } from "react"

import {
  DEFAULT_SETTINGS,
  getSettings,
  setSettings,
  watchSettings,
  type Settings,
} from "../core/settings"

/** popup と options で共有する設定フック。保存は即時。 */
export function useSettings(): [Settings, (p: Partial<Settings>) => void, boolean] {
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void getSettings().then((s) => {
      setLocal(s)
      setReady(true)
    })
    return watchSettings(setLocal)
  }, [])

  const update = (patch: Partial<Settings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    void setSettings(patch)
  }

  return [settings, update, ready]
}
