/**
 * TypeSafe System One（jev）の薄いクライアント。
 *
 * 公式 JS SDK は Node 20+ 向けなので、MV3 の service worker では fetch を
 * 直接叩く。エンドポイントは 1 つだけで、state と questions を送ると
 * questions と同じキーで answers が返る。
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue }

export interface NoulQuestion {
  type: "noul"
  instructions: JsonValue
  criteria?: { true?: string; false?: string }
}

export interface ChoiceQuestion {
  type: "choice"
  instructions: JsonValue
  criteria: Record<string, string | null>
}

export interface ScoreQuestion {
  type: "score"
  instructions: JsonValue
  /** 低い順に並べた 2 段階以上のレベル記述。 */
  criteria: string[]
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion

export interface NoulAnswer {
  type: "noul"
  /** 0（no）から 1（yes）。noul に confidence は付かない。 */
  noul: number
}

export interface ChoiceAnswer {
  type: "choice"
  choice: string
  probabilities: Record<string, number>
  confidence: number
}

export interface ScoreAnswer {
  type: "score"
  /** レベル間に着地しうる確率加重値。 */
  score: number
  legend: Record<string, string>
  probabilities: Record<string, number>
  confidence: number
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer

export interface SystemOneResponse {
  model: string
  answers: Record<string, Answer>
  usage: { input_tokens: number; output_tokens: number }
}

export class JevError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message)
    this.name = "JevError"
  }
}

export interface AskOptions {
  apiKey: string
  model: string
  state: JsonValue
  questions: Record<string, Question>
  signal?: AbortSignal
  /** 429 / 529 / ネットワーク断に対する再試行回数。 */
  maxAttempts?: number
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new DOMException("aborted", "AbortError"))
    })
  })

/**
 * state を 1 度だけ送り、すべての質問を並列に評価させる。
 * 質問をまとめるほど 1 問あたりのコストとレイテンシが下がる。
 */
export async function ask(opts: AskOptions): Promise<SystemOneResponse> {
  const maxAttempts = opts.maxAttempts ?? 3
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2000, 200 * 2 ** (attempt - 1))
      await sleep(backoff + Math.random() * 100, opts.signal)
    }
    try {
      return await send(opts)
    } catch (e) {
      lastError = e
      if (e instanceof JevError && !e.retryable) throw e
      if (e instanceof DOMException && e.name === "AbortError") throw e
    }
  }
  throw lastError
}

async function send(opts: AskOptions): Promise<SystemOneResponse> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: opts.state,
        model: opts.model,
        questions: opts.questions,
      }),
      signal: opts.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    throw new JevError(`ネットワークエラー: ${String(e)}`, undefined, true)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new JevError(
      `jev が ${res.status} を返しました${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
      res.status === 429 || res.status === 529 || res.status >= 500,
    )
  }
  return (await res.json()) as SystemOneResponse
}

// instructions は文字列でも JSON 構造でもよい。複数対象を 1 リクエストに
// 詰めるときは { target, task } のようなオブジェクトを渡すほうが混線しにくい。
export const noul = (
  instructions: JsonValue,
  criteria?: NoulQuestion["criteria"],
): NoulQuestion => ({ type: "noul", instructions, ...(criteria && { criteria }) })

export const score = (
  instructions: JsonValue,
  criteria: string[],
): ScoreQuestion => ({ type: "score", instructions, criteria })

export const choice = (
  instructions: JsonValue,
  criteria: Record<string, string | null>,
): ChoiceQuestion => ({ type: "choice", instructions, criteria })
