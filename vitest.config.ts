import { defineConfig } from "vitest/config"

// settings.ts が WXT の #imports から storage を取るので、テストでは
// chrome.storage を持たないダミーに差し替える。判定ロジックは設定の
// 「型」だけを使うため、これで純粋な関数として検証できる。
export default defineConfig({
  resolve: {
    alias: { "#imports": new URL("./test/stubs/imports.ts", import.meta.url).pathname },
  },
  test: { environment: "node" },
})
