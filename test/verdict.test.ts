import assert from "node:assert/strict"
import { test } from "vitest"

import { packPlan, soloQuestions } from "../src/core/questions"
import { DEFAULT_SETTINGS } from "../src/core/settings"
import { Level } from "../src/core/types"
import { compose, readSignals, toVerdict, type Signals } from "../src/core/verdict"

const sev = (score: number, confidence = 0.9) => ({
  type: "score" as const,
  score,
  legend: { "0": "a", "1": "b", "2": "c" },
  probabilities: {},
  confidence,
})
const nl = (noul: number) => ({ type: "noul" as const, noul })

test("severity は レベル数-1 で割って 0..1 に正規化される", () => {
  const s = readSignals({ sev: sev(2) })!
  assert.equal(s.severity, 1)
  assert.equal(readSignals({ sev: sev(1) })!.severity, 0.5)
})

test("attack が無いときは severity で代用する", () => {
  assert.equal(readSignals({ sev: sev(1) })!.attack, 0.5)
})

test("明確な脅迫は高スコアになる", () => {
  const s: Signals = {
    severity: 1, confidence: 0.9, attack: 0.95,
    slur: 0.8, threat: 0.97, sexual: 0.02, banter: 0.05,
  }
  const { score, reason } = compose(s)
  assert.ok(score > 0.9, `score=${score}`)
  assert.equal(reason, "暴力をほのめかす表現")
  assert.equal(toVerdict(s, DEFAULT_SETTINGS).level, Level.Blocked)
})

test("『マジ尊い…死ぬ…』型は banter で押し下がる", () => {
  // 強い語はあるが攻撃意図がない、という jev の答えを想定する。
  const s: Signals = {
    severity: 0.5, confidence: 0.85, attack: 0.08,
    slur: 0.15, threat: 0.3, sexual: 0.02, banter: 0.93,
  }
  const { score } = compose(s)
  assert.ok(score < DEFAULT_SETTINGS.veilThreshold, `score=${score}`)
  assert.equal(toVerdict(s, DEFAULT_SETTINGS).level, Level.Safe)
})

test("敵意が強いときは banter で押し下げない", () => {
  const hostile: Signals = {
    severity: 1, confidence: 0.9, attack: 0.95,
    slur: 0.9, threat: 0.9, sexual: 0, banter: 0.9,
  }
  assert.ok(compose(hostile).score > 0.9)
})

test("confidence が低いと Blocked まで踏み込まず Veiled で止まる", () => {
  const s: Signals = {
    severity: 1, confidence: 0.3, attack: 0.95,
    slur: 0.9, threat: 0.9, sexual: 0, banter: 0,
  }
  assert.equal(toVerdict(s, DEFAULT_SETTINGS).level, Level.Veiled)
})

test("健全な投稿は Safe", () => {
  const s: Signals = {
    severity: 0.02, confidence: 0.95, attack: 0.02,
    slur: 0.01, threat: 0.01, sexual: 0.01, banter: 0.2,
  }
  assert.equal(toVerdict(s, DEFAULT_SETTINGS).level, Level.Safe)
})

test("pack モードは 1 投稿あたり 2 問、スロットと id が対応する", () => {
  const plan = packPlan([
    { id: "t1", text: "a" },
    { id: "t2", text: "b" },
    { id: "t3", text: "c" },
  ])
  assert.equal(Object.keys(plan.questions).length, 6)
  assert.deepEqual(plan.state.posts.map((p) => p.id), ["p0", "p1", "p2"])
  assert.equal(plan.slots.get("p1"), "t2")
  assert.ok("p2_sev" in plan.questions && "p2_attack" in plan.questions)
})

test("pack の answers はスロット接頭辞で読み分けられる", () => {
  const answers = {
    p0_sev: sev(0.1), p0_attack: nl(0.05),
    p1_sev: sev(2), p1_attack: nl(0.9),
  }
  assert.ok(readSignals(answers, "p0")!.severity < 0.1)
  assert.equal(readSignals(answers, "p1")!.attack, 0.9)
})

test("solo モードの質問は 6 問", () => {
  assert.equal(Object.keys(soloQuestions()).length, 6)
})
