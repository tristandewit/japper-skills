---
name: japper-app-demos
description: Record demo videos of the user's own iOS or Android app, one per feature or scenario they name — smooth portrait screen recordings from the iOS simulator or an Android emulator, with a mark on every tap, a clean status bar and slow waits sped up. Use when the user says "record a demo of the app", "record the iOS app", "record the Android app", "app demo clips for Japper", "screen recording of this feature in the simulator", or hands over a list of features or a scenario to show in a native app. For a web app use `japper-demos`.
---

# Demo videos of an iOS or Android app

The user names the features, or describes a scenario; each becomes one take,
named after the feature:

```
<output folder>/
  <Feature>.yaml                    the flow — kept, so any take can be re-recorded
  <Feature> (ios).mp4               the phone's own shape, 1920 high
  <Feature> (android).mp4
```

The output folder is `~/Movies/<Product> demos` unless the user names another.
Keep it out of the repository.

The recorder is the `scripts` folder next to this file; `$S` below is its path.
It films the simulator (`xcrun simctl`) or the Android device (`adb
screenrecord`) while [Maestro](https://docs.maestro.dev) runs a flow you
write, then cuts the film with ffmpeg: only the part the flow marks, waits
sped up, a mark drawn where each tap landed. Everything runs on this machine:
nothing is sent anywhere, and the videos stay on disk until the user uploads
them.

## 1. What it needs

Check, and install what is missing after telling the user what and why:

- **Node 18 or newer** and **ffmpeg** (`brew install ffmpeg`).
- **Maestro**: `maestro --version`, also at `~/.maestro/bin/maestro`. Install
  with `curl -fsSL "https://get.maestro.mobile.dev" | bash`. It needs **Java
  17 or newer** (`brew install openjdk`); the recorder finds a Java that is
  installed but not on the PATH.
- **iOS**: a Mac with Xcode and a simulator. A real iPhone is not supported.
- **Android**: the Android SDK's platform tools and an emulator, or a phone
  connected with USB debugging on.

The recorder itself has no packages to install.

## 2. The features

Take what the user gives: a list, a scenario in a sentence, a screenshot of a
list. If Japper is connected, `view_studio` and `view_planning` show which
demos its videos still need (a topic's `needs`). If they gave nothing, ask:
which features, and what each should show.

Then check every one against the code before recording anything. You are
usually in the app's repository: read its screens and its copy. A list written
for marketing promises things the app does not do. For each feature, find the
screen, the taps with their exact labels, the payoff moment on screen, the
data it needs, and its **side effects**. Report a table — exists / differs
(how) / missing — and record only what exists, showing what the app really
does. Never fake a missing feature. Keep each feature's name exactly as given,
so the clips match the list they came from.

## 3. Which app, as whom

Ask in one round, only what is not already clear:

- **Platform**: iOS, Android or both, and which device. A current phone
  without a home button reads best.
- **Build and server**: a build that talks to production with a real account
  usually has the presentable data; a debug build on a local server changes
  nothing real. The user picks.
- **Language and theme**: default English and dark, set on the device before
  recording (iOS: `xcrun simctl ui <device> appearance dark`).

Get the app onto the device the way the project does it: build for the
simulator and `xcrun simctl install`, or Gradle's install task. Boot the
device first (`xcrun simctl boot "<name>" && open -a Simulator`, or the
emulator), and have exactly one running or pass `--device`.

**Logging in is the user's to do**, on the device, before recording: ask them
and wait. Never ask for their password or type it yourself. A flow then starts
from the signed-in app, so do not clear the app's state in a flow
(`launchApp` without `clearState`).

Look around the account read-only before writing flows. A live account may
post, send mail or bill on its own: list what every take would change, and
only let a take create something after the user agreed. Never approve,
publish, send, pay, schedule or delete in a take, and never tap through a
purchase.

## 4. The flow

One Maestro flow per feature, in the output folder, named after the feature:

```yaml
# <output folder>/Make a report.yaml
appId: com.example.app
---
- launchApp                # before start: off camera
- tapOn: "Reports"
- demo: start              # the video begins here
- demo: hold 900
- tapOn: "New report"
- inputText: "Monthly revenue"
- tapOn: "Generate"
- demo: fast               # a slow wait: sped up
- extendedWaitUntil:
    visible: "Report ready"
    timeout: 180000
- demo: slow 3             # … to at most 3 seconds
- demo: hold 1800
```

Everything Maestro offers works: `tapOn` by text or `id:`, `inputText`,
`scroll`, `scrollUntilVisible`, `swipe`, `back`, `hideKeyboard`,
`extendedWaitUntil`, `runFlow`. The recorder adds four lines of its own, which
only it understands, so run a flow through the recorder, not `maestro test`:

| Line | Does |
|---|---|
| `- demo: start` | The video begins here. Without it, it begins when `launchApp` is done. |
| `- demo: hold <ms>` | Holds the shot; the app keeps running. |
| `- demo: fast` … `- demo: slow <seconds>` | Plays everything between them back in at most that many seconds: AI calls, renders, uploads. |

Writing them:

- One feature per flow, the moment the product does what it promises. No
  intros. Hold 1–2 s on each payoff so it reads.
- Find what is on a screen first, with the app open on it:
  `node "$S/look.js" <ios|android> out.png` saves a screenshot and prints
  every text, label and id Maestro can see, with where it sits. Tap by those
  exact words. A control with no text or label is tapped by `id:` or, last,
  by `point: "50%,80%"`.
- The video ends a second after the flow's last line.
- An Android take is three minutes of film at most. Split a longer feature,
  or speed its wait up from a second take that starts where the first ended.
- Only taps get a mark; a swipe or scroll is seen by what moves.
- The two platforms rarely share a flow: labels, navigation and system
  dialogs differ. Write one per platform when recording both, named
  `<Feature>.yaml` in a folder each, or record one platform.
- A system dialog (notifications, tracking, photos) in the middle of a take
  spoils it: get past it by hand before recording.

## 5. Record

```bash
node "$S/record.js" <ios|android> "<output folder>/<Feature>.yaml" [--device <id>] [--tries <n>]
```

Run it in the background. It prints `OK <file> (… tap marks)` or
`FAIL <take> <platform> (attempt n/n): <reason>` with the folder of Maestro's
own output, where its log and a screenshot of the failure are. A flow runs
once unless `--tries` says more: give more tries only to a take that creates
nothing. The simulator's window can sit anywhere; the film is of the device's
screen, not the window. The status bar is set to 9:41 and a full battery while
it films, and put back after.

Try one harmless take first and look at it, then record the rest.

## 6. Review

Look at every video before reporting it, as frames rather than by playing it:

```bash
node "$S/sheet.js" "<video>.mp4" sheet.png    # a frame every 2.5 s; then read the png
```

Check: the right account, language and theme, no spinners or error messages
held on screen, every payoff on screen and held, tap marks where the taps
were, nothing private in view (other people's names, email addresses, keys).
`0 tap marks` on a take with taps means the marks could not be read from
Maestro's log: say so rather than passing it on unmarked without a word. Fix
the flow and record again rather than passing on a clip that is nearly right.

## 7. Report, and hand over to Japper

A table of the files (platform, length, what each shows), what the takes
created in the account, which features were skipped or shown differently and
why, and the folder.

Uploading is the user's call. If they want the clips in Japper and it is
connected, call `request_upload_link` with `kind: "demo"` and give them the
link with the folder to pick from: files cannot be sent over the connection,
so the upload is theirs to do in the browser. Read `view_studio` afterwards to
see that they arrived.
