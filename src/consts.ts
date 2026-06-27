// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = "Foiga Photography";
export const SITE_DESCRIPTION = "Professional photography portfolio by Foiga — capturing moments that last forever.";

// 内部リンクを base（サイトのサブパス）付きに整形する。
// Cloudflare では base が "/" なので従来どおり、GitHub Pages では "/astro-blog-starter-template/" が付く。
export function link(path: string): string {
	const base = import.meta.env.BASE_URL;
	const b = base.endsWith("/") ? base.slice(0, -1) : base;
	if (path === "/") return b + "/" || "/";
	return b + path; // path は "/" から始まる前提
}
