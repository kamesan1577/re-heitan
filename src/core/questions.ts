import { noul, score, type Question } from "./jev"
import type { PostInput } from "./types"

/**
 * 旧実装は 1 本の長いシステムプロンプトで GPT に「level を返せ」と頼んでいた。
 * jev には文章を渡せないので、同じ判断基準を独立した質問に割り、
 * 合成は verdict.ts のコード側で行う。どの語をどれだけ効かせるかが
 * プロンプトの文面ではなく数式になるので、閾値を後から動かせる。
 */

/** 「攻撃の意図がなければ許容する」という旧プロンプトの方針を各質問に効かせる補足。 */
const INTENT_NOTE =
  "相手を傷つける意図があるかどうかで判断すること。攻撃の意図がない下品な言葉・性的な話題・暴力的な比喩・自虐は該当しない。"

const SEVERITY_LEVELS = [
  "健全。批判や不満を述べていても、相手の人格を貶めてはいない。",
  "とげがある。露骨ではないが、読み手によっては不快になりうる言い回しを含む。",
  "明確な誹謗中傷。相手の人格を否定する、侮辱する、脅すことが目的になっている。",
]

/** 投稿 1 件を単独で評価するときの質問セット（精度寄り）。 */
export function soloQuestions(): Record<string, Question> {
  return {
    sev: score(
      `この SNS 投稿が読み手を傷つける度合いを判定してください。${INTENT_NOTE}`,
      SEVERITY_LEVELS,
    ),
    attack: noul(`特定の個人または集団を貶める意図がありますか。${INTENT_NOTE}`, {
      true: "名指し・当てこすりを問わず、誰かを攻撃している",
      false: "対象がいない、または事象や作品への感想・批判にとどまる",
    }),
    slur: noul("侮蔑語、差別語、または人格そのものを否定する言葉を含みますか。", {
      true: "相手に向けた侮蔑語・差別語・人格否定がある",
      false: "強い語があっても相手に向いていない、または自分に向いている",
    }),
    threat: noul("他者への暴力や危害をほのめかしていますか。", {
      true: "殺害・暴力・危害の予告やほのめかしがある",
      false: "『死ぬほど尊い』のような誇張表現にとどまる",
    }),
    sexual: noul("相手を辱める意図の性的な表現を含みますか。", {
      true: "特定の相手に向けた性的な侮辱や揶揄がある",
      false: "性的な話題でも特定の誰かを辱めてはいない",
    }),
    banter: noul(
      "内輪のノリ、自虐、あるいは親しみを込めた誇張として書かれていますか。",
      {
        true: "『バカおもろい』『尊すぎて死ぬ』のように、悪意なく強い語を使っている",
        false: "相手への敵意が読み取れる",
      },
    ),
  }
}

/** 質問キーの接頭辞と投稿 id の対応。pack モードで結果を戻すのに使う。 */
export interface PackPlan {
  questions: Record<string, Question>
  state: { posts: Array<{ id: string; text: string }> }
  /** 質問キーの接頭辞 → 投稿 id。 */
  slots: Map<string, string>
}

/**
 * 複数投稿を 1 リクエストにまとめる。state は 1 度しか読まれないので、
 * 投稿数ぶんの往復が 1 回に畳まれる。1 投稿あたりの質問は 2 問に絞り、
 * 64k のコンテキストと 1 リクエストあたりの遅延に収まるようにしている。
 */
export function packPlan(posts: PostInput[]): PackPlan {
  const questions: Record<string, Question> = {}
  const slots = new Map<string, string>()

  posts.forEach((post, i) => {
    const slot = `p${i}`
    slots.set(slot, post.id)
    questions[`${slot}_sev`] = score(
      {
        target: slot,
        task: `state.posts のうち id が "${slot}" の投稿だけを評価してください。他の投稿は文脈として読むにとどめること。読み手を傷つける度合いを判定します。${INTENT_NOTE}`,
      },
      SEVERITY_LEVELS,
    )
    questions[`${slot}_attack`] = noul({
      target: slot,
      task: `state.posts のうち id が "${slot}" の投稿は、特定の個人または集団を貶める意図がありますか。${INTENT_NOTE}`,
    })
  })

  return {
    questions,
    state: { posts: posts.map((p, i) => ({ id: `p${i}`, text: p.text })) },
    slots,
  }
}
