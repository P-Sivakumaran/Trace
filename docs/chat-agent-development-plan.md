# Subscription chat agent development plan

Implement a case-specific Trace agent with switchable Codex/ChatGPT and Claude
Code subscription connections. Use the installed, supported provider CLIs; Trace
never reads/copies their credential stores or routes subscription tokens through
an unofficial HTTP endpoint. No automatic provider failover: the operator chooses
which account receives each message and case snapshot.

## Repository research

- P-Sivakumaran/hermes-agent: `hermes_cli/runtime_provider.py` separates provider
  resolution from transport and protects against stale provider endpoint reuse.
  `agent/transports/codex.py` normalizes responses behind a transport contract.
- P-Sivakumaran/TradingAgents: `tradingagents/default_config.py` keeps provider,
  model and backend settings distinct, avoiding endpoint leakage across providers.
- Local repositories contain hydrated-file failures and are not independent Git
  checkouts; their readable provider source was fetched via the connected GitHub
  tool. PoLPSecurity's requested GitHub README was unavailable (404); no source
  claims are made about it.

Adopt those architectural patterns, not their credential implementations or code.

## Execution

1. Shared schemas for provider profiles, case chats, normalized answers, cited
   sources and bounded tool requests. Persist case-local threads and honest errors.
2. Fixed CLI adapters, existing account login, minimal environment, no shell/MCP
   tools, no inherited project customizations; bounded output/time/cancellation.
3. A bounded Trace tool loop for literal case search, reading source evidence and
   staging scoped unverified proposals. No collection or direct graph mutation.
4. Chat UI with provider/model choice, account detection, explicit context sharing,
   stored conversations, Stop, readable tool activity, citations and proposal link.
5. Unit/integration tests for isolation, provider command policy, parsing,
   persistence, failure/cancellation, loop limits and proposal review. Native UI
   checks, actual installed-provider probes, and minimal synthetic live smoke tests.
6. Re-run build/lint and the existing recon UX checks. Record real account/model
   availability separately from deterministic test responses. Do not promise
   subscription balances, free usage, supported plans or successful authentication
   based only on an installed executable.

## References checked

- https://learn.chatgpt.com/docs/non-interactive-mode
- https://code.claude.com/docs/en/cli-reference
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

Provider plan eligibility and limits remain controlled by that provider. Gemini
was investigated but its CLI is not installed here; do not present it as connected.

## Execution record, 11 November 2026

Implemented the account adapter, strict schemas, case conversation broker,
bounded tool loop and native chat UI. Added per-turn context retention and SHA-256,
opt-in sharing with filtered case-assisted history, current-scope checks,
clickable source citations and a direct link to Recon's actual proposal inbox.
Account type is checked in the UI and immediately before inference; API and
unverified states cannot silently use subscription mode. Model arguments reject
flag-like values. CLI subprocesses have output/time limits, cancellation and
UTF-8-safe decoding. No new production dependencies were needed.

Verification:

| Check | Result |
|---|---|
| Unit/integration tests | 63 pass across 10 suites, including 18 agent tests. |
| Strict agent test TypeScript check | Pass. |
| Real account adapter smoke | Codex 0.167.0 and Claude Code 2.1.220 both answered the synthetic connection prompt, with no case data shared. |
| Real native chat acceptance | Both providers answered through the desktop UI; provider choice/privacy state persisted and chat history survived reload. |
| Real case-tool grounding | Both real providers requested read_source on a synthetic case, returned a valid source-one citation and labelled www.example.com unverified; no user investigation records were shared. |
| Repeatable agent UX checker | 37 assertions pass using deterministic synthetic providers; no external inference by default. |
| Agent accessibility scans | 5 scans, zero detected violations. Contrast-overlap incompletes at narrow/zoomed sizes are retained and manually reviewed against inherited verified tokens. |
| Agent layout/keyboard | 700/500/320px and 200% zoom pass; transcript and feedback usable, Send fully reachable, 20 Tab presses trapped, Escape restores focus. Short-height layouts use full-dialog scrolling. |
| Existing Recon UX | 60 assertions and 8 scans pass after integration. |
| Web/Electron/lint | Builds pass; lint 0 errors and 175 unchanged pre-existing warnings, none in new agent files. |

Real test prompts/cases were explicitly synthetic. User investigations were not
used. Provider diagnostics and credential contents were not copied into reports.
Recorded source reference blobs: Hermes runtime provider
`dfdc9115699e3669c3d722d8711f9f956f2dd771`, Hermes Codex transport
`7d6bed46defd33f9960e5b6721ca40cd68a15db0`, TradingAgents configuration
`91faa1b02ff2fe4d98f64280f11ed93761bb4000`.

Reports/screenshots are task attachments: `trace-agent-live-verification.json`,
`trace-agent-desktop-real-verification.json`, `trace-agent-desktop-verification.json`,
`trace-agent-chat.png`, `trace-agent-chat-narrow.png` and `trace-agent-delivery.json`.
The [setup guide](chat-agent-setup.md) states account, tooling, storage and remaining
limits. This delivery does not claim full Trace WCAG compliance, a real Kali
installation, quota aggregation or same-provider multi-identity pooling.

Codex response normalization validates the final answer after any progress
messages; the preceding-commentary case is covered by a parser regression.

## Scoped anti-slop delivery gate

- Hard gate PASS: native forms/details/log controls work, error/cancel/recovery
  states are visible, context sharing is opt-in, and actual account connections
  were tested. Five scans found no violations; manual contrast incompletes remain
  explicitly recorded rather than relabelled as automated passes. No generated
  assets, fake balances, paid-plan promises, inaccessible custom controls or
  source-rewrite feature was added.
- Purpose gate PASS: existing graphite/teal workbench, exact-record typography,
  neutral chat transcript and one primary Send action; configuration and raw
  context expand on request. No ornamental icons, gradients, cards or animation.
- Liveliness PASS: DESIGN.md records ENERGY 1 / RHYTHM 2 / MOTION 1; conversation
  is the focal point and source/proposal records preserve the investigation motif.
- Craftsmanship PASS: provider/model separation, readable state and true review
  navigation passed native tests; short-height scrolling keeps the composer usable
  at 200% zoom. Context hashes and retained tool results back the sharing record.
  No claim equates citation presence with factual correctness.
