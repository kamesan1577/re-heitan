import { send } from "../../core/messages"
import { useSettings } from "../../ui/useSettings"

export function App() {
  const [settings, update, ready] = useSettings()
  if (!ready) return <div className="panel panel--options" />

  /** 判定の作り方を変えると過去の判定と混ざるので、キャッシュを捨てる。 */
  const updateJudgement = (patch: Parameters<typeof update>[0]) => {
    update(patch)
    void send({ kind: "clearCache" })
  }

  return (
    <div className="panel panel--options">
      <h1>re:へいたん の設定</h1>
      <p className="hint">
        判定は TypeSafe の System One モデル jev が行います。API キーは
        この端末の拡張ストレージにのみ保存され、X のページ側からは読めません。
        キーの発行は{" "}
        <a href="https://console.typesafe.ai" target="_blank" rel="noreferrer">
          console.typesafe.ai
        </a>{" "}
        から。
      </p>

      <h2>API</h2>
      <div className="row">
        <div className="row__main">
          <label className="row__label" htmlFor="key">
            API キー
          </label>
          <p className="hint">Bearer トークンとしてそのまま送られます。</p>
        </div>
      </div>
      <input
        id="key"
        type="password"
        placeholder="sk-..."
        value={settings.apiKey}
        onChange={(e) => update({ apiKey: e.target.value.trim() })}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <div className="row__main">
          <span className="row__label">モデル</span>
          <p className="hint">
            エイリアスは新しい版が出ると指す先が動きます。閾値を追い込んだあとは
            版を固定するほうが安定します。
          </p>
        </div>
        <select
          style={{ width: 150 }}
          value={settings.model}
          onChange={(e) => updateJudgement({ model: e.target.value })}>
          <option value="jev-latest">jev-latest</option>
          <option value="jev-preview">jev-preview</option>
          <option value="jev-1.13.0">jev-1.13.0</option>
        </select>
      </div>

      <h2>判定のしかた</h2>

      <div className="row">
        <div className="row__main">
          <span className="row__label">複数の投稿をまとめて送る</span>
          <p className="hint">
            state を 1 度だけ読ませ、投稿ごとの質問を並列に評価させます。
            往復が減るぶん速く、入力トークンも投稿数ぶんには増えません。
            切ると 1 投稿ごとに 6 問を使う精度寄りの判定になります。
          </p>
        </div>
        <input
          type="checkbox"
          checked={settings.packRequests}
          onChange={(e) => updateJudgement({ packRequests: e.target.checked })}
        />
      </div>

      {settings.packRequests && (
        <div className="row">
          <div className="row__main">
            <span className="row__label">1 リクエストの投稿数</span>
            <p className="hint">
              多いほど速くなりますが、1 件あたりに割ける文脈は減ります。
            </p>
          </div>
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={settings.packSize}
            onChange={(e) => update({ packSize: Number(e.target.value) })}
          />
          <span className="value">{settings.packSize}</span>
        </div>
      )}

      <div className="row">
        <div className="row__main">
          <span className="row__label">非表示にする最低 confidence</span>
          <p className="hint">
            jev の confidence がこれを下回る判定では投稿を隠さず、ぼかしに
            留めて読むかどうかを本人に返します。自信のない判定で
            タイムラインが静かに欠けるのを防ぐための下限です。
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={0.95}
          step={0.01}
          value={settings.minConfidence}
          onChange={(e) => update({ minConfidence: Number(e.target.value) })}
        />
        <span className="value">{settings.minConfidence.toFixed(2)}</span>
      </div>

      <h2>キャッシュ</h2>
      <div className="row">
        <div className="row__main">
          <p className="hint">
            判定は 7 日間この端末に保存されます。保存しているのは表示レベルでは
            なく jev の確率そのものなので、感度を動かしても問い合わせ直しは
            起きません。
          </p>
        </div>
        <button onClick={() => void send({ kind: "clearCache" })}>消去</button>
      </div>
    </div>
  )
}
