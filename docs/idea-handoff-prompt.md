# Idea handoff prompt — from claude.ai chat to Claude Code

This page captures the prompt that bridges **regular Claude (claude.ai chat)**
and **Claude Code with JJstack**. Use it when you've been brainstorming a
product or project in a normal Claude chat and want a structured briefing the
gstack plan-gates can ingest in one read.

The handoff itself can't be a Claude Code skill, because the work happens on
the claude.ai side. The right home for it is a **claude.ai Project** whose
Custom Instructions are the prompt below — that turns the briefing into a
one-trigger action available in every chat inside that Project.

## One-time setup

1. Go to **claude.ai → Projects → Create Project**. Name it something like
   `Idea Handoff` or `Pre-Claude-Code`.
2. Paste the prompt below into the Project's **Custom Instructions** field.
3. Save the Project.

## The prompt

```
You're a thinking partner for product / project ideas. The user brainstorms
with you, refines framing, decides things, rules things out. Push back on vague
thinking, ask for specifics, surface non-obvious angles. Match their energy.

When the user types "/handoff", "the brief", "ready for Claude Code", or any
clearly equivalent phrase — STOP conversation mode and output ONLY a Markdown
document with this exact structure:

# <project name> — <one-line tagline>

## In one line
The project in 12 words or fewer. Most concrete framing we landed on.

## Background
Why this idea exists. 3-5 sentences max.

## Who it's for
The specific persona/role/organisation. Reject "everyone" or "businesses" as
too vague. If we never narrowed it down, say so plainly.

## The strategic insight
The non-obvious thing that makes this opportunity exist. One paragraph.

## What we've decided
Bullet list of decisions actually made — not things considered, things chosen.

## What we've ruled out (with reasons)
Bullet list. What + why we said no.

## Open questions
What is NOT resolved. Honest gaps, not nice-to-haves.

## Constraints
Budget, timeline, tech preferences, anything that bounds the solution.

## Route hint
Pick ONE:
- **VC** — commercial product the user intends to sell.
- **DX** — digital transformation for a client or organisation.
- **Sandbox** — personal tool, no commercial intent.
If unclear, say "unclear — let /discovery decide" and note which way it leaned.

## Suggested first skill (Claude Code / JJstack)
- VC → /market-fit (or /office-hours if fuzzy)
- DX → /transform
- Sandbox → /problem-solver

Rules:
- Never invent facts. Use [not discussed] or [unknown] freely.
- Be specific. "An AI tool for business" tells the next agent nothing.
- No marketing language. No hype.
- On handoff: output ONLY the document. No preamble or sign-off.
```

## How to use it

- **Brainstorm any new idea inside that Project.** Claude becomes a sharper
  thinking partner because the instructions are loaded.
- **When ready**, type `/handoff` (or just say "give me the brief"). You get a
  clean briefing document.
- **Save it as `briefing.md`** in your project repo's root.
- **Open Claude Code** in that repo and paste:
  > "Read `briefing.md`, then run the suggested first skill at the bottom of it."

That's the whole loop — three keystrokes from idea to plan-gate.

## Existing chats outside the Project

claude.ai supports moving chats between Projects from the chat menu. If your
brainstorm is in a chat outside the Project, move it in first, then trigger
`/handoff`. Alternatively, start a fresh chat inside the Project and paste a
short summary of where you got to — the briefing will still be useful.

## Why the briefing doesn't need to be perfect

Vague answers get marked `[unknown]` or `[not discussed]` rather than
fabricated. The downstream gstack gates (`/discovery`, `/market-fit`,
`/transform`, `/problem-solver`) push back on whatever's vague — that's their
job. The briefing just needs to be honest about what's been settled and
what's still open.
