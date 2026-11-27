// node record.js <ios|android> <flow.yaml> [--device <id>] [--tries <n>]
// Records one demo take of a native app: films the simulator or Android
// device while Maestro runs the flow, then cuts the film to the part the flow
// marks, speeds up its waits and draws a mark on every tap. The video lands
// next to the flow, named after it.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn, spawnSync } = require("child_process");
const { env, adb, device } = require("./device");

const HEIGHT = 1920;
const ON_DEVICE = "/sdcard/japper-demo.mp4";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A flow says what the film should do with lines of its own, which Maestro
// does not know. Each becomes a script line Maestro runs and logs with its
// time: `- demo: start`, `- demo: hold 1500`, `- demo: fast`, `- demo: slow 3`.
function translate(source) {
    return source.replace(/^(\s*)- demo:\s*(.+?)\s*$/gm, (line, indent, mark) => {
        const hold = mark.match(/^hold (\d+)$/);
        if (hold) {
            // Maestro has no plain pause; this one keeps the app on screen for real.
            return `${indent}- evalScript: \${(function () { var end = Date.now() + ${hold[1]}; while (Date.now() < end) {} return 'demo hold'; })()}`;
        }
        if (!/^(start|fast|slow( \d+(\.\d+)?)?)$/.test(mark)) {
            throw new Error(`Unknown mark "- demo: ${mark}". There is start, hold <ms>, fast and slow <seconds>.`);
        }
        return `${indent}- evalScript: \${'demo ${mark}'}`;
    });
}

// A clean status bar, as in a store screenshot.
function tidy(platform, id, on) {
    const quiet = { stdio: "ignore" };
    if (platform === "ios") {
        const args = on
            ? ["override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--cellularBars", "4", "--wifiBars", "3"]
            : ["clear"];
        spawnSync("xcrun", ["simctl", "status_bar", id, ...args], quiet);
        return;
    }
    const sh = (...args) => spawnSync(adb(), ["-s", id, "shell", ...args], quiet);
    const demo = (...args) => sh("am", "broadcast", "-a", "com.android.systemui.demo", ...args);
    if (!on) {
        demo("-e", "command", "exit");
        return;
    }
    sh("settings", "put", "global", "sysui_demo_allowed", "1");
    demo("-e", "command", "enter");
    demo("-e", "command", "clock", "-e", "hhmm", "0941");
    demo("-e", "command", "battery", "-e", "level", "100", "-e", "plugged", "false");
    demo("-e", "command", "network", "-e", "wifi", "show", "-e", "level", "4");
    demo("-e", "command", "notifications", "-e", "visible", "false");
}

// Starts filming and answers with when it started and how to stop.
async function film(platform, id, raw) {
    if (platform === "ios") {
        const recorder = spawn("xcrun", ["simctl", "io", id, "recordVideo", "--codec", "h264", "--force", raw], { stdio: ["ignore", "ignore", "pipe"] });
        const startedAt = await new Promise((resolve, reject) => {
            let said = "";
            recorder.stderr.on("data", (chunk) => {
                said += chunk;
                if (/Recording started/.test(said)) {
                    resolve(Date.now());
                }
            });
            recorder.on("exit", () => reject(new Error(`The simulator would not record: ${said.trim()}`)));
            setTimeout(() => reject(new Error("The simulator did not start recording")), 30000);
        });
        return {
            startedAt,
            async stop() {
                const done = new Promise((resolve) => recorder.on("exit", resolve));
                recorder.kill("SIGINT");
                await done;
            },
        };
    }
    // Android films for three minutes at most, on the device itself.
    const shell = (...args) => spawnSync(adb(), ["-s", id, "shell", ...args], { stdio: "ignore" });
    shell("rm", "-f", ON_DEVICE);
    const recorder = spawn(adb(), ["-s", id, "shell", "screenrecord", "--bit-rate", "16000000", "--time-limit", "180", ON_DEVICE], { stdio: "ignore" });
    const startedAt = Date.now();
    await sleep(1500);
    return {
        startedAt,
        async stop() {
            const done = new Promise((resolve) => recorder.on("exit", resolve));
            shell("pkill", "-2", "screenrecord");
            await Promise.race([done, sleep(8000)]);
            await sleep(800);
            execFileSync(adb(), ["-s", id, "pull", ON_DEVICE, raw], { stdio: "ignore" });
            shell("rm", "-f", ON_DEVICE);
        },
    };
}

// What Maestro did and when, read from its debug output: the marks and each
// command's time from its command record, the taps and the screen's size
// from its log.
function timeline(debug, startedAt) {
    const record = fs.readdirSync(debug).find((file) => /^commands-.*\.json$/.test(file));
    if (!record) {
        throw new Error("Maestro left no record of the flow");
    }
    const commands = JSON.parse(fs.readFileSync(path.join(debug, record)))
        .filter((entry) => entry.metadata?.timestamp)
        .sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);
    const seconds = (epoch) => (epoch - startedAt) / 1000;
    const ended = (entry) => entry.metadata.timestamp + (entry.metadata.duration ?? 0);

    const marks = [];
    for (const entry of commands) {
        const mark = JSON.stringify(entry.command).match(/'demo (start|fast|slow)( [\d.]+)?'/);
        if (mark) {
            marks.push({ kind: mark[1], value: mark[2] ? Number(mark[2]) : null, at: seconds(ended(entry)) });
        }
    }
    const launch = commands.find((entry) => "launchAppCommand" in entry.command);
    const start = marks.find((mark) => mark.kind === "start")?.at ?? seconds(launch ? ended(launch) : commands[0].metadata.timestamp);
    const end = seconds(ended(commands[commands.length - 1])) + 1;

    const spans = [];
    let from = null;
    for (const mark of marks) {
        if (mark.kind === "fast") {
            from = mark.at;
        } else if (mark.kind === "slow" && from !== null) {
            spans.push({ from, to: mark.at, cap: mark.value ?? 1.5 });
            from = null;
        }
    }

    // The log tells the time of day only.
    const log = fs.readFileSync(path.join(debug, "maestro.log"), "utf8");
    const clock = (stamp) => {
        const [h, m, s, ms] = stamp.split(/[:.]/).map(Number);
        const day = new Date(startedAt);
        day.setHours(h, m, s, ms);
        return seconds(day.getTime() < startedAt - 3600000 ? day.getTime() + 86400000 : day.getTime());
    };
    const grid = log.match(/widthGrid=(\d+), heightGrid=(\d+)/);
    const taps = grid
        ? [...log.matchAll(/^(\d\d:\d\d:\d\d\.\d{3}).*?[Tt]apping at \((\d+), (\d+)\)/gm)].map((tap) => ({
              at: clock(tap[1]),
              x: Number(tap[2]) / Number(grid[1]),
              y: Number(tap[3]) / Number(grid[2]),
          }))
        : [];
    return { start, end, spans, taps: taps.filter((tap) => tap.at >= start && tap.at <= end) };
}

function cut(raw, { start, end, spans, taps }, work, out) {
    const [width, height, length] = execFileSync("ffprobe", [
        "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", raw,
    ]).toString().trim().split(/[,\n]/).map(Number);
    end = Math.min(end, length);
    if (!(end > start)) {
        throw new Error("The film ended before the flow's start mark");
    }
    const outWidth = Math.floor((width * HEIGHT) / height / 2) * 2;

    // One mark, shown where each tap lands from just before it until just after.
    const size = Math.round(outWidth * 0.11 / 2) * 2;
    const r = size / 2;
    const mark = path.join(work, "tap.png");
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error", "-f", "lavfi",
        "-i", `color=c=black@0:s=${size}x${size},format=rgba,geq=r='if(gte(hypot(X-${r},Y-${r}),${r - 5}),255,70)':g='if(gte(hypot(X-${r},Y-${r}),${r - 5}),255,70)':b='if(gte(hypot(X-${r},Y-${r}),${r - 5}),255,70)':a='if(lte(hypot(X-${r},Y-${r}),${r - 1}),if(gte(hypot(X-${r},Y-${r}),${r - 5}),235,120),0)'`,
        "-frames:v", "1", mark,
    ]);
    const where = (axis, extent) => taps.reduceRight(
        (rest, tap) => `if(between(t,${(tap.at - 0.1).toFixed(3)},${(tap.at + 0.55).toFixed(3)}),${Math.round(tap[axis] * extent - r)},${rest})`,
        "-9999"
    );

    // Pieces at their own speed: a span marked fast is played in at most its cap.
    const pieces = [];
    let at = start;
    for (const span of spans.filter((s) => s.to > start && s.from < end).sort((a, b) => a.from - b.from)) {
        const from = Math.max(span.from, at);
        const to = Math.min(span.to, end);
        if (from > at) {
            pieces.push({ from: at, to: from, speed: 1 });
        }
        if (to > from) {
            pieces.push({ from, to, speed: Math.min(1, span.cap / (to - from)) });
            at = to;
        }
    }
    if (end > at) {
        pieces.push({ from: at, to: end, speed: 1 });
    }

    const graph = [
        `[0:v]fps=30,scale=${outWidth}:${HEIGHT}:flags=lanczos[film]`,
        `[film][1:v]overlay=x='${where("x", outWidth)}':y='${where("y", HEIGHT)}':eval=frame:shortest=1[marked]`,
        `[marked]split=${pieces.length}${pieces.map((_, i) => `[in${i}]`).join("")}`,
        ...pieces.map((p, i) => `[in${i}]trim=${p.from.toFixed(3)}:${p.to.toFixed(3)},setpts=(PTS-STARTPTS)*${p.speed.toFixed(5)}[out${i}]`),
        `${pieces.map((_, i) => `[out${i}]`).join("")}concat=n=${pieces.length}:v=1,fps=30,format=yuv420p[v]`,
    ].join(";");
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error", "-i", raw, "-loop", "1", "-i", mark,
        "-filter_complex", graph, "-map", "[v]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", out,
    ]);
}

async function take(platform, id, flow, work) {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const name = path.basename(flow).replace(/\.ya?ml$/, "");
    const raw = path.join(work, "raw.mp4");
    const debug = path.join(work, "debug");
    // Next to the flow, so the files it names by path are still found.
    const runnable = path.join(path.dirname(flow), `.${name}.recording.yaml`);
    fs.writeFileSync(runnable, translate(fs.readFileSync(flow, "utf8")));

    tidy(platform, id, true);
    let failure = null;
    let filming;
    try {
        filming = await film(platform, id, raw);
        const run = spawnSync("maestro", ["--udid", id, "test", "--debug-output", debug, "--flatten-debug-output", runnable], { env: env(), encoding: "utf8" });
        if (run.status !== 0) {
            const said = `${run.stdout}\n${run.stderr}`.split("\n").filter((line) => line.trim() && !/^WARNING:/.test(line));
            failure = new Error(said.slice(-6).join(" | ").replace(/\s+/g, " ").trim() || "Maestro failed");
        }
        await sleep(600);
    } finally {
        await filming?.stop().catch(() => {});
        tidy(platform, id, false);
        fs.rmSync(runnable, { force: true });
    }
    if (failure) {
        throw failure;
    }

    const found = timeline(debug, filming.startedAt);
    const out = path.join(path.dirname(flow), `${name} (${platform}).mp4`);
    cut(raw, found, work, out);
    return { out, taps: found.taps.length };
}

(async () => {
    const args = process.argv.slice(2);
    const option = (flag) => {
        const at = args.indexOf(flag);
        return at >= 0 ? args.splice(at, 2)[1] : null;
    };
    const named = option("--device");
    const tries = Number(option("--tries") ?? 1);
    const [platform, file] = args;
    if (!file) {
        console.log("Usage: node record.js <ios|android> <flow.yaml> [--device <id>] [--tries <n>]");
        process.exit(1);
    }
    const flow = path.resolve(file);
    const name = path.basename(flow).replace(/\.ya?ml$/, "");
    let id;
    try {
        id = device(platform, named);
    } catch (error) {
        console.log(`FAIL ${name}: ${error.message}`);
        process.exit(1);
    }
    for (let attempt = 1; attempt <= tries; attempt++) {
        const started = Date.now();
        const work = path.join(os.tmpdir(), "japper-app-demos", `${name}-${platform}`);
        try {
            const { out, taps } = await take(platform, id, flow, work);
            fs.rmSync(work, { recursive: true, force: true });
            console.log(`OK ${out} (${Math.round((Date.now() - started) / 1000)}s, ${taps} tap marks)`);
            return;
        } catch (error) {
            console.log(`FAIL ${name} ${platform} (attempt ${attempt}/${tries}): ${error.message.split("\n")[0]}`);
            console.log(`     Maestro's own output is in ${path.join(work, "debug")}`);
        }
    }
    process.exitCode = 1;
})();
