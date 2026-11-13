export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/_headers" || url.pathname === "/_redirects") {
      return new Response(null, { status: 404 });
    }
    if (url.pathname === "/install.sh") {
      // shortcut: proxy from GitHub main so the served installer always matches the repo, upgrade to building it into dist if drift matters
      const r = await fetch("https://raw.githubusercontent.com/heyitslumi/solstice/main/install.sh", { cf: { cacheTtl: 60 } });
      const body = await r.arrayBuffer();
      return new Response(body, {
        headers: { "content-type": "text/x-shellscript; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }
    return env.ASSETS.fetch(req);
  }
};
