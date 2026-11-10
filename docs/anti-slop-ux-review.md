# Applied anti-slop UX review

10 November 2026. Scope: Trace's Recon & MCP dialog and case context at its entry.
Applied the locally available anti-slop 3.2.26 core, UI, layoutmobile,
copywriting, human and comment rules from
[miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop).
This is a rules-based review plus the human skill's actual contrast calculator,
not a claimed automated anti-slop score.

Direction: [DESIGN.md](../DESIGN.md). ENERGY 1 / RHYTHM 2 / MOTION 1.
Implementation and results: [UX development plan](ux-refinement-plan.md).

The gate below applies to this changed workflow, not the entire existing app.
PASS means the scoped condition has concrete supporting evidence; absent
techniques are explicitly recorded. Existing app-wide accessibility issues and
actual Kali deployment remain outside this pass.

## Hard gate

- R-02 PASS: authored interface copy has no em dashes; labels name actors/actions.
- R-03 PASS: native checker records no dialog horizontal overflow at 980/700/500/320px and 200% zoom; controls are at least 44px high, checkbox labels provide the larger target.
- R-17 PASS: counts derive from actual returned jobs, proposals and selections; dates derive from record timestamps.
- R-18 PASS: no testimonials or customer claims are present.
- R-23 PASS: no logos, photos, illustrations or other brand assets were created; task views directly organize the authorized recon workflow.
- R-24 PASS: all three named task buttons render their corresponding sections; evidence links use the recorded crt.sh URL.
- R-25 PASS: actual anti-slop contrast calculator passes 37 applicable token/state pairs; text at least 4.5:1 and control/focus boundaries at least 3:1. Axe's overlapping-description contrast incomplete was inspected and calculated manually, not suppressed.
- R-26 PASS: native walkthrough covers setup/save/check, validation, failed health, recovery, collection/cancel, filter/select/clear, evidence review, import, proposals, configuration/copy and Close. Backend tests cover interrupted-import retry.
- R-27 PASS: initial loading, empty collections/proposals, working status, failed action and refresh recovery are visible; live feedback remains outside the scrolling body.
- R-28 PASS: no filler FAQ was added.
- R-32 PASS: native dialog traps 24 consecutive Tab presses, focus has a visible 3px outline, Escape and Close return focus to the opening button.
- R-33 PASS: product markup/styles were written directly in TSX/CSS using source edits; no runtime rewrite or source-patching feature was added.
- R-34 PASS: inherits the existing Trace theme; no theme toggle or unsupported second theme was introduced. Forced-colors borders are explicit.
- R-35 PASS: web/Electron builds and the isolated native click-through pass; report retains 60 assertions and 8 scans with zero detected violations.
- R-36 PASS: health is parsed from the runner, unavailable profiles stay disabled, proposals remain unverified, and synthetic collections have visible labels. No full WCAG/security/Kali-deployment claim is made.
- R-37 PASS: DESIGN.md records existing product identity and dials before implementation; screenshots were visually inspected.
- R-38 PASS: collection fixtures are explicitly labelled synthetic, and no fabricated content was inserted into existing user investigations.
- R-39 PASS: native buttons/forms/details/checkboxes, visible input labels, named scroll regions, aria-pressed task selection, status/alert feedback, pointer/disabled/focus states; no added motion or images. Axe reports zero violations after named-pre regions were fixed.
- R-40 PASS: no media, animations, third-party render scripts or performance claims added. Polling is bounded to the open dialog and schedules the next poll after the previous one finishes.

## Purpose gate

- R-01 PASS: no gradients or glows added; teal identifies the current section and primary collection/import action.
- R-04 PASS: no new icon library or decorative icons added; native disclosure markers indicate expandable evidence.
- R-06 PASS: existing sans-serif is used for reading and controls; monospace is limited to domains, hashes and configuration for exact inspection.
- R-07 PASS: no decorative grid or background pattern added.
- R-08 PASS: no ornamental button arrows added.
- R-09 PASS: statuses are readable text from job state, not decorative marketing badges.
- R-10 PASS: no glass effect added; the native backdrop separates the dialog from the investigation.
- R-12 PASS: no repeated card shadows added.
- R-13 PASS: no glow added.
- R-14 PASS: connection context is a compact aside, findings form a disclosure ledger, and assistant proposals are records; no filler feature-card grid.
- R-19 PASS: no entrance, stagger, scrolling or ambient animation added, matching MOTION 1.
- R-22 PASS: no illustrations added.

## Liveliness

- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 declared in DESIGN.md.
- Consistency PASS: quiet surfaces, a split input/context area and a full-width evidence ledger give deliberate hierarchy without motion.
- Focal point PASS: collection/import uses the single filled teal action; secondary controls remain neutral.
- Whitespace PASS: 24px task grouping, 28px ledger separation and compact record spacing express input versus review.
- Accent PASS: existing teal signals action and selected task, rather than decorating every surface.
- Identity PASS: hostname-first records with source/status/decision structure express Trace's investigation purpose.
- Design read PASS: preserve Trace's graphite workbench and exact-evidence typography; no unrelated redesign or assets.

## Craftsmanship and quality locks

- C-1 PASS: layout, color, typography and disclosure purposes are recorded in DESIGN.md.
- C-2 PASS: native walkthrough exercises the changed actions; queued/running records now reveal Cancel immediately.
- C-3 PASS: every view serves collection, connection setup or assistant review; no marketing sections added.
- C-4 PASS: tested loading/empty/error/recovery, narrow/zoomed layouts and keyboard use. This is scoped verification, not app-wide certification.
- C-5 PASS: fixture labels and retained raw evidence distinguish proposals, test results and actual local health.
- R-05 PASS: composition follows the investigation task sequence rather than a landing-page template.
- R-11 PASS: compact 4px control/disclosure surfaces and an 8px modal maintain hierarchy; no pill-shaped component set.
- R-15 PASS: controls name their effects, including Save connection, Check connection, Select shown, Import selected candidates and Copy configuration.
- R-16 PASS: removed raw identifiers from prominent UI and kept operational copy literal; no marketing buzzwords.
- R-20 PASS: case context, hostname records and provenance tie the flow to Trace's evidence graph.
- R-21 PASS: extends the existing dark graph/editor workspace rather than introducing an unexplained new theme.
- R-29 PASS: neutral surfaces and the existing teal accent; warning/error colors carry explicit text.
- R-30 PASS: existing Trace identity retained; no external product layout copied.
- R-31 PASS: DESIGN.md records the reasons for typography, controls, spacing, accent, evidence ledger and task separation.

No source comments needed rewriting in this pass. Security/protocol comments in
the existing broker and transport were retained.
