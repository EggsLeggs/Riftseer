import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const wranglerPath = fileURLToPath(
  new URL("../packages/web/wrangler.jsonc", import.meta.url),
);
const source = readFileSync(wranglerPath, "utf8");
const { config, error } = ts.parseConfigFileTextToJson(wranglerPath, source);

if (error) {
  const message = ts.flattenDiagnosticMessageText(error.messageText, "\n");
  throw new Error(`Could not parse ${wranglerPath}: ${message}`);
}

const runtimeVars = config?.env?.production?.vars;
const publicNames = ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"];
const mismatches = publicNames.flatMap((name) => {
  const buildValue = process.env[name];
  const runtimeValue = runtimeVars?.[name];

  if (typeof buildValue !== "string" || buildValue.length === 0) {
    return [`${name} is missing from the build environment`];
  }
  if (typeof runtimeValue !== "string") {
    return [`${name} is missing from env.production.vars in wrangler.jsonc`];
  }
  if (buildValue !== runtimeValue) {
    return [
      `${name} differs: build=${JSON.stringify(buildValue)}, runtime=${JSON.stringify(runtimeValue)}`,
    ];
  }
  return [];
});

if (mismatches.length > 0) {
  throw new Error(
    `Web public environment mismatch:\n- ${mismatches.join("\n- ")}`,
  );
}

console.log("Web build-time and production runtime public environment values match.");
