import { extname, resolve, sep } from "node:path";

/** Serve only the built frontend; API requests remain owned by the gateway. */
export function createFrontendHandler(directory: string) {
  const root = resolve(directory);
  const index = Bun.file(resolve(root, "index.html"));

  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if (pathname.includes("\0")) return new Response("Invalid path", { status: 400 });
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    const filename = resolve(root, `.${pathname}`);
    if (filename !== root && !filename.startsWith(root + sep)) {
      return new Response("Not found", { status: 404 });
    }
    let file = Bun.file(filename);
    let isIndex = filename === resolve(root, "index.html");
    if (pathname === "/" || !(await file.exists())) {
      // An unavailable asset must not return HTML with a JavaScript/font URL.
      if (pathname !== "/" && (extname(pathname) || pathname.startsWith("/assets/"))) {
        return new Response("Not found", { status: 404 });
      }
      file = index;
      isIndex = true;
      if (!(await file.exists())) {
        return new Response("Frontend build missing. Run bun run build before starting.", { status: 503 });
      }
    }

    const headers = new Headers({ "Content-Type": file.type });
    if (isIndex) headers.set("Cache-Control", "no-cache");
    headers.set("Content-Length", String(file.size));
    return new Response(request.method === "HEAD" ? null : file, { headers });
  };
}
