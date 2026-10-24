import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFrontendHandler } from "../src/frontend.ts";

let directory: string;
let handle: ReturnType<typeof createFrontendHandler>;
const html = "<!doctype html><html><body>Catchup production fixture</body></html>";
const script = "console.log('built frontend');";

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "catchup-static-test-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), html);
  await writeFile(join(directory, "assets/app.js"), script);
  await writeFile(join(directory, "assets/font.woff2"), new Uint8Array([1, 2, 3, 4]));
  handle = createFrontendHandler(directory);
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("production frontend serving", () => {
  test("serves built HTML, JavaScript, fonts, and equivalent HEAD headers", async () => {
    const home = await handle(new Request("http://localhost/"));
    expect(home.status).toBe(200);
    expect(home.headers.get("Content-Type")).toContain("text/html");
    expect(home.headers.get("Cache-Control")).toBe("no-cache");
    expect(await home.text()).toBe(html);

    const asset = await handle(new Request("http://localhost/assets/app.js"));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Content-Type")).toContain("javascript");
    expect(await asset.text()).toBe(script);
    const head = await handle(new Request("http://localhost/assets/app.js", { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe(asset.headers.get("Content-Type"));
    expect(head.headers.get("Content-Length")).toBe(String(script.length));
    expect(await head.text()).toBe("");

    const font = await handle(new Request("http://localhost/assets/font.woff2"));
    expect(font.status).toBe(200);
    expect(new Uint8Array(await font.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test("falls back for page navigation without substituting HTML for assets or APIs", async () => {
    const navigation = await handle(new Request("http://localhost/chats/bob"));
    expect(navigation.status).toBe(200);
    expect(await navigation.text()).toBe(html);
    for (const path of ["/assets/missing.js", "/assets/missing", "/missing.css", "/api", "/api/catchup/dashboard"]) {
      const response = await handle(new Request(`http://localhost${path}`));
      expect(response.status).toBe(404);
      expect(await response.text()).not.toBe(html);
    }
    const mutation = await handle(new Request("http://localhost/chats/bob", { method: "POST" }));
    expect(mutation.status).toBe(405);
    expect(mutation.headers.get("Allow")).toBe("GET, HEAD");
  });

  test("rejects malformed and escaping paths and explains a missing build", async () => {
    const escape = await handle(new Request("http://localhost/%2e%2e%2fpackage.json"));
    expect(escape.status).toBe(404);
    const malformed = await handle(new Request("http://localhost/%zz"));
    expect(malformed.status).toBe(400);
    const nullByte = await handle(new Request("http://localhost/%00"));
    expect(nullByte.status).toBe(400);
    const absentBuild = createFrontendHandler(join(directory, "not-built"));
    const unavailable = await absentBuild(new Request("http://localhost/"));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).toContain("bun run build");
  });
});
