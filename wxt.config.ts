import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "re:へいたん",
    description:
      "X のタイムラインから誹謗中傷を取り除きます。判定は System One モデル jev が行います。",
    permissions: ["storage"],
    // jev へは background service worker から直接送る。MV3 の service worker から
    // の fetch は CORS の対象外なので、host_permissions に載せればプロキシは要らない。
    host_permissions: [
      "https://x.com/*",
      "https://twitter.com/*",
      "https://api.typesafe.ai/*",
    ],
  },
})
