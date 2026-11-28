---
name: japper
description: Plan, write and make short videos for a brand in Japper, through the Japper MCP server. Use when the user says "do my Japper", "plan my videos", "plan my week", "write this week's videos", "make a video about X", "set up my brand in Japper", "what is waiting in Japper", "doe mijn Japper", or mentions Japper at all. You do the thinking and the writing on the user's own Claude; Japper composes, renders and posts.
---

# Japper

Japper makes short videos for a brand from footage filmed once, against a posting plan. Through its MCP server **you** are the writer: the brand book, the market research, the topics and the lines of every video. Japper's own model writes nothing here. It keeps what you hand it, composes and renders the videos, and posts them on their day.

The rules for how to write and what to call live in the MCP server, not in this skill, so they are always current. This skill only tells you when to reach for it and how a run goes.

## Before anything

The Japper tools are named `whats_due`, `view_brand_book`, `view_planning`, `view_studio`, `create_posting_plan`, `create_video`, `update_brand`, `perform_action` and so on.

- **No Japper tools in this conversation:** the connector is not added. Tell the user to add a custom connector (MCP server) with the URL `https://mcp.japper.video` and sign in with their Japper account. Stop there.
- **A tool answers that MCP access has not been bought:** it is bought once per account and kept. Give the user the link from that answer, and try again once they say it is done. Do not look for another way in.

## A run

1. Call `whats_due`. It lists what is waiting, in order, and whether each item waits on you (`assistant`) or on the founder.
2. If the server offers prompts, follow `set_up_brand` for a brand without a brand book and `plan_the_week` for everything after. They carry the writing rules.
3. Do what waits on you, top to bottom. Read `view_brand_book` and `view_planning` before you write, and never repeat a topic or an opening line that was used before.
4. Stop only where something waits on the founder: footage to film (hand them the link from `request_upload_link` and say what to film), or lines to approve. Never mark a video as checked without their say-so: a checked video is posted by itself.
5. End with a short report: what you planned and wrote, and what is left for them.

## Running it without being asked

Japper cannot start you. It makes every approved video on its day and posts it by itself, but the plans, the lines and the footage are yours, so they only happen when you run. Japper mails the founder when something waits on you, with the words "Do my Japper".

So once the founder has done a run with you, and you know of no schedule set up already, offer once to run every morning on a schedule:

- **Claude Code:** a scheduled task (`/schedule`), daily in the founder's morning, with the prompt "Do my Japper: work through whats_due and report what is left for me". The run needs the Japper connector: check the task has it.
- **claude.ai or the Claude app:** a scheduled task with the same prompt, if this account offers them. If it does not, say so, and tell the founder to answer Japper's mails with "Do my Japper".

A run with nothing waiting on you ends after `whats_due`. A scheduled run never approves lines: it leaves them for the founder, who approves in chat or on the planning page of the Japper app. Set nothing up without a yes.

## What Japper does by itself

- Makes each approved video on its day, and posts it to the connected accounts.
- Mails the founder when no plan is running, when the running plan has a week left and nothing follows it, and when videos going out in the next days have no approved lines.
- The account, the onboarding, connecting social accounts and billing are done in the Japper app (`https://app.japper.video`). Send the founder there for those.

## What not to do

- Do not ask Japper to suggest, draft or research: there is no such tool any more. Write it yourself and save it.
- Do not send files: Japper takes uploads only through the link from `request_upload_link`.
- Do not invent footage. A topic that needs something the studio does not have says so in `needs`.
