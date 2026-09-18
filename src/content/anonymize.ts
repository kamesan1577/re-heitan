import type { Settings } from "../core/settings"

/**
 * デモ用の目隠し。切り替えは html の data-rh-anon 属性だけで、
 * 見た目は anonymize.css が受け持つ。属性 1 つで済ませているので、
 * 無限スクロールで後から現れた投稿にも観測なしで効く。
 */

const MOSAIC_FILTER_ID = "rh-mosaic"

/** 目印を付けた @ メンション。CSS 側はこの属性だけを見る。 */
const HANDLE_MARK = "data-rh-anon-handle"

export function applyAnonymize(mode: Settings["anonymize"]): void {
  const root = document.documentElement
  if (mode === "off") {
    root.removeAttribute("data-rh-anon")
    stopHandleTagging()
    return
  }
  if (mode === "mosaic") ensureMosaicFilter()
  root.setAttribute("data-rh-anon", mode)
  startHandleTagging()
}

/*
 * 表示名と @ID の組は data-testid="User-Name" に入っているので CSS だけで
 * 隠せる。困るのは「返信先: @someone」や本文中のメンションで、こちらには
 * 目印になる属性がない。テキストが @ ではじまるリンクを探して印を付ける。
 */

let handleObserver: MutationObserver | null = null
let tagTimer: ReturnType<typeof setTimeout> | null = null

function tagHandles(): void {
  for (const a of document.querySelectorAll<HTMLElement>(
    `a[href^="/"]:not([${HANDLE_MARK}])`,
  )) {
    if (a.textContent?.trimStart().startsWith("@")) a.setAttribute(HANDLE_MARK, "")
  }
}

function startHandleTagging(): void {
  tagHandles()
  if (handleObserver) return
  handleObserver = new MutationObserver(() => {
    // 無限スクロール中に何度も走るので、1 フレームぶんまとめる。
    if (tagTimer) return
    tagTimer = setTimeout(() => {
      tagTimer = null
      tagHandles()
    }, 100)
  })
  handleObserver.observe(document.body, { childList: true, subtree: true })
}

function stopHandleTagging(): void {
  handleObserver?.disconnect()
  handleObserver = null
  if (tagTimer) clearTimeout(tagTimer)
  tagTimer = null
  for (const a of document.querySelectorAll(`[${HANDLE_MARK}]`)) {
    a.removeAttribute(HANDLE_MARK)
  }
}

/**
 * CSS だけではモザイクをかけられないので、SVG フィルタを 1 つ差し込む。
 * feFlood と feTile で作った格子で元画像を間引き、feMorphology で
 * 残った点を広げてタイル状に潰している。
 */
function ensureMosaicFilter(): void {
  if (document.getElementById(MOSAIC_FILTER_ID)) return

  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("width", "0")
  svg.setAttribute("height", "0")
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"

  const filter = document.createElementNS(NS, "filter")
  filter.id = MOSAIC_FILTER_ID
  filter.setAttribute("x", "0")
  filter.setAttribute("y", "0")

  const flood = document.createElementNS(NS, "feFlood")
  flood.setAttribute("x", "2")
  flood.setAttribute("y", "2")
  flood.setAttribute("width", "1")
  flood.setAttribute("height", "1")

  const composite = document.createElementNS(NS, "feComposite")
  composite.setAttribute("width", "6")
  composite.setAttribute("height", "6")

  const tile = document.createElementNS(NS, "feTile")
  tile.setAttribute("result", "grid")

  const sample = document.createElementNS(NS, "feComposite")
  sample.setAttribute("in", "SourceGraphic")
  sample.setAttribute("in2", "grid")
  sample.setAttribute("operator", "in")

  const spread = document.createElementNS(NS, "feMorphology")
  spread.setAttribute("operator", "dilate")
  spread.setAttribute("radius", "3")

  filter.append(flood, composite, tile, sample, spread)
  svg.appendChild(filter)
  document.body.appendChild(svg)
}
