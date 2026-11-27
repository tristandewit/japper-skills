// node shot.js <takes.js> <portrait|landscape> <path> <out.png> [js]
// One screenshot on the recorder profile, for finding your way around a
// screen before writing its take. The optional js runs with `page` in scope
// before the shot; whatever it logs is printed.
const { chromium } = require("playwright");
const path = require("path");
const { profileDir, FORMATS } = require("./recorder");

(async () => {
    const [file, formatKey, url, out, steps] = process.argv.slice(2);
    const config = require(path.resolve(file));
    const context = await chromium.launchPersistentContext(profileDir(config.profile), {
        channel: "chrome",
        headless: true,
        viewport: FORMATS[formatKey].viewport,
        colorScheme: config.colorScheme ?? "dark",
        locale: config.locale ?? "en-US",
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(new URL(url, config.app).href, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    if (steps) {
        await new Function("page", `return (async () => { ${steps} })()`)(page);
    }
    await page.screenshot({ path: out });
    console.log(page.url());
    await context.close();
})();
