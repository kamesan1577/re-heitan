import type { Answer } from "./jev"
import type { Settings } from "./settings"
import { Level, type Verdict } from "./types"

/** jev の生の答えから取り出した、合成前のシグナル。 */
export interface Signals {
  /** 0..1 に正規化した severity。 */
  severity: number
  /** severity の calibrated confidence。 */
  confidence: number
  attack: number
  /** 以下は solo モードのみ。pack モードでは undefined。 */
  slur?: number
  threat?: number
  sexual?: number
  banter?: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function noulOf(a: Answer | undefined): number | undefined {
  return a?.type === "noul" ? a.noul : undefined
}

/**
 * answers から 1 投稿ぶんのシグナルを取り出す。
 * prefix は pack モードのスロット名（"p3"）、solo モードでは空文字。
 */
export function readSignals(
  answers: Record<string, Answer>,
  prefix = "",
): Signals | null {
  const key = (name: string) => (prefix ? `${prefix}_${name}` : name)
  const sev = answers[key("sev")]
  if (sev?.type !== "score") return null

  // score は「レベル間に着地しうる確率加重値」なので、レベル数 - 1 で割れば 0..1 になる。
  const levels = Object.keys(sev.legend).length
  const severity = levels > 1 ? clamp01(sev.score / (levels - 1)) : 0

  return {
    severity,
    confidence: sev.confidence,
    attack: noulOf(answers[key("attack")]) ?? severity,
    slur: noulOf(answers[key("slur")]),
    threat: noulOf(answers[key("threat")]),
    sexual: noulOf(answers[key("sexual")]),
    banter: noulOf(answers[key("banter")]),
  }
}

/**
 * シグナルを 1 本のスコアに畳む。
 *
 * severity だけでも判定はできるが、それだと「死ぬほど尊い」のような誇張と
 * 本物の脅迫を取り違える。attack で意図の有無を、banter で悪意のなさを
 * 別々に測り、脅迫がはっきりしているときだけ banter の減点を無効にする。
 */
export function compose(s: Signals): { score: number; reason: string } {
  const harm = Math.max(s.slur ?? 0, s.threat ?? 0, s.sexual ?? 0)
  const intent = s.slur === undefined ? s.attack : 0.6 * s.attack + 0.4 * harm

  const base = 0.5 * s.severity + 0.5 * intent

  // 悪意のなさは、攻撃意図や脅迫が強いときには効かせない。
  const hostility = Math.max(s.attack, s.threat ?? 0)
  const damp = (s.banter ?? 0) * (1 - hostility)

  return { score: clamp01(base - 0.4 * damp), reason: pickReason(s) }
}

function pickReason(s: Signals): string {
  if ((s.threat ?? 0) > 0.5) return "暴力をほのめかす表現"
  if ((s.slur ?? 0) > 0.5) return "侮蔑的な表現"
  if ((s.sexual ?? 0) > 0.5) return "性的な侮辱"
  if (s.attack > 0.5) return "特定の相手への攻撃"
  return "過激な表現"
}

/**
 * スコアを表示レベルに落とす。
 *
 * confidence が低い判定で投稿を丸ごと消すと、外した分だけタイムラインが
 * 静かに欠ける。低信頼のときは Blocked を Veiled に留め、読むかどうかを
 * 本人に返す。docs の confidence-gated routing をそのまま当てている。
 */
export function toVerdict(s: Signals, settings: Settings): Verdict {
  const { score, reason } = compose(s)

  let level: Level
  if (score >= settings.blockThreshold) {
    level =
      s.confidence >= settings.minConfidence ? Level.Blocked : Level.Veiled
  } else if (score >= settings.veilThreshold) {
    level = Level.Veiled
  } else {
    level = Level.Safe
  }

  return { level, score, confidence: s.confidence, reason, cached: false }
}
