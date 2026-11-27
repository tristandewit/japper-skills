# Japper skills

Thin packages that tie an AI assistant to the Japper MCP server (`https://mcp.japper.video`).

With MCP access (bought once per account), the assistant does the thinking and the writing on the user's own subscription, and Japper composes, renders and posts. The know-how lives in the MCP server itself: its instructions, its `whats_due` tool and its prompts (`set_up_brand`, `plan_the_week`). A skill here only says when to use Japper, what to do when it is not connected or not bought, and how to run it on a schedule. So a changed rule is changed once, in `japper-api`, and not per platform.

| Platform | Package | Status |
| --- | --- | --- |
| Claude (Claude Code, claude.ai) | `claude/japper/SKILL.md` | written, not yet tried against the live server |
| Codex | | not started |
| ChatGPT | | not started |

## Claude

Claude Code: copy `claude/japper` to `~/.claude/skills/japper`, and add the server with `claude mcp add --transport http japper https://mcp.japper.video`.

claude.ai: add `https://mcp.japper.video` as a custom connector, and upload `claude/japper` as a skill.
