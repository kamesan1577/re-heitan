import type { Settings } from "../core/settings"
import { isError, Level, type VerdictResult } from "../core/types"

/** 判定の結果を DOM に反映する。CSS の出し分けは data-rh-state に寄せてある。 */

type State = "pending" | "veiled" | "hidden"

function setState(cell: HTMLElement, state: State | null): void {
  cell.querySelector(".rh-overlay")?.remove()
  if (state === null) {
    cell.removeAttribute("data-rh-state")
    return
  }
  cell.setAttribute("data-rh-state", state)
}

/** 判定が返るまでのぼかし。 */
export function markPending(cell: HTMLElement): void {
  setState(cell, "pending")
  cell.appendChild(overlay("確認しています…", "", null))
}

export function apply(
  cell: HTMLElement,
  verdict: VerdictResult,
  settings: Settings,
): void {
  // 判定に失敗したときは素通しにする。検閲を落とすほうが、
  // 何も見えないタイムラインを残すよりましだと考えている。
  if (isError(verdict)) {
    setState(cell, null)
    return
  }

  if (verdict.level === Level.Safe) {
    setState(cell, null)
    return
  }

  if (verdict.level === Level.Blocked && settings.blockedAction === "hide") {
    setState(cell, "hidden")
    return
  }

  setState(cell, "veiled")
  const label =
    verdict.level === Level.Blocked
      ? "誹謗中傷と判定した投稿です。"
      : "過激な投稿の可能性があります。"
  cell.appendChild(
    overlay(label, verdict.reason, () => {
      setState(cell, null)
    }),
  )
}

function overlay(
  label: string,
  reason: string,
  onReveal: (() => void) | null,
): HTMLElement {
  const root = document.createElement("div")
  root.className = "rh-overlay"
  // X 側のテーマに合わせる。背景色は行の親から拾うのが一番外れにくい。
  root.style.backgroundColor = window.getComputedStyle(document.body).backgroundColor

  const text = document.createElement("p")
  text.className = "rh-overlay__label"
  text.textContent = label
  if (reason) {
    const small = document.createElement("span")
    small.className = "rh-overlay__reason"
    small.textContent = ` (${reason})`
    text.appendChild(small)
  }
  root.appendChild(text)

  const button = document.createElement("button")
  button.className = "rh-overlay__button"
  button.type = "button"
  button.textContent = "表示する"
  button.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    onReveal?.()
  })
  root.appendChild(button)

  return root
}
