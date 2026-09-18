/** 判定結果の表示レベル。旧実装の 0/1/2 をそのまま引き継いでいる。 */
export const Level = {
  /** 問題なし。DOM には触れない。 */
  Safe: 0,
  /** grey zone。ぼかして「表示する」ボタンを出す。 */
  Veiled: 1,
  /** 明確な誹謗中傷。設定に応じて隠すかぼかす。 */
  Blocked: 2,
} as const

export type Level = (typeof Level)[keyof typeof Level]

/** jev が返した確率から組み立てた、1 投稿ぶんの判定。 */
export interface Verdict {
  level: Level
  /** 0..1 の連続値。閾値と比べる前の生のスコア。 */
  score: number
  /** jev の calibrated confidence。低いときは強い処置を避ける。 */
  confidence: number
  /** ベールに出す一言。「脅迫的な表現」など。 */
  reason: string
  /** キャッシュから返したか。ポップアップの統計に使う。 */
  cached: boolean
}

/** 判定に失敗したことを表す番兵。DOM には触らない。 */
export interface VerdictError {
  error: string
}

export type VerdictResult = Verdict | VerdictError

export function isError(r: VerdictResult): r is VerdictError {
  return "error" in r
}

/** 1 投稿ぶんの判定依頼。id は DOM の要素と結果を対応づけるためだけに使う。 */
export interface PostInput {
  id: string
  text: string
}
