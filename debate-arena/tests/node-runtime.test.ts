import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("compiled server loads in native Node ESM without Vite or tsx resolution", () => {
  const output = mkdtempSync(join(tmpdir(), "arena-node-runtime-"));
  try {
    execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "api/[...route].ts",
      "--outDir", output, "--rootDir", ".", "--module", "NodeNext", "--moduleResolution", "NodeNext",
      "--target", "ES2022", "--skipLibCheck", "--esModuleInterop"], { stdio: "pipe" });
    writeFileSync(join(output, "package.json"), '{"type":"module"}');
    const entry = pathToFileURL(join(output, "api", "[...route].js")).href;
    const result = execFileSync(process.execPath, ["--input-type=module", "-e",
      `const {default: handler} = await import(${JSON.stringify(entry)});
      let body; await handler({url:'/api/config',method:'GET',body:{},headers:{},socket:{}},
        {setHeader(){},end(value){body=JSON.parse(value)}});
      if (!body || !Array.isArray(body.missing)) throw new Error('Invalid config response');
      console.log('native-runtime-ok');`], { encoding: "utf8", env: { ...process.env, VERCEL: "1" } });
    assert.match(result, /native-runtime-ok/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
