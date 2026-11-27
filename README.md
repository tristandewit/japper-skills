# Japper skills

Packages that tie an AI assistant to Japper: one that works the plan through the Japper MCP server (`https://mcp.japper.video`), and one that records demo videos of the user's own web app on their own machine.

## japper

A thin package around the MCP server.

With MCP access (bought once per account), the assistant does the thinking and the writing on the user's own subscription, and Japper composes, renders and posts. The know-how lives in the MCP server itself: its instructions, its `whats_due` tool and its prompts (`set_up_brand`, `plan_the_week`). A skill here only says when to use Japper, what to do when it is not connected or not bought, and how to run it on a schedule. So a changed rule is changed once, in `japper-api`, and not per platform.

| Platform | Package | Status |
| --- | --- | --- |
| Claude (Claude Code, claude.ai) | `claude/japper/SKILL.md` | written, not yet tried against the live server |
| Codex | | not started |
| ChatGPT | | not started |

### Claude

Claude Code: copy `claude/japper` to `~/.claude/skills/japper`, and add the server with `claude mcp add --transport http japper https://mcp.japper.video`.

claude.ai: add `https://mcp.japper.video` as a custom connector, and upload `claude/japper` as a skill.

## japper-demos

Records demo videos of a web app, one per feature the user names, in 9:16 and 16:9: a drawn cursor or tap marks, slow waits sped up, from the real app. The assistant reads the app's code to find each feature, writes a `takes.js`, records, looks at the frames, and hands the user Japper's upload link.

It runs on the user's machine, in the Google Chrome installed there, on a profile of its own (`~/.cache/japper-demos`). Nothing is sent anywhere. It needs Node 18+, ffmpeg and Google Chrome; the skill installs Playwright into its own `scripts` folder on first use.

| Platform | Package | Status |
| --- | --- | --- |
| Claude Code | `claude/japper-demos` | recorder tried on macOS against a local page; not on Windows or Linux, and not yet end to end by an assistant on an app it has not seen |
| Codex | | not started |
| iOS and Android apps | | not started |

Claude Code: copy `claude/japper-demos` to `~/.claude/skills/japper-demos`, then ask it to "record a demo of …" from the app's repository.
