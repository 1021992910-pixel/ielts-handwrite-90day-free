const STATIC_ASSETS = __STATIC_ASSETS__;

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), geolocation=(), payment=()"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "当前为免费本机识别版，不提供云端收费识别。" }, {
        status: 410, headers: { ...securityHeaders, "Cache-Control": "no-store" }
      });
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: securityHeaders });
    }
    const key = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = STATIC_ASSETS[key] || (!url.pathname.includes(".") ? STATIC_ASSETS["/index.html"] : null);
    if (!asset) return new Response("Not found", { status: 404, headers: securityHeaders });
    return new Response(request.method === "HEAD" ? null : asset.body, {
      headers: {
        ...securityHeaders,
        "Content-Type": asset.contentType,
        "Cache-Control": key === "/sw.js" || key === "/index.html" ? "no-cache" : "public, max-age=3600"
      }
    });
  }
};
