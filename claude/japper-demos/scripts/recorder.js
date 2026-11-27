// Records one demo take: drives a real Chrome on the app's own recorder
// profile, grabs frames straight from the renderer over CDP and stitches them
// into an MP4 at a constant 30 fps. Waits marked with fast()/slow() are sped
// up in the output, so an AI call or a render does not stall the video.
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// Headless Chrome sends screencast frames at CSS size whatever the scale
// factor, so the window is headed (parked off-screen) and renders at the
// retina screen's 2×.
const FORMATS = {
    // 405×720 at 2× → 810×1440, scaled up to 1080×1920
    portrait: { viewport: { width: 405, height: 720 }, touch: true, size: "1080:1920", tag: "9x16" },
    // 1280×720 at 2× → 2560×1440, scaled down to 1920×1080
    landscape: { viewport: { width: 1280, height: 720 }, touch: false, size: "1920:1080", tag: "16x9" },
};

function profileDir(profile) {
    return path.join(os.homedir(), ".cache", "japper-demos", profile);
}

// The cursor (an arrow on desktop, a tap mark on a phone) and the click
// ripple are drawn into the page, since a screencast has no pointer.
const OVERLAY = (touch, hide) => `
(() => {
    const touch = ${touch};
    const install = () => {
        if (document.getElementById("__demo_cursor")) return;
        const style = document.createElement("style");
        style.textContent = \`
            ${hide.map((selector) => `${selector} { display: none !important; }`).join("\n")}
            #__demo_cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
                transition: opacity .25s; will-change: transform; }
            #__demo_cursor.touch { width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
                background: rgba(255,255,255,.35); border: 2px solid rgba(255,255,255,.85);
                box-shadow: 0 2px 10px rgba(0,0,0,.35); opacity: 0; }
            #__demo_cursor.touch.on { opacity: 1; }
            .__demo_ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 16px; height: 16px;
                margin: -8px 0 0 -8px; border-radius: 50%; background: rgba(255,255,255,.45);
                animation: __demo_ripple .5s ease-out forwards; }
            @keyframes __demo_ripple { to { transform: scale(4); opacity: 0; } }
            ::-webkit-scrollbar { display: none; }
        \`;
        document.documentElement.appendChild(style);
        const cursor = document.createElement("div");
        cursor.id = "__demo_cursor";
        if (touch) {
            cursor.className = "touch";
        } else {
            cursor.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M1.5 1.5v22.5l5.6-5.3 3.6 8.6 3.9-1.6-3.6-8.5h7.8z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        }
        document.documentElement.appendChild(cursor);
        const at = window.__demoAt || { x: -40, y: -40 };
        cursor.style.transform = \`translate(\${at.x}px, \${at.y}px)\`;
        addEventListener("mousemove", (e) => {
            window.__demoAt = { x: e.clientX, y: e.clientY };
            cursor.style.transform = \`translate(\${e.clientX}px, \${e.clientY}px)\`;
        }, true);
        addEventListener("mousedown", (e) => {
            const ripple = document.createElement("div");
            ripple.className = "__demo_ripple";
            ripple.style.left = e.clientX + "px";
            ripple.style.top = e.clientY + "px";
            document.documentElement.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }, true);
        window.__demoTouch = (on) => cursor.classList.toggle("on", on);
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install);
    } else {
        install();
    }
})();
`;

async function record(config, name, formatKey, body, { work, outDir }) {
    const format = FORMATS[formatKey];
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });

    const context = await chromium.launchPersistentContext(profileDir(config.profile), {
        channel: "chrome",
        headless: false,
        viewport: format.viewport,
        deviceScaleFactor: 2,
        colorScheme: config.colorScheme ?? "dark",
        locale: config.locale ?? "en-US",
        // On screen when a take needs the user's hands, such as a third-party
        // login typed in the middle of it; parked off-screen otherwise.
        args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", config.onScreen ? "--window-position=80,80" : "--window-position=4000,4000"],
    });
    await context.addInitScript(OVERLAY(format.touch, config.hide ?? []));
    let page = context.pages()[0] ?? (await context.newPage());

    const frames = [];
    const fastSpans = [];
    let recording = false;
    let fastFrom = null;
    const SCREENCAST = { format: "jpeg", quality: 92, everyNthFrame: 1 };

    // Frames come from the page in front only: a popup while it is open.
    async function capture(source) {
        const session = await context.newCDPSession(source);
        session.on("Page.screencastFrame", async (frame) => {
            session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
            if (!recording || source !== page) {
                return;
            }
            const file = path.join(work, `${String(frames.length).padStart(6, "0")}.jpg`);
            fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
            frames.push({ file, t: frame.metadata.timestamp });
        });
        return session;
    }
    let cdp = await capture(page);

    // A popup opened while recording, such as a third-party login, is filmed
    // and the take goes on in it (demo.page); once it closes, the page that
    // opened it is filmed again if it is still open. A login that closes its
    // opener instead and ends up back in the app leaves the take in the popup.
    // Every window and where it goes is logged (without query strings, which
    // carry login codes), so a take that waits on the user can be followed.
    const where = (url) => url.split(/[?#]/)[0];
    const watch = (p, label) => {
        p.on("framenavigated", (frame) => frame === p.mainFrame() && console.log(`WINDOW ${label} ${where(frame.url())}`));
        p.on("close", () => console.log(`WINDOW ${label} closed`));
    };
    watch(page, "main");
    let popups = 0;
    context.on("page", async (popup) => {
        const label = `popup${++popups}`;
        watch(popup, label);
        console.log(`WINDOW ${label} opened`);
        if (!recording) {
            return;
        }
        // A popup gone before it could be filmed is left alone: an error here
        // would end the process and close every window the user is in.
        try {
            const opener = { page, cdp };
            const session = await capture(popup);
            page = popup;
            cdp = session;
            await session.send("Page.startScreencast", SCREENCAST);
            popup.on("close", () => {
                if (page === popup && !opener.page.isClosed()) {
                    page = opener.page;
                    cdp = opener.cdp;
                }
            });
        } catch (error) {
            console.log(`WINDOW ${label} not filmed: ${error.message.split("\n")[0]}`);
        }
    });

    const now = () => Date.now() / 1000;
    let mouse = { x: format.viewport.width / 2, y: format.viewport.height * 0.6 };

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    async function moveTo(x, y, ms = 650) {
        const steps = Math.max(8, Math.round(ms / 16));
        const from = { ...mouse };
        for (let i = 1; i <= steps; i++) {
            const k = ease(i / steps);
            await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
            await page.waitForTimeout(ms / steps);
        }
        mouse = { x, y };
    }

    // Glides the element's scroll container until the element sits in view,
    // instead of the jump scrollIntoView makes.
    async function reveal(handle) {
        await handle.evaluate(
            (el) =>
                new Promise((resolve) => {
                    const rect = el.getBoundingClientRect();
                    const margin = innerHeight * 0.18;
                    if (rect.top >= margin && rect.bottom <= innerHeight - margin) {
                        return resolve();
                    }
                    let box = el.parentElement;
                    while (box && !(box.scrollHeight > box.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) {
                        box = box.parentElement;
                    }
                    box = box || document.scrollingElement;
                    const from = box.scrollTop;
                    const dy = rect.top + rect.height / 2 - innerHeight * 0.55;
                    const ms = Math.min(1100, 450 + Math.abs(dy) * 0.6);
                    const t0 = performance.now();
                    const step = (t) => {
                        const k = Math.min(1, (t - t0) / ms);
                        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                        box.scrollTop = from + dy * e;
                        k < 1 ? requestAnimationFrame(step) : setTimeout(resolve, 120);
                    };
                    requestAnimationFrame(step);
                })
        );
    }

    // Pages render a hidden copy of some elements (a calendar next to a
    // list), so only a visible match is a target.
    async function target(locator) {
        const handle = locator.filter({ visible: true }).first();
        await handle.waitFor({ state: "visible", timeout: 60000 });
        await reveal(handle);
        const box = await handle.boundingBox();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }

    const demo = {
        get page() {
            return page;
        },
        portrait: formatKey === "portrait",
        async go(url) {
            await page.goto(new URL(url, config.app).href, { waitUntil: "networkidle" }).catch(() => {});
            await page.waitForTimeout(400);
        },
        async start() {
            await cdp.send("Page.startScreencast", SCREENCAST);
            recording = true;
            await page.mouse.move(mouse.x, mouse.y);
        },
        async click(locator, { pause = 350 } = {}) {
            const p = await target(locator);
            if (format.touch) {
                await page.evaluate(() => window.__demoTouch && window.__demoTouch(true));
            }
            await moveTo(p.x, p.y);
            await page.waitForTimeout(pause);
            await page.mouse.down();
            await page.waitForTimeout(90);
            await page.mouse.up();
            if (format.touch) {
                await page.waitForTimeout(250);
                await page.evaluate(() => window.__demoTouch && window.__demoTouch(false));
            }
        },
        async hover(locator) {
            const p = await target(locator);
            await moveTo(p.x, p.y);
        },
        async reveal(locator) {
            const handle = locator.filter({ visible: true }).first();
            await handle.waitFor({ state: "visible", timeout: 60000 });
            await reveal(handle);
        },
        async type(locator, text, delay = 45) {
            await demo.click(locator);
            await locator.filter({ visible: true }).first().pressSequentially(text, { delay });
        },
        // Smoothly scrolls the page's main scroll container by dy pixels.
        async scroll(dy, ms = 900) {
            await page.evaluate(
                ([dy, ms]) =>
                    new Promise((resolve) => {
                        const el = [...document.querySelectorAll("*")]
                            .filter((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.clientHeight > innerHeight * 0.5 && !e.closest("[role=dialog]"))
                            .sort((a, b) => b.clientWidth - a.clientWidth)[0]
                            || document.scrollingElement;
                        const from = el.scrollTop;
                        const t0 = performance.now();
                        const step = (t) => {
                            const k = Math.min(1, (t - t0) / ms);
                            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                            el.scrollTop = from + dy * e;
                            k < 1 ? requestAnimationFrame(step) : resolve();
                        };
                        requestAnimationFrame(step);
                    }),
                [dy, ms]
            );
        },
        wait: (ms) => page.waitForTimeout(ms),
        // Everything from fast() until slow() plays back at most `cap` seconds.
        fast() {
            fastFrom = now();
        },
        slow(cap = 1.2) {
            fastSpans.push({ from: fastFrom, to: now(), cap });
            fastFrom = null;
        },
    };

    try {
        await body(demo);
        await page.waitForTimeout(800);
    } finally {
        recording = false;
        await cdp.send("Page.stopScreencast").catch(() => {});
        await context.close();
    }

    const out = path.join(outDir, `${name} (${format.tag}).mp4`);
    stitch(frames, now(), fastSpans, work, out, format.size);
    return out;
}

function stitch(frames, end, fastSpans, work, out, size) {
    if (frames.length === 0) {
        throw new Error("No frames captured");
    }
    // Each frame shows until the next one; durations inside a fast span are
    // scaled so the whole span lasts at most its cap.
    const durations = frames.map((f, i) => (i + 1 < frames.length ? frames[i + 1].t : end) - f.t);
    for (const span of fastSpans) {
        const length = span.to - span.from;
        if (length <= span.cap) {
            continue;
        }
        const factor = span.cap / length;
        frames.forEach((f, i) => {
            const a = Math.max(f.t, span.from);
            const b = Math.min(f.t + durations[i], span.to);
            if (b > a) {
                durations[i] -= (b - a) * (1 - factor);
            }
        });
    }
    const list = frames
        .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, durations[i]).toFixed(4)}`)
        .join("\n") + `\nfile '${frames[frames.length - 1].file}'\n`;
    const listFile = path.join(work, "frames.txt");
    fs.writeFileSync(listFile, list);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listFile,
        // A popup filmed mid-take has its own size: fitted, never stretched.
        "-vf", `fps=30,scale=${size}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${size}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "16",
        "-movflags", "+faststart",
        out,
    ]);
}

module.exports = { record, profileDir, FORMATS };
