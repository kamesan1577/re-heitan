import { defineConfig } from "vitest/config"

// 判定ロジックは settings.ts の型と既定値しか使わないので、テストは
// #imports に触れない。storage を使うコード（settings-store.ts）を
// テストから読み込む場合に備えて、ダミーへの alias だけ残しておく。
export default defineConfig({
  resolve: {
    alias: { "#imports": new URL("./test/stubs/imports.ts", import.meta.url).pathname },
  },
  test: { environment: "node" },
})
