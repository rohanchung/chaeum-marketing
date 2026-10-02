const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { test } = require("node:test");

require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    file,
  );

// Load only the helper; the client itself needs browser env variables.
const source = fs.readFileSync(require.resolve("../src/lib/supabase.ts"), "utf8");
const helper = source.slice(0, source.indexOf("export const supabase"));
const module_ = { exports: {} };
new Function("exports", "module", "require", ts.transpileModule(helper.replace(/^import .*$/m, ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(module_.exports, module_, require);
const { fetchWithTimeout } = module_.exports;

// A fetch that never answers unless aborted, like a request stalled by sleep.
const stalledFetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });

test("a stalled request fails after the timeout instead of waiting forever", async () => {
  await assert.rejects(fetchWithTimeout("https://example.test", {}, 20, stalledFetch), /서버 응답이 없습니다/);
});

test("a normal response passes through unchanged", async () => {
  const response = await fetchWithTimeout("https://example.test", {}, 1000, async () => new Response("ok"));
  assert.equal(await response.text(), "ok");
});

test("an abort requested by the caller is kept", async () => {
  const controller = new AbortController();
  const pending = fetchWithTimeout("https://example.test", { signal: controller.signal }, 1000, stalledFetch);
  controller.abort(new Error("caller cancelled"));
  await assert.rejects(pending, /caller cancelled/);
});
