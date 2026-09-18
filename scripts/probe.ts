/**
 * jev に実際のツイートを通して、判定とレイテンシを確かめるための素振り。
 *
 *   TYPESAFE_API_KEY=... npm run probe
 *
 * 拡張を読み込まなくても、閾値の当たりと 1 往復の実測が取れる。
 * サンプルは旧実装のシステムプロンプトが「変換する／しない」として
 * 挙げていた文をそのまま使っている。
 */
import { ask } from "../src/core/jev"
import { packPlan, soloQuestions } from "../src/core/questions"
import { DEFAULT_SETTINGS } from "../src/core/settings"
import { Level } from "../src/core/types"
import { readSignals, toVerdict } from "../src/core/verdict"

const SAMPLES = [
  "おはようございます",
  "バカおもろいんだけどｗｗｗｗ",
  "マジ尊い…死ぬ…",
  "この映画、脚本が雑すぎて最後まで乗れなかった",
  "普通にそれしてるの頭悪いよね",
  "お前が死んだら世界は平和になるよ",
  "ぶち殺すぞお前",
  "そんなんだから彼氏できないんだよ",
]

const LEVEL_NAME: Record<number, string> = {
  [Level.Safe]: "素通し",
  [Level.Veiled]: "ぼかす",
  [Level.Blocked]: "隠す  ",
}

const apiKey = process.env.TYPESAFE_API_KEY
if (!apiKey) {
  console.error("TYPESAFE_API_KEY を環境変数に入れてください。")
  process.exit(1)
}

const settings = { ...DEFAULT_SETTINGS, apiKey }

async function solo() {
  console.log("\n── solo（1 投稿 6 問 × 8 リクエスト）")
  const started = Date.now()
  let tokens = 0
  await Promise.all(
    SAMPLES.map(async (text) => {
      const t0 = Date.now()
      const res = await ask({
        apiKey: apiKey!,
        model: settings.model,
        state: text,
        questions: soloQuestions(),
      })
      tokens += res.usage.input_tokens
      const s = readSignals(res.answers)
      if (!s) return
      const v = toVerdict(s, settings)
      report(text, v, Date.now() - t0)
    }),
  )
  console.log(`  合計 ${Date.now() - started}ms / 入力 ${tokens} tokens`)
}

async function pack() {
  console.log("\n── pack（8 投稿 16 問 × 1 リクエスト）")
  const started = Date.now()
  const plan = packPlan(SAMPLES.map((text, i) => ({ id: String(i), text })))
  const res = await ask({
    apiKey: apiKey!,
    model: settings.model,
    state: plan.state,
    questions: plan.questions,
  })
  const elapsed = Date.now() - started
  for (const [slot, id] of plan.slots) {
    const s = readSignals(res.answers, slot)
    if (s) report(SAMPLES[Number(id)]!, toVerdict(s, settings), elapsed)
  }
  console.log(`  合計 ${elapsed}ms / 入力 ${res.usage.input_tokens} tokens`)
}

function report(
  text: string,
  v: ReturnType<typeof toVerdict>,
  ms: number,
): void {
  console.log(
    `  ${LEVEL_NAME[v.level]}  score=${v.score.toFixed(2)}  conf=${v.confidence.toFixed(2)}  ${String(ms).padStart(4)}ms  ${text}`,
  )
}

await solo()
await pack()
