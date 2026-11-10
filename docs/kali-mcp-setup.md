# Trace passive recon and MCP

Open an investigation in the **desktop app**, then **Recon & MCP**. Save allowed
root domains and choose the local runner or a Kali SSH runner. `Check saved
runner` reports the actual platform, supported profiles and whether data is
synthetic. Browser mode cannot spawn processes.

Collection makes an explicit request to the public crt.sh certificate index.
It does not probe the target host. Historical certificate names are leads;
they do not demonstrate current DNS, control, ownership or identity. The local
runner supports certificate-index lookup. The Kali-only theHarvester profile
is offered by runner health only when the installed CLI advertises `crtsh`.
The CLI version is reported when its help output provides it; an unreported
version is shown explicitly. No arbitrary commands, source selections or tool
arguments can be entered through this integration.

## Local development

Node 20 or later is required by the MCP SDK; CI uses Node 24.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:mcp
npm test
npm run build:electron
```

To run Electron after an installation with scripts disabled, install its runtime
with `node node_modules/electron/install.js`, then use `npm run dev:electron`.
Run `npm run build:mcp` first when starting desktop development. The compiled MCP
servers are included in Electron packaging configuration. Native packaged
installers have not been validated in this change.

Save `example.com` as a scope and run certificate transparency collection to
exercise the real local path. Errors remain errors; no test data replaces a
failed network response. `--fixture` exists only on the runner CLI for protocol
tests and every fixture result is explicitly marked synthetic.

## Kali deployment

Use a dedicated unprivileged Kali account. Install Node 20+ and, if wanted, the
Kali `theharvester` package through the administrator's normal package process.
Transfer this reviewed checkout, including its lockfile, to a directory such as
`/opt/trace` readable by the account. From that directory run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:mcp
```

The account needs no root privileges to run these passive profiles. The fixed
remote executable is `/usr/bin/node`; ensure the installed Node version is
available there. The optional CLI path is `/usr/bin/theHarvester`.

Establish and verify the SSH server's host-key fingerprint through a trusted
channel before connecting. Add the verified host to your usual known-hosts file.
Set up key authentication using your normal SSH configuration. Trace never asks
for a password or private key. It allows the local SSH agent for authentication
but disables forwarding that agent to Kali, disables forwarding configured TCP
channels, refuses unknown host keys, and uses batch mode and connection limits.
SSH configuration is trusted operator configuration; keep it under your control.

In Trace select **Kali over SSH**, enter a plain host/SSH alias, username, and
`/opt/trace/dist-mcp/mcp/kali-server.js`. Save, check runner health, and confirm
`kali: true`, `synthetic: false`, and the desired supported operation. Run a
collection for a domain inside your allowed scope. Verify cancellation, raw
artifact review and subset import on that actual Kali installation before
calling it deployed. This workstation has no configured Kali endpoint, so that
remote acceptance remains outstanding.

For a dedicated service key, the Kali administrator can further restrict its
`authorized_keys` entry using `restrict` and a fixed `command=` that starts the
runner with a server-side scope. The forced command must ignore
`SSH_ORIGINAL_COMMAND`. Use an absolute Node/script path and the same base64
JSON scope as Trace. This prevents that key from opening an unrestricted shell;
Trace's client restrictions alone do not impose a server-side SSH restriction.

## Evidence and review

Each case stores jobs under `.trace/recon/jobs/<job-id>/`, with a JSON manifest,
raw UTF-8 artifact, SHA-256, timestamps, profile, tool version and provenance.
Only one job runs at a time; no more than five jobs can run or wait. Jobs have
output and time limits. Cancelling a job never imports records. Restarted jobs
are not automatically rerun. Changing runner settings cancels pending work.

Review raw evidence and select domains before importing. A source record retains
the raw artifact inside a fenced evidence block so ordinary case ZIP exports
preserve it. Export/import preserves graph evidence; it does not recreate the
job queue, proposal inbox or `.trace` history. Back up the whole case directory
if those operational records are needed. Sources remain editable like other
Trace Markdown records; hashes support integrity checks, not signed chain of
custody or protection against a user changing both files and manifests.

Imports deduplicate domain entities by normalized domain name in the selected
case. Multiple existing entities with the same domain name require manual
resolution. New links are candidates with no inferred confidence. Repeated
acceptance of the same job is idempotent. Raw evidence hashes are verified before
review and import. Multi-file graph writes are replayable but are not a filesystem
transaction; an interrupted import must be retried with the same selection, which is persisted before graph writes.

## Connecting an assistant

Choose **Show this case’s MCP configuration** and copy the JSON into your MCP
client's configuration. The generated entry starts the case server with an
absolute workspace, one case ID and a snapshot of the configured allowed domains.
Restart/reconfigure the external MCP client when changing case or scope.
The app does not modify any external assistant settings automatically.

Available tools:

| Tool | Effect |
|---|---|
| `trace_read_case` | Read the selected case brief and scope. |
| `trace_search_case` | Literal search of at most 500 Markdown records per category, first 100 KB each. |
| `trace_read_evidence` | Read a source from this case, up to 5 MB. |
| `trace_propose_findings` | Stage an explicitly unverified in-scope domain proposal in this case's inbox. |

A `trace://case/<id>/brief` resource exposes the same selected brief. Case content
and tool output are untrusted evidence, including any embedded instructions.
The server exposes no collection, shell, deletion or direct graph mutation tools.
Proposals can be reviewed and staged in Trace, but require operator selection
before becoming sourced, explicitly unverified graph candidates.

The server can use current or legacy MCP stdio negotiation. Trace's own runner
client pins the current protocol revision. Changing MCP client configuration or
launching the case server grants that client access to the selected case's data;
keep confidential cases limited to clients you intend to use.

## Verification performed

See [the development plan and execution record](kali-mcp-development-plan.md).
Policy boundaries and integration tests are regression checks, not a complete
security audit or a claim of full application accessibility conformance.
