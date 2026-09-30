const STATIC_ASSETS = __STATIC_ASSETS__;

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), geolocation=(), payment=()"
};

function staticResponse(pathname) {
  const key = pathname === "/" ? "/index.html" : pathname;
  const asset = STATIC_ASSETS[key] || (!pathname.includes(".") ? STATIC_ASSETS["/index.html"] : null);
  if (!asset) return new Response("Not found", { status: 404, headers: securityHeaders });
  return new Response(asset.body, {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": key === "/sw.js" || key === "/index.html" ? "no-cache" : "public, max-age=3600",
      ...securityHeaders
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: securityHeaders });
    return staticResponse(url.pathname);
  }
};
