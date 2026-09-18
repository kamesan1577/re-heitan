/**
 * X のタイムラインから投稿を拾う。
 *
 * data-testid は X の内部実装なので壊れうる。壊れたときに「全部素通し」に
 * 倒れるよう、見つからなければ空配列を返すだけにしてある。
 */

const CELL = '[data-testid="cellInnerDiv"]'
const TWEET_TEXT = '[data-testid="tweetText"]'

/** 判定に出した印。結果を DOM に戻すときのキーでもある。 */
const MARK = "data-rh-id"

/**
 * X は仮想スクロールで行の DOM を使い回す。印だけを見て弾くと、
 * 使い回された行に前の投稿の判定が残る。本文も併せて覚えておき、
 * 中身が入れ替わっていたら判定し直す。
 */
const judgedText = new WeakMap<HTMLElement, string>()

let counter = 0

export interface Tweet {
  id: string
  /** 隠す・ぼかす対象。タイムライン 1 行ぶんの箱。 */
  cell: HTMLElement
  text: string
}

/** まだ判定に出していない投稿を root 以下から集める。 */
export function collect(root: ParentNode = document): Tweet[] {
  const found: Tweet[] = []
  const seen = new Set<HTMLElement>()

  for (const textEl of root.querySelectorAll<HTMLElement>(TWEET_TEXT)) {
    const cell = textEl.closest<HTMLElement>(CELL)
    // 引用リツイートのように 1 行に本文が 2 つある場合、行全体を 1 件として扱う。
    if (!cell || seen.has(cell)) continue
    seen.add(cell)

    const text = cellText(cell)
    if (!text) continue
    if (judgedText.get(cell) === text) continue

    // 中身が入れ替わった行は、前の判定の見た目を落としてから出し直す。
    if (cell.hasAttribute(MARK)) reset(cell)

    const id = `t${++counter}`
    cell.setAttribute(MARK, id)
    judgedText.set(cell, text)
    found.push({ id, cell, text })
  }
  return found
}

/** 行に含まれる本文をすべてつなぐ。引用元も判定の材料にする。 */
function cellText(cell: HTMLElement): string {
  return [...cell.querySelectorAll<HTMLElement>(TWEET_TEXT)]
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
}

function reset(cell: HTMLElement): void {
  cell.removeAttribute("data-rh-state")
  cell.querySelector(".rh-overlay")?.remove()
}

/** root 自身が投稿を含むかどうか。MutationObserver の足切りに使う。 */
export function mayContainTweet(node: Node): node is HTMLElement {
  return (
    node instanceof HTMLElement &&
    (node.matches(TWEET_TEXT) || node.querySelector(TWEET_TEXT) !== null)
  )
}
