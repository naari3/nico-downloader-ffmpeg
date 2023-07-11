import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ManifestV3Export, crx } from "@crxjs/vite-plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "CRXJS React Vite Example",
  version: "1.0.0",
  action: { default_popup: "index.html" },
  permissions: ["scripting", "downloads"],
  host_permissions: ["<all_urls>"],
  content_scripts: [
    {
      js: ["src/content.tsx"],
      matches: ["https://www.nicovideo.jp/watch/*"],
      all_frames: true,
    },
  ],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  content_security_policy: {
    sandbox:
      "sandbox allow-scripts; script-src 'self' 'unsafe-eval' blob:; script-src-elem 'self' 'unsafe-eval' blob:; worker-src blob:; object-src 'self'; connect-src https://* data: blob: filesystem:;",
    extension_pages:
      "default-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://unpkg.com/ https://*.dmc.nico/ ws://localhost:5173/",
    // extension_pages:
    //   "sandbox allow-scripts; script-src 'self' 'unsafe-eval' blob:; script-src-elem 'self' 'unsafe-eval' blob:; worker-src blob:; object-src 'self'",
  },
  // sandbox: {
  //   pages: ["downloader.html"],
  // },
  web_accessible_resources: [
    // {
    //   resources: ["sandbox.html"],
    //   matches: ["<all_urls>"],
    //   use_dynamic_url: true,
    // },
    {
      resources: ["downloader.html"],
      matches: ["<all_urls>"],
      use_dynamic_url: true,
    },
  ],
};

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@ffmpeg/core-st/dist/ffmpeg-core.wasm",
          dest: "./",
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        // sandbox: "sandbox.html",
        downloader: "downloader.html",
      },
    },
  },
});
