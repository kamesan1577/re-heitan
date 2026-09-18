import { storage } from "#imports"

import { DEFAULT_SETTINGS, type Settings } from "./settings"

/**
 * 設定の永続化。WXT の `#imports` に依存するため、拡張の外からは読めない。
 * 判定ロジックとテスト、`scripts/probe.ts` は settings.ts の型と既定値しか
 * 使わないので、Node からもそのまま動く。
 */
const item = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULT_SETTINGS,
})

export async function getSettings(): Promise<Settings> {
  // 設定項目を後から足しても既存ユーザーが壊れないようにマージしておく。
  return { ...DEFAULT_SETTINGS, ...(await item.getValue()) }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await item.setValue(next)
  return next
}

export function watchSettings(cb: (s: Settings) => void): () => void {
  return item.watch((v) => cb({ ...DEFAULT_SETTINGS, ...v }))
}
