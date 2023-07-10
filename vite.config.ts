import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ManifestV3Export, crx } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "CRXJS React Vite Example",
  version: "1.0.0",
  action: { default_popup: "index.html" },
};

export default defineConfig({
  plugins: [react(), crx({ manifest })],
});
