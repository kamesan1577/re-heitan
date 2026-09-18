/**
 * 判定の強さは 2 本の閾値で決まる。既定値は「明らかな暴言は隠すが、
 * とげのある言い回しを消すところまではやらない」あたりを狙っている。
 */
export interface Settings {
  apiKey: string
  /** タイムライン検閲そのものの ON/OFF。 */
  enabled: boolean
  /** この値を超えたら Blocked。 */
  blockThreshold: number
  /** この値を超えたら Veiled。blockThreshold より小さいこと。 */
  veilThreshold: number
  /**
   * jev の confidence がこれを下回る判定では Blocked まで踏み込まず
   * Veiled で止める。過剰検閲を confidence で抑える仕掛け。
   */
  minConfidence: number
  /**
   * 投稿者のアイコンと ID を隠す。デモの録画や、画面共有のときに使う。
   * 判定には影響しない（本文だけを jev に送っているため）。
   */
  anonymize: "off" | "blur" | "mosaic" | "redact"
  /** Blocked をどう扱うか。旧実装は "hide" 相当。 */
  blockedAction: "hide" | "veil"
  /**
   * 判定が返るまで投稿をぼかしておく。判定前に一度目に入ってしまっては
   * 検閲する意味が薄いが、旧実装の数秒では実用にならなかった。
   * jev の 1 往復ならぼかしが外れるまでが短いので既定で有効にしている。
   */
  veilUntilJudged: boolean
  /**
   * true なら 1 リクエストに複数投稿を詰めて投げる（速く安い）。
   * false なら 1 投稿ごとに質問を増やして投げる（精度寄り）。
   */
  packRequests: boolean
  /** pack モードで 1 リクエストに詰める投稿数。 */
  packSize: number
  model: string
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  enabled: true,
  blockThreshold: 0.72,
  veilThreshold: 0.45,
  minConfidence: 0.55,
  anonymize: "off",
  blockedAction: "hide",
  veilUntilJudged: true,
  packRequests: true,
  packSize: 8,
  model: "jev-latest",
}

/**
 * 判定の中身を左右する設定。ここが変わった判定はキャッシュから引いてはいけないので、
 * キャッシュキーに混ぜる指紋を作る。閾値は判定後に適用するため含めない。
 */
export function judgementFingerprint(s: Settings): string {
  return `${s.model}:${s.packRequests ? "pack" : "solo"}`
}
