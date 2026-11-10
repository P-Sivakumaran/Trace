# Recon UX refinement plan

Apply the locally available miqdadbadjuber/anti-slop skills to Trace's existing
Recon & MCP workflow. The user authorized planning and execution. Use the skills
during refinement; no additional selection of audit finding numbers is needed.

## Findings and implementation

| Priority | Finding | Change | Anti-slop rules |
|---|---|---|---|
| High | Health is raw JSON and unsupported profiles can be chosen | Parse health results and show platform/capabilities; gate profiles on checked capabilities | R-26, R-27, R-36 |
| High | Collection can silently use saved settings while the form shows unsaved edits | Separate saved connection from its draft; require saving and checking before collection | R-26, R-27, C-5 |
| High | Errors/status appear below a long scrolling dialog | Keep feedback visible and announce errors; readable schema validation and refresh recovery | R-27, R-32, R-39 |
| Medium | Connection setup dominates repeat use | Keep collection/review central and move settings and assistant setup to named sections | R-05, R-14, C-3 |
| Medium | Hashes and raw artifacts overwhelm finding selection | Show domain/status/count first; expandable provenance; filter/select shown/clear controls | R-06, R-15, C-1 |
| Medium | Proposals remain actionable after being staged or imported | Only show unstaged proposals; refresh immediately after actions | R-26, R-38 |
| High | Dialog is difficult to use when zoomed/narrow | Responsive scroll body, fixed header/footer, 44px controls, explicit focus/contrast | R-03, R-25, R-32, R-39 |

## Execution and acceptance

1. Record visual purpose and dials in DESIGN.md.
2. Implement readable connection health, task sections, truthful readiness,
   contextual feedback and evidence review without changing backend authority.
3. Run unit/integration tests, build/lint, and isolated desktop walkthroughs.
4. Check first-use, saved settings, invalid input, failed connection, empty jobs,
   proposals, filtering, selection, raw review, import and MCP configuration.
5. Verify keyboard Escape/focus, narrow widths and 200% zoom in the changed
   dialog; calculate text/control contrast and run an automated accessibility scan.
6. Record anti-slop delivery-gate results and remaining application-wide limits.

Scope: the Recon & MCP flow and its entry label/context. This pass does not claim
full Trace accessibility conformance or actual Kali deployment acceptance.

## Completed execution, 10 November 2026

Implemented all findings above in the Recon & MCP dialog. Added DESIGN.md and
kept Trace's graphite/teal identity. Collection, connection editing and assistant
access now have separate task views. Saved settings and checked capabilities
control readiness; raw evidence and configuration appear only on request.
Running/queued jobs expand so Cancel is visible. Immediate refresh after actions
removes staged proposals and updates imported jobs without waiting for polling.

Validation results:

- 45 unit/integration tests pass across 9 suites, including health-contract checks.
- The reusable native checker passes 60 assertions, including first-use setup,
  invalid scope, unsaved edits, real local health, simulated connection failure,
  refresh recovery, cancellation, domain filtering, selected import, raw review,
  proposals, clipboard configuration, keyboard trap, Close and Escape restoration.
- 8 axe scans of the changed dialog report zero violations. One overlapping
  dialog-description contrast result requires manual review; its actual text and
  background tokens pass the anti-slop contrast calculation. The report retains
  this incomplete result rather than counting it as an automated pass.
- The anti-slop human skill's contrast calculator passes all 37 applicable text,
  control-boundary and focus-color pairings. Text thresholds use 4.5:1 and
  non-text boundaries/focus use 3:1.
- Dialog reflow passes at 980, 700, 500 and 320 CSS pixels, plus 200% native
  Electron zoom. Header, task controls and feedback stay visible while the body
  scrolls. No dialog horizontal overflow or renderer errors were found.
- Web and Electron builds pass. Lint has zero errors and the same 175 pre-existing
  warnings, with no warnings in the new UX code/checker.

Collection tests use explicitly labelled synthetic data through the real MCP
transport. Production settings IPC, local health and case-proposal paths are
exercised; failure/collection handlers are replaced only inside the isolated test
process. These checks are not a real Kali acceptance test. Existing user cases
are not used or modified.

Reports and screenshots: task attachments `trace-ux-verification.json`,
`trace-ux-contrast.json`, `trace-ux-desktop.png`, `trace-ux-narrow.png`.
See [the anti-slop delivery gate](anti-slop-ux-review.md) for rule-by-rule evidence.

## Repeating the native check

Build with `npm run build:electron` and install the Electron runtime if absent.
`npm run check:ux` requires Playwright and axe-core in the test environment.
These optional GUI test tools are not production dependencies. If their modules
are already installed elsewhere, provide their absolute paths:

```sh
TRACE_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
TRACE_AXE_PATH=/path/to/axe-core/axe.min.js \
npm run check:ux
```

The checker creates a fresh disposable workspace/profile below
`artifacts/recon-ux`, writes reports/screenshots there, and closes the test app.
`TRACE_UX_OUTPUT` changes that output directory. The checker currently validates
macOS Electron health and native window behavior; other operating systems need
separate acceptance. The clipboard test copies the generated test-case MCP
configuration. It replaces the system clipboard during the walkthrough.
