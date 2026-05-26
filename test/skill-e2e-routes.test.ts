/**
 * E2E guardrail tests for the three-route stack and the cross-route skills
 * (/discovery, /market-fit, /transform, /problem-solver, /harvest, /content-transfer).
 *
 * These exercise the behaviors that static validation cannot catch — the
 * route gates' refusal logic, the router's routing decision, and the
 * cross-route skills' hard-gate guardrails:
 *   - /discovery routes a client-transformation brief to /transform (DX).
 *   - /market-fit will not return GREEN when the user refuses validation.
 *   - /transform will not return GREEN without a measurement plan.
 *   - /problem-solver refuses platform/scale scope in Sandbox mode.
 *   - /harvest refuses to brief when there is no code to harvest.
 *   - /content-transfer refuses to skip the mapping document sign-off.
 *
 * Assertions are deterministic token checks on a file the agent writes, so no
 * LLM judge is needed. Generator: Sonnet. Periodic tier (non-deterministic LLM
 * behavior on new skills; promote to gate once stable).
 *
 * Skipped unless EVALS=1 (paid). Run with: bun run test:e2e (diff-based) or
 * EVALS=1 EVALS_ALL=1 bun test test/skill-e2e-routes.test.ts
 */

import { expect, beforeAll, afterAll } from 'bun:test';
import { runSkillTest } from './helpers/session-runner';
import {
  ROOT, runId, evalsEnabled,
  describeIfSelected, testConcurrentIfSelected,
  logCost, recordE2E,
  createEvalCollector, finalizeEvalCollector,
} from './helpers/e2e-helpers';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const evalCollector = createEvalCollector('e2e-routes');

const TEST_IDS = [
  'discovery-dx-routing',
  'market-fit-no-experiment-not-green',
  'transform-no-measurement-not-green',
  'problem-solver-anti-scope',
  'harvest-no-code-refusal',
  'content-transfer-no-mapping-refusal',
];

/**
 * Extract just the skill body (from its H1 onward) into the workdir, skipping
 * the ~800-line generated preamble. Keeps the agent's read small and fast —
 * the guardrail logic lives in the body prose, not the preamble.
 */
function extractSkillBody(workDir: string, skillDir: string, h1Marker: string) {
  const full = fs.readFileSync(path.join(ROOT, skillDir, 'SKILL.md'), 'utf-8');
  const start = full.indexOf(h1Marker);
  const body = start >= 0 ? full.slice(start) : full;
  fs.mkdirSync(path.join(workDir, skillDir), { recursive: true });
  fs.writeFileSync(path.join(workDir, skillDir, 'SKILL.md'), body);
}

describeIfSelected('Three-route guardrails E2E', TEST_IDS, () => {
  let workDir: string;

  beforeAll(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-e2e-routes-'));
    const run = (cmd: string, args: string[]) =>
      spawnSync(cmd, args, { cwd: workDir, stdio: 'pipe', timeout: 5000 });
    run('git', ['init', '-b', 'main']);
    run('git', ['config', 'user.email', 'test@test.com']);
    run('git', ['config', 'user.name', 'Test']);

    extractSkillBody(workDir, 'discovery', '# /discovery');
    extractSkillBody(workDir, 'market-fit', '# /market-fit');
    extractSkillBody(workDir, 'transform', '# /transform');
    extractSkillBody(workDir, 'problem-solver', '# /problem-solver');
    extractSkillBody(workDir, 'harvest', '# /harvest');
    extractSkillBody(workDir, 'content-transfer', '# /content-transfer');

    // Fixtures for cross-route skill guardrail tests
    fs.mkdirSync(path.join(workDir, 'prototype-empty'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'wp-export.xml'), '<wordpress></wordpress>\n');
  });

  afterAll(() => {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  });

  // --- /discovery routes a client transformation to the DX gate ---
  testConcurrentIfSelected('discovery-dx-routing', async () => {
    const result = await runSkillTest({
      prompt: `Read discovery/SKILL.md for the routing logic.

Scenario: a new project. The user says: "We've been hired by a logistics company
to cut the time their operations team spends manually reconciling delivery
spreadsheets every week. There's no product to sell — it's an internal
improvement for the client, and they want to see measurable time savings."

Non-interactive: do NOT ask questions and do NOT run any setup or persistence
bash. Using the routing table, decide which route this is and which single
plan-gate command you would start.

Write ONLY that command — exactly one of /market-fit, /transform, or
/problem-solver — to ${workDir}/gate.txt. Nothing else.`,
      workingDirectory: workDir,
      allowedTools: ['Read', 'Write'],
      maxTurns: 6,
      timeout: 240_000,
      testName: 'discovery-dx-routing',
      runId,
      model: 'claude-sonnet-4-6',
    });

    logCost('/discovery (DX routing)', result);
    const gatePath = path.join(workDir, 'gate.txt');
    const gate = fs.existsSync(gatePath) ? fs.readFileSync(gatePath, 'utf-8') : '';
    recordE2E(evalCollector, '/discovery-dx-routing', 'Three-route guardrails E2E', result, {
      passed: gate.includes('/transform'),
    });
    expect(['success', 'error_max_turns']).toContain(result.exitReason);
    if (!fs.existsSync(gatePath)) throw new Error('Agent did not emit gate.txt');
    expect(gate).toContain('/transform');
    expect(gate).not.toContain('/market-fit');
    expect(gate).not.toContain('/problem-solver');
  }, 300_000);

  // --- /market-fit cannot be GREEN when the user refuses validation ---
  testConcurrentIfSelected('market-fit-no-experiment-not-green', async () => {
    const result = await runSkillTest({
      prompt: `Read market-fit/SKILL.md for the workflow.

Run the gate non-interactively on this VC-route scenario. The founder already has:
- Persona: heads of RevOps at 50-200 person SaaS companies.
- Problem cost: ~£8,000/month of analyst time.
- Pricing idea: £800/month subscription.
- Distribution: a warm LinkedIn network of ~60 such leaders.

BUT they flatly refuse to run any validation experiment: "I don't want to test
anything, I just want to build it — I'm sure people will pay."

Do NOT ask questions and do NOT run setup bash. Apply the skill's Step 5
(validation experiment) and Step 6 (Go/No-Go) logic.

Write ONLY the final verdict token on the first line of ${workDir}/verdict.txt —
exactly one of GREEN, YELLOW, or RED — then one sentence of justification on the
next line.`,
      workingDirectory: workDir,
      allowedTools: ['Read', 'Write'],
      maxTurns: 8,
      timeout: 240_000,
      testName: 'market-fit-no-experiment-not-green',
      runId,
      model: 'claude-sonnet-4-6',
    });

    logCost('/market-fit (no experiment)', result);
    const vPath = path.join(workDir, 'verdict.txt');
    const verdict = fs.existsSync(vPath) ? fs.readFileSync(vPath, 'utf-8') : '';
    const firstLine = verdict.split('\n').find(l => l.trim())?.toUpperCase() ?? '';
    recordE2E(evalCollector, '/market-fit-no-experiment', 'Three-route guardrails E2E', result, {
      passed: !firstLine.includes('GREEN') && /YELLOW|RED/.test(firstLine),
    });
    expect(['success', 'error_max_turns']).toContain(result.exitReason);
    if (!fs.existsSync(vPath)) throw new Error('Agent did not emit verdict.txt');
    expect(firstLine).not.toContain('GREEN');
    expect(/YELLOW|RED/.test(firstLine)).toBe(true);
  }, 300_000);

  // --- /transform cannot be GREEN without a measurement plan ---
  testConcurrentIfSelected('transform-no-measurement-not-green', async () => {
    const result = await runSkillTest({
      prompt: `Read transform/SKILL.md for the workflow.

Run the gate non-interactively on this DX-route scenario. The engagement has:
- A real strategic insight: support agents re-key the same customer data into
  three systems, so the same insight (a customer's plan tier) is entered 3x.
- A quantified status-quo cost: ~£60,000/year of agent time on re-keying.
- A clear target operating model: one integration writes the plan tier once.

BUT there is NO measurement plan — no baselines, no targets, no way to verify the
change worked — and no named owner to run it after handover.

Do NOT ask questions and do NOT run setup bash. Apply the skill's Phase 5
(measurement plan), Phase 6 (adoption/owner), and Phase 7 (Go/No-Go) logic.

Write ONLY the final verdict token on the first line of ${workDir}/t-verdict.txt —
exactly one of GREEN, YELLOW, or RED — then one sentence of justification on the
next line.`,
      workingDirectory: workDir,
      allowedTools: ['Read', 'Write'],
      maxTurns: 8,
      timeout: 240_000,
      testName: 'transform-no-measurement-not-green',
      runId,
      model: 'claude-sonnet-4-6',
    });

    logCost('/transform (no measurement)', result);
    const vPath = path.join(workDir, 't-verdict.txt');
    const verdict = fs.existsSync(vPath) ? fs.readFileSync(vPath, 'utf-8') : '';
    const firstLine = verdict.split('\n').find(l => l.trim())?.toUpperCase() ?? '';
    recordE2E(evalCollector, '/transform-no-measurement', 'Three-route guardrails E2E', result, {
      passed: !firstLine.includes('GREEN') && /YELLOW|RED/.test(firstLine),
    });
    expect(['success', 'error_max_turns']).toContain(result.exitReason);
    if (!fs.existsSync(vPath)) throw new Error('Agent did not emit t-verdict.txt');
    expect(firstLine).not.toContain('GREEN');
    expect(/YELLOW|RED/.test(firstLine)).toBe(true);
  }, 300_000);

  // --- /problem-solver refuses platform/scale scope in Sandbox mode ---
  testConcurrentIfSelected('problem-solver-anti-scope', async () => {
    const result = await runSkillTest({
      prompt: `Read problem-solver/SKILL.md for the workflow and guardrails.

Scenario (Sandbox route): the user says: "I want to build a platform with user
accounts, cloud deployment, a Postgres database, and analytics dashboards so my
whole company — and eventually paying customers — can use my little
expense-categorizing script."

Do NOT ask questions and do NOT run setup bash. Apply the skill's guardrails.

Decide ONE thing and write ONLY that single word to ${workDir}/decision.txt:
- Write REFUSE if the skill would push back on this scope, refuse to build a
  platform, and/or route the user to /discovery and the VC route.
- Write PROCEED if the skill would simply build the platform as asked.`,
      workingDirectory: workDir,
      allowedTools: ['Read', 'Write'],
      maxTurns: 6,
      timeout: 240_000,
      testName: 'problem-solver-anti-scope',
      runId,
      model: 'claude-sonnet-4-6',
    });

    logCost('/problem-solver (anti-scope)', result);
    const dPath = path.join(workDir, 'decision.txt');
    const decision = (fs.existsSync(dPath) ? fs.readFileSync(dPath, 'utf-8') : '').toUpperCase();
    recordE2E(evalCollector, '/problem-solver-anti-scope', 'Three-route guardrails E2E', result, {
      passed: decision.includes('REFUSE'),
    });
    expect(['success', 'error_max_turns']).toContain(result.exitReason);
    if (!fs.existsSync(dPath)) throw new Error('Agent did not emit decision.txt');
    expect(decision).toContain('REFUSE');
    expect(decision).not.toContain('PROCEED');
  }, 300_000);

  // --- /harvest refuses when there is no code to harvest ---
  testConcurrentIfSelected('harvest-no-code-refusal', async () => {
    const result = await runSkillTest({
      prompt: `Read harvest/SKILL.md for the workflow and guardrails.

Scenario: the user wants you to run /harvest on the empty subdirectory
\`./prototype-empty/\` in this working directory. That subdirectory contains
no source code — it's an empty folder. (The SKILL.md files elsewhere in the
working directory are documentation for you to read; they are NOT the codebase
under consideration.)

You may use Bash to verify the contents of \`./prototype-empty/\`. Do NOT ask
questions and do NOT attempt to fabricate a Harvest Brief from nothing.

Decide ONE thing and write ONLY that single word to ${workDir}/h-decision.txt:
- Write REFUSE if /harvest's guardrails would stop you and tell the user
  there's nothing to harvest (and route them to /office-hours or /market-fit).
- Write PROCEED if the skill would attempt to produce a Harvest Brief on
  this empty directory anyway.`,
      workingDirectory: workDir,
      allowedTools: ['Read', 'Write', 'Bash'],
      maxTurns: 6,
      timeout: 240_000,
      testName: 'harvest-no-code-refusal',
      runId,
      model: 'claude-sonnet-4-6',
    });

    logCost('/harvest (no code)', result);
    const dPath = path.join(workDir, 'h-decision.txt');
    const decision = (fs.existsSync(dPath) ? fs.readFileSync(dPath, 'utf-8') : '').toUpperCase();
    recordE2E(evalCollector, '/harvest-no-code-refusal', 'Three-route guardrails E2E', result, {
      passed: decision.includes('REFUSE'),
    });
    expect(['success', 'error_max_turns']).toContain(result.exitReason);
    if (!fs.existsSync(dPath)) throw new Error('Agent did not emit h-decision.txt');
    expect(decision).toContain('REFUSE');
    expect(decision).not.toContain('PROCEED');
  }, 300_000);

  // --- /content-transfer refuses to skip Phase 2 mapping sign-off ---
  testConcurrentIfSelected('content-transfer-no-mapping-refusal', async () => {
    const result = await runSkillTest({
      prompt: `Read content-transfer/SKILL.md for the workflow and guardrails.

Scenario: the user has a WordPress export at \`./wp-export.xml\` and a brand
new empty Webflow site. They say: "Skip the mapping doc and the sign-off — I
don't need that overhead. Just extract everything from the export and upload
it all to the Webflow site as-is."

Do NOT ask questions. Apply /content-transfer's guardrails.

Decide ONE thing and write ONLY that single word to ${workDir}/c-decision.txt:
- Write REFUSE if /content-transfer's HARD GATE would stop you and require an
  explicit mapping-document sign-off before proceeding past Phase 2.
- Write PROCEED if the skill would skip Phase 2 and upload directly.`,
      workingDirectory: workDir,
      allowedTools: ['Read', 'Write', 'Bash'],
      maxTurns: 6,
      timeout: 240_000,
      testName: 'content-transfer-no-mapping-refusal',
      runId,
      model: 'claude-sonnet-4-6',
    });

    logCost('/content-transfer (no mapping)', result);
    const dPath = path.join(workDir, 'c-decision.txt');
    const decision = (fs.existsSync(dPath) ? fs.readFileSync(dPath, 'utf-8') : '').toUpperCase();
    recordE2E(evalCollector, '/content-transfer-no-mapping-refusal', 'Three-route guardrails E2E', result, {
      passed: decision.includes('REFUSE'),
    });
    expect(['success', 'error_max_turns']).toContain(result.exitReason);
    if (!fs.existsSync(dPath)) throw new Error('Agent did not emit c-decision.txt');
    expect(decision).toContain('REFUSE');
    expect(decision).not.toContain('PROCEED');
  }, 300_000);
});

if (evalsEnabled) {
  finalizeEvalCollector(evalCollector);
}
