// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// GitHub Pages 向けビルド時のみ静的出力＋サブパスに切り替える。
// 通常（Cloudflare）の挙動は従来どおり。
const isPages = process.env.DEPLOY_TARGET === "pages";

// https://astro.build/config
export default defineConfig({
	site: isPages ? "https://foiga.github.io" : "https://example.com",
	base: isPages ? "/astro-blog-starter-template" : "/",
	integrations: [mdx(), sitemap()],
	...(isPages
		? {}
		: {
				adapter: cloudflare({
					platformProxy: {
						enabled: true,
					},
				}),
			}),
});
