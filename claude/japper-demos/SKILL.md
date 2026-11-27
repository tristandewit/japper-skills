---
name: japper-demos
description: Record demo videos of the user's own web app, one per feature or scenario they name, each in 9:16 (1080×1920) and 16:9 (1920×1080) — smooth screen recordings with a drawn cursor or tap marks, slow waits sped up, from the real app in a real Chrome on this machine. Use when the user says "record a demo", "record demo videos", "demo clips for Japper", "screen recording of this feature", "film my app", "record the demos Japper asks for", or hands over a list of features or a scenario to show on screen. Web apps only: not for native iOS or Android apps.
---

# Demo videos of a web app

The user names the features, or describes a scenario; each becomes one take,
recorded in both formats and named after the feature:

```
<output folder>/
  takes.js                          what each take does — kept, so any take can be re-recorded
  <Feature> (9x16).mp4              1080×1920
  <Feature> (16x9).mp4              1920×1080
```

The output folder is `~/Movies/<Product> demos` (`~/Videos/…` where there is no
`~/Movies`) unless the user names another. Keep it out of the repository.

The recorder is the `scripts` folder next to this file; `$S` below is its path.
It drives the Google Chrome installed on this machine through Playwright, with
a profile of its own per app (`~/.cache/japper-demos/<profile>`, so the login
never lands in a repository and the user's own Chrome is not touched), grabs
frames from the renderer and stitches them with ffmpeg. Everything runs here:
nothing is sent anywhere, and the videos stay on disk until the user uploads
them.

## 1. What it needs

Check, and install what is missing after telling the user what and why:

- **Node 18 or newer** and **ffmpeg** (`ffmpeg -version`; `brew install ffmpeg`,
  `winget install ffmpeg`, or the system's package manager).
- **Google Chrome**, the real one. Playwright's bundled Chromium plays no
  H.264, so an app's videos would stay black.
- The recorder's own packages, once:

```bash
[ -d "$S/node_modules/playwright" ] || PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$S"
```

## 2. The features

Take what the user gives: a list, a scenario in a sentence, a screenshot of a
list. If Japper is connected, `view_studio` and `view_planning` show which
demos its videos still need (a topic's `needs`). If they gave nothing, ask:
which features, and what each should show.

Then check every one against the code before recording anything. You are
usually in the app's repository: read its routes or pages and its copy. A list
written for marketing promises things the app does not do. For each feature,
find the route, the clicks with their exact button labels, the payoff moment
on screen, the data it needs, and its **side effects**. Report a table —
exists / differs (how) / missing — and record only what exists, showing what
the app really does. Never fake a missing feature. Keep each feature's name
exactly as given, so the clips match the list they came from.

## 3. Where, as whom, how

Ask in one round, only what is not already clear:

- **Environment and account**: production with a real account usually has the
  presentable data; a local server with seeds rarely does, but changes nothing
  real. The user picks.
- **Formats**: default both. **Theme**: default dark (`colorScheme` in the
  takes file). **Language**: default English (`locale`).

Then look around the account read-only before writing takes. A live account
may post, send mail or bill on its own: list what every take would change, and
only let a take create something after the user agreed. Never approve,
publish, send, pay, schedule or delete in a take.

## 4. Log in

Write `takes.js` (step 5) with at least `app` and `profile`, then open the
login window in the background:

```bash
node "$S/login.js" "<output folder>/takes.js"
```

Tell the user to log in in that window and pick the account or workspace.
Never ask for their password or type it yourself. It prints `LOGGED_IN` and
closes once a page of the app that is not a login page loads, or `TIMEOUT`
after an hour — then do not reopen it unasked; wait for the user. An existing
session closes it straight away.

It opens `loginPath` (default `/login`). Point that at a page only a signed-in
user reaches, such as `/dashboard`, when the app's login page does not send a
signed-in user on. Pages it should not count as signed in go in `guest`, a
regular expression on the path, when the app names them unusually.

## 5. The takes file

```js
// <output folder>/takes.js
module.exports = {
    app: "https://app.example.com",     // or http://localhost:3000
    profile: "example",                 // recorder profile, one per app and account
    colorScheme: "dark",
    locale: "en-US",
    loginPath: "/login",
    hide: ['a[href^="/admin"]'],        // selectors kept out of the shots
    once: ["Make a report"],            // takes that create something: never retried
    takes: {
        "Make a report": async (demo) => {
            const { page } = demo;
            await demo.go("/reports/new");           // before start(): loads off camera
            await demo.start();
            await demo.wait(900);
            await demo.type(page.getByLabel("Title"), "Monthly revenue");
            await demo.click(page.getByRole("button", { name: "Generate" }));
            demo.fast();                             // a slow wait: sped up
            await page.getByText("Report ready").waitFor({ timeout: 180000 });
            demo.slow(3);                            // … to at most 3 s
            await demo.wait(1800);
        },
    },
};
```

What `demo` offers:

| Call | Does |
|---|---|
| `go(path)` | Navigates and waits for the network to settle. Call before `start()` so the take opens on a loaded page. |
| `start()` | Starts capturing. Nothing before it is in the video. |
| `click(locator)` / `hover(locator)` | Glides the cursor (a tap mark on 9:16) to the first **visible** match, scrolling it into view smoothly first, and clicks with a ripple. |
| `type(locator, text)` | Clicks, then types key by key. |
| `reveal(locator)` | Smoothly scrolls a match into view. |
| `scroll(dy, ms)` | Smoothly scrolls the main scroll container. |
| `wait(ms)` | Holds the shot. |
| `fast()` … `slow(cap)` | Plays everything between them back in at most `cap` seconds: AI calls, renders, uploads. |
| `portrait` / `page` | Which format this run is; the Playwright page. A popup opened while recording (a third-party login) is filmed and becomes `demo.page` until it closes, so read `demo.page` again after one. |

Writing them:

- One feature per take, the moment the product does what it promises. No
  intros. Hold 1–2 s on each payoff so it reads.
- Find selectors first with
  `node "$S/shot.js" <takes.js> <portrait|landscape> <path> out.png '<js using page>'`:
  dump `innerText`, a dialog's markup, button names. Use roles and visible
  labels; a label with a suffix like "(optional)" needs a regex.
- 9:16 is recorded as a phone (405×720, touch). The layout differs there:
  navigation behind a menu button, sections below the fold, a list where the
  desktop has a table. Write the take for both or branch on `demo.portrait`.
  An app with no phone layout is recorded in landscape only: say so.
- Have a take throw as soon as an error shows on screen, not after a timeout,
  so it gets retried (3 tries unless in `once`).
- A take that waits on the user's hands (a third-party login typed in the
  window) sets `onScreen: true` in the file, goes in `once`, and polls
  `demo.page.url()` rather than `page.waitForURL`.
- A video that should play on camera: `video.muted = true; video.play()`.

## 6. Record

```bash
node "$S/record.js" "<output folder>/takes.js" [take|all] [portrait|landscape|both]
```

Run it in the background. It prints `OK <file>` or
`FAIL <take> <format> (attempt n/3): <reason>` per take. Try one harmless take
in one format first, look at it, then run the rest. The window is parked
off-screen; it does not get in the user's way.

## 7. Review

Look at every video before reporting it, as frames rather than by playing it:

```bash
node "$S/sheet.js" "<video>.mp4" sheet.png    # a frame every 2.5 s; then read the png
```

Check: the right account and theme, no loading skeletons or error messages,
every payoff on screen and held, nothing private in view (other people's
names, email addresses, keys, admin screens). Fix the take and record it again
rather than passing on a clip that is nearly right.

## 8. Report, and hand over to Japper

A table of the files (format, length, what each shows), what the takes created
in the account, which features were skipped or shown differently and why, and
the folder.

Uploading is the user's call. If they want the clips in Japper and it is
connected, call `request_upload_link` with `kind: "demo"` and give them the
link with the folder to pick from: files cannot be sent over the connection,
so the upload is theirs to do in the browser. Read `view_studio` afterwards to
see that they arrived.
