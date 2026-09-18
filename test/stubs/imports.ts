/** WXT の #imports のうち、テストで触れる分だけを差し替える。 */
export const storage = {
  defineItem<T>(_key: string, opts: { fallback: T }) {
    let value = opts.fallback
    return {
      getValue: async () => value,
      setValue: async (v: T) => {
        value = v
      },
      watch: (_cb: (v: T) => void) => () => {},
    }
  },
}
