import { useEffect, useState } from "react"

import { send } from "../../core/messages"
import type { ModerationStats } from "../../core/moderator"
import { useSettings } from "../../ui/useSettings"

export function App() {
  const [settings, update, ready] = useSettings()
  const [stats, setStats] = useState<{ stats: ModerationStats; cacheSize: number }>()

  const refresh = () =>
    void send({ kind: "stats" }).then((r) => {
      if (r.kind === "stats") setStats({ stats: r.stats, cacheSize: r.cacheSize })
    })

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 1500)
    return () => clearInterval(t)
  }, [])

  if (!ready) return <div className="panel panel--popup" />

  const hitRate =
    stats && stats.stats.asked > 0
      ? Math.round((stats.stats.cacheHits / stats.stats.asked) * 100)
      : 0

  return (
    <div className="panel panel--popup">
      <h1>re:へいたん</h1>
      <p className="hint">
        {settings.apiKey
          ? `判定は ${settings.model} が行っています。`
          : "API キーが未設定です。設定画面から登録してください。"}
      </p>

      <div className="row">
        <span className="row__main">タイムラインの検閲</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </div>

      <div className="row">
        <span className="row__main">判定が返るまでぼかす</span>
        <input
          type="checkbox"
          checked={settings.veilUntilJudged}
          onChange={(e) => update({ veilUntilJudged: e.target.checked })}
        />
      </div>

      <div className="row">
        <span className="row__main">強い誹謗中傷の扱い</span>
        <select
          style={{ width: 96 }}
          value={settings.blockedAction}
          onChange={(e) =>
            update({ blockedAction: e.target.value as "hide" | "veil" })
          }>
          <option value="hide">非表示</option>
          <option value="veil">ぼかす</option>
        </select>
      </div>

      <h2>デモ・画面共有</h2>

      <div className="row">
        <div className="row__main">
          <span className="row__label">投稿者を伏せる</span>
          <p className="hint">アイコンと ID だけを隠します。本文はそのままです。</p>
        </div>
        <select
          style={{ width: 96 }}
          value={settings.anonymize}
          onChange={(e) =>
            update({ anonymize: e.target.value as typeof settings.anonymize })
          }>
          <option value="off">しない</option>
          <option value="blur">ぼかす</option>
          <option value="mosaic">モザイク</option>
          <option value="redact">塗りつぶす</option>
        </select>
      </div>

      <h2>感度</h2>

      <Slider
        label="ぼかす"
        value={settings.veilThreshold}
        // block 側を超えないように詰める。逆転すると Veiled が出なくなる。
        max={settings.blockThreshold - 0.05}
        onChange={(v) => update({ veilThreshold: v })}
      />
      <Slider
        label="隠す"
        value={settings.blockThreshold}
        min={settings.veilThreshold + 0.05}
        onChange={(v) => update({ blockThreshold: v })}
      />
      <p className="hint">
        閾値はキャッシュ済みの投稿にもすぐ効きます（判定そのものを保存しているため）。
      </p>

      <h2>この起動での処理</h2>
      <div className="stats">
        <div className="stat">
          <span className="stat__value">{stats?.stats.asked ?? 0}</span>
          <span className="stat__label">投稿</span>
        </div>
        <div className="stat">
          <span className="stat__value">{stats?.stats.requests ?? 0}</span>
          <span className="stat__label">jev 呼び出し</span>
        </div>
        <div className="stat">
          <span className="stat__value">{hitRate}%</span>
          <span className="stat__label">キャッシュ率</span>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="row__main hint">
          保存済み {stats?.cacheSize ?? 0} 件
        </span>
        <button
          onClick={() => {
            void send({ kind: "clearCache" }).then(refresh)
          }}>
          消去
        </button>
      </div>

      <div className="row">
        <span className="row__main" />
        <button onClick={() => chrome.runtime.openOptionsPage()}>設定</button>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min = 0.05,
  max = 0.95,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="row">
      <span className="row__main">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="value">{value.toFixed(2)}</span>
    </div>
  )
}
