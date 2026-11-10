# Kali and MCP development plan

Build a complete passive collection and evidence-review path, then expose a
case-scoped interface to an assistant. No raw shell execution is exposed.

| Stage | Implementation and acceptance |
|---|---|
| 1. Boundaries | Trusted top-frame Electron IPC only; prevent foreign navigation; strict case/domain/config schemas; deny public suffixes and out-of-scope targets. |
| 2. Runner | Official MCP 2.x client/server over stdio, locally or a fixed SSH command. Passive certificate-transparency lookup and a constrained theHarvester crtsh profile; health/capability reporting. Validate on real Kali when a connection is supplied. |
| 3. Jobs/evidence | Bounded queue, timeout/cancellation, case-specific immutable raw artifacts and SHA-256 manifests; never silently switch backend or accept out-of-scope output. |
| 4. Review/import | Operator starts collection, reviews candidate domains, accepts a subset. Import sourced candidate relationships without overwriting existing entities. Preserve replay/idempotency and cross-case isolation. |
| 5. Trace MCP | Read/search one explicitly selected case; read evidence; write constrained proposals to a review inbox. No collection, shell or direct graph-write tools for the assistant. |
| 6. Delivery | Policy/parser/job tests, real modern/legacy MCP transport tests, desktop IPC/UI walkthrough and normal build/lint checks. Record real versus synthetic collection and Kali availability separately. |

Current environment: macOS arm64; SSH exists. Local checks found no Kali VM or
UTM/VMware installation. The user was asked for a Kali SSH alias/user. Work that
does not require that endpoint proceeds; a local test is not reported as Kali
acceptance. Production remote transport uses strict host-key checking and a
dedicated unprivileged account. No VM image or third-party credential is installed
without a concrete target/configuration.

References: [MCP server guide](https://modelcontextprotocol.io/docs/develop/build-server),
[MCP security guidance](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices),
[Kali theHarvester](https://www.kali.org/tools/theharvester/).

## Execution record — 10 November 2026

Stages 1–5 are implemented locally. Stage 6's local acceptance checks pass;
remote Kali acceptance and native installer validation remain open.

- Added a desktop Recon & MCP dialog with explicit scope/configuration, runner
  health, operator-triggered collection, cancellation, raw-artifact review,
  selected-domain import and an assistant proposal inbox.
- All privileged Electron IPC handlers now check the originating top frame and
  application document. Foreign navigation/webviews are blocked. New case access
  rejects traversal and symlinks, including broken symlinks.
- Added official MCP 2.4.0 client/server packages, current-protocol runner calls,
  and current/legacy server negotiation. Both servers use stdio; no network port
  is opened. SSH uses a fixed executable/script and validated arguments.
- Added bounded jobs, output/time limits, integrity checks, cancellation, stable
  record IDs and selection-preserving retry after partial import. Sources retain
  raw evidence in ordinary Markdown so ZIP exports keep it.
- Added case-bound read/search/evidence/proposal tools. Proposals never trigger
  collection or graph mutation. Imported proposals remain unverified candidates.
- Added a CI Electron compilation check and setup/deployment documentation.

Validation:

| Check | Result |
|---|---|
| Unit/integration suites | 44 tests pass across 9 suites, including 11 new recon tests. |
| MCP transports | Real stdio processes tested with current and legacy negotiation. |
| Policy/evidence | Domain boundaries, SSH argument injection, symlinks, cross-case isolation, tampering, queue cap, cancellation, subset import, replay and proposal separation pass. |
| Web build | Pass; existing large-bundle warning remains. |
| Electron build | Pass; compiled MCP entry points included in packaging configuration. |
| Lint | 0 errors; 175 existing warnings; no warnings in the new integration files. |
| Desktop regression | Duplicate cases/imports, quoted YAML, persisted active case and reload pass. |
| New desktop workflow | Actual Electron IPC and MCP transport, local health, proposal review, raw SHA verification, selected import, generated case configuration, Escape/focus restoration and blocked foreign navigation tested. |
| Live passive collection | Real crt.sh request for example.com succeeded, yielding 7 historical certificate-index domain leads. Synthetic=false; local macOS runner, not Kali. Raw response and SHA-256 report retained. |
| Actual Kali SSH/theHarvester | Pending: no Kali host/SSH alias and username supplied or local Kali VM found. |
| Native packaged installers | Not tested; this delivery validates development builds. |

Task attachments hold `trace-mcp-desktop-verification.json`,
`trace-mcp-review.png`, `trace-live-ct-verification.json` and
`trace-live-ct-raw.txt`. The live response's SHA-256 is
`9cba269c6ea4718bd37275aaae24c3c2799e0f8a96cba6d080818b782af840e2`.
These are validation artifacts; no test findings were inserted into the user's
existing investigations. Changes remain local on `improve/local-reliability`;
nothing has been pushed or deployed remotely.

See [the deployment guide](kali-mcp-setup.md) for the remaining Kali acceptance
steps and operational limits. This work does not establish full application
security certification or WCAG conformance.
