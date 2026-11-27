// node look.js <ios|android> <out.png> [--device <id>]
// A screenshot of the running app and what Maestro can see on it — every
// text, accessibility label and id with where it sits — for finding your way
// around a screen before writing its flow.
const fs = require("fs");
const { execFileSync } = require("child_process");
const { env, adb, device } = require("./device");

const args = process.argv.slice(2);
const at = args.indexOf("--device");
const named = at >= 0 ? args.splice(at, 2)[1] : null;
const [platform, out] = args;
if (!out) {
    console.log("Usage: node look.js <ios|android> <out.png> [--device <id>]");
    process.exit(1);
}
const id = device(platform, named);

if (platform === "ios") {
    execFileSync("xcrun", ["simctl", "io", id, "screenshot", out], { stdio: "ignore" });
} else {
    fs.writeFileSync(out, execFileSync(adb(), ["-s", id, "exec-out", "screencap", "-p"], { maxBuffer: 1 << 28 }));
}

const raw = execFileSync("maestro", ["--udid", id, "hierarchy"], { env: env(), maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
const seen = new Set();
(function walk(node) {
    const a = node.attributes ?? {};
    const line = [
        a.text && `text "${a.text}"`,
        a.accessibilityText && a.accessibilityText !== a.text && `label "${a.accessibilityText}"`,
        a.hintText && `hint "${a.hintText}"`,
        a["resource-id"] && `id "${a["resource-id"]}"`,
    ].filter(Boolean).join("  ");
    if (line && !seen.has(line + a.bounds)) {
        seen.add(line + a.bounds);
        console.log(`${line}  ${a.bounds ?? ""}`);
    }
    (node.children ?? []).forEach(walk);
})(JSON.parse(raw.slice(raw.indexOf("{"))));
console.log(out);
