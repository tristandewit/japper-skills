// node record.js <takes.js> [take|all] [portrait|landscape|both]
// Records the takes of an app's takes file into the folder the file sits in.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { record } = require("./recorder");

(async () => {
    const [file, which = "all", formats = "both"] = process.argv.slice(2);
    if (!file) {
        console.log("Usage: node record.js <takes.js> [take|all] [portrait|landscape|both]");
        process.exit(1);
    }
    const takesFile = path.resolve(file);
    const config = require(takesFile);
    const outDir = path.dirname(takesFile);

    const names = which === "all" ? Object.keys(config.takes) : [which];
    const keys = formats === "both" ? ["portrait", "landscape"] : [formats];
    for (const name of names) {
        if (!config.takes[name]) {
            console.log(`FAIL ${name}: no such take in ${takesFile}`);
            continue;
        }
        // A take that creates something real gets one go, so a retry never
        // makes a second one.
        const attempts = (config.once ?? []).includes(name) ? 1 : 3;
        for (const key of keys) {
            for (let attempt = 1; attempt <= attempts; attempt++) {
                const started = Date.now();
                const work = path.join(os.tmpdir(), "japper-demos", config.profile, `${name}-${key}`);
                try {
                    const out = await record(config, name, key, (demo) => config.takes[name](demo), { work, outDir });
                    fs.rmSync(work, { recursive: true, force: true });
                    console.log(`OK ${out} (${Math.round((Date.now() - started) / 1000)}s)`);
                    break;
                } catch (error) {
                    console.log(`FAIL ${name} ${key} (attempt ${attempt}/${attempts}): ${error.message.split("\n")[0]}`);
                }
            }
        }
    }
})();
