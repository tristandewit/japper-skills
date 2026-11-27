// node login.js <takes.js>
// Opens a visible Chrome on the app's recorder profile at its login page, so
// the user logs in (and picks the account or workspace) once. Closes itself, printing
// LOGGED_IN, as soon as a page past the guest pages has loaded; TIMEOUT after
// an hour. With a session already there it closes straight away.
const { chromium } = require("playwright");
const path = require("path");
const { profileDir } = require("./recorder");

// Pages a visitor who is not signed in sits on. A takes file whose app names
// them otherwise sets its own `guest` pattern.
const GUEST = /^\/(log-?in|sign-?in|sign-?up|register|auth|sso|oauth|callback|two-factor|2fa|mfa|verify|confirm|forgot|reset|password|magic|invite)/i;

(async () => {
    const config = require(path.resolve(process.argv[2]));
    const context = await chromium.launchPersistentContext(profileDir(config.profile), {
        channel: "chrome",
        headless: false,
        viewport: null,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(new URL(config.loginPath ?? "/login", config.app).href);

    const app = new URL(config.app).hostname;
    const deadline = Date.now() + 60 * 60 * 1000;
    while (Date.now() < deadline) {
        for (const p of context.pages()) {
            const url = new URL(p.url());
            if (url.hostname === app && !(config.guest ?? GUEST).test(url.pathname)) {
                await p.waitForTimeout(3000);
                console.log(`LOGGED_IN ${p.url()}`);
                await context.close();
                return;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("TIMEOUT");
    await context.close();
})();
