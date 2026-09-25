# Experimental rehearsal: auditing a field-experiment proposal

Eric Gladstone · research walkthrough · independent work · September 2026

A real Claude Code session, presented as it was worked through. The Claude Code console is on the left and my commentary is on the right. The session reviews a proposed field experiment in 23 steps. It starts by reconstructing what the proposal commits to. It then audits assignment, measurement, timing, precision and cost. Next it rehearses possible results before any data exist, simulates worlds the design cannot tell apart, repairs the design, and retests the repair. It ends with a funding decision under stated conditions.

- **Live:** https://experimentalrehearsal.eric-c-gladstone.workers.dev
- **Also at:** https://graystoneindustries.co/talks/ (embedded)

## What is verbatim and what is editorial

The questions are mine. Claude's replies and tool output are verbatim, from one continuous session (Claude Code 2.1.282, Opus 5.5), recorded 24–25 September 2026. Timing, grouping into parts, focus, and the commentary on the right are editorial.

The organization, its proposal and its background materials are fictional, written for this demonstration. The session ran in an isolated directory, and local paths and account names are removed from the published data.

## Use

Open it and step with ← →. Use shift+← → to move between sections and space to play. A− / A+ (or the - and = keys) change the terminal text size. URL options: `?s=<screen>&b=<part>` opens at a given point, `?play=1` autoplays, `?t=<px>` sets the terminal size, and `?embed=1` fills its frame for embedding.

Run locally with any static server, for example `python3 -m http.server 4690 --directory public`.

## Files

`public/` is the whole site: `index.html`, `app.js`, `style.css`, `data/session.js` (the session, as the page plays it), `data/walkthrough.js` (the commentary), self-hosted Geist fonts, and `vendor/marked.umd.js` (MIT) for rendering Markdown. It makes no third-party requests.
