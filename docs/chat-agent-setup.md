# Case agent: account-based chat

Open an investigation and choose **Case agent**. Choose Codex/ChatGPT or Claude
Code for each message. Messages and replies remain in that case, including
provider/model, sharing choice, errors, cited source IDs and completed tool
activity. Use **New chat** for a separate conversation. **Stop response** cancels
the active provider process; it does not roll back a proposal already staged.

## Accounts and models

Trace delegates to installed official CLIs. It does not read, copy, display or
store their credential files/tokens. On this workstation both Codex and Claude
account logins were detected and both completed synthetic inference tests.
That proves connectivity at test time, not future entitlement or a usage balance.

In **Accounts & models**, inspect the installed version and account status.
Sign in through your terminal if needed:

```sh
codex login
claude auth login
```

The versions exercised here are Codex CLI 0.167.0 and Claude Code 2.1.220.
Trace looks in standard macOS/Linux executable locations, including Homebrew and
`~/.local/bin`. The CLIs are not bundled with Trace. Older versions may lack the
required flags; update through the provider's normal process. Windows native
executables are detected via PATH, but Windows acceptance has not been performed.

An optional model ID applies only to the selected provider. Leaving it blank uses
the provider's default. Trace never silently reuses another provider's model ID,
endpoint or login. Current UI model choices remain for this open dialog; every
reply's provider/requested model is persisted in the conversation.

This is subscription/account mode: API-key and unverified account states are
blocked in the UI rather than silently charging API billing. Provider-owned CLI
account state is checked again before inference. Plan eligibility and rate/usage
limits remain controlled by each provider. No balances, remaining tokens,
quota-based rotation or automatic fallback are claimed. One existing signed-in
account per CLI is supported; same-provider multi-identity pools are not managed.
Gemini was investigated but is not installed/implemented in this delivery.

Official references checked:
[Codex account-based automation](https://learn.chatgpt.com/docs/non-interactive-mode),
[Claude CLI](https://code.claude.com/docs/en/cli-reference),
[Claude plan usage](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

## Sharing and investigation tools

Case sharing starts **off**. Without it, Trace sends the message and recent
non-case-assisted chat history; it omits case ID, case snapshots, domain scope,
case-assisted history and case tool access. Text you type manually still goes to
the selected provider. Changing provider sends the permitted recent conversation
history to that provider only when you explicitly send the next message.

Enable **Share case records and case-assisted history** to allow a bounded
snapshot and the following Trace-managed tools:

| Action | Boundary |
|---|---|
| Literal case search | Selected case only; up to 150 files/category, first 8 KB/record, 60 KB/category; at most 12 matches. |
| Read source | Selected case, first 16,000 characters of one existing source; never arbitrary paths. |
| Propose domain findings | Saved allowed domains and subdomains only; rechecks current scope before staging an unverified proposal. |

The initial snapshot is at most 48,000 characters; recent history is bounded to
10 completed messages/40,000 characters. Search coverage is partial. The snapshot
preview shows the actual local contents and whether they were truncated. It sends
nothing to a provider. Source files may change between preview and the next send.

Each case-assisted reply retains its actual snapshot, shared history and tool
results under `.trace/chat-context/<message-id>.json`, with a SHA-256 of the initial
snapshot. **Shared context record** exposes that hash and record count. These are
local audit artifacts, not a signed chain of custody. Citation IDs must identify
sources actually supplied to that turn; this does not prove the model's inference
is correct. **Open source** opens the actual source editor for inspection.

The agent has at most three tool requests/four provider invocations within one
three-minute response. Two conversations may run concurrently. There is no
scheduled/background investigation, web browsing, active scanning or direct graph
mutation. A proposal's review button opens **Recon & MCP → Assistant access**;
select its domains and import only after reviewing the evidence. Collection still
runs through Recon's existing operator-triggered workflow.

## Storage and runtime

Conversations live under `.trace/chat/<conversation-id>.json` in each case.
Chat/context artifacts are not included in the current ordinary graph ZIP export;
back up the entire case directory to retain them. The UI shows up to 50 recent
conversations and caps a conversation at 100 messages; start a new chat when full.
No running response is replayed after an application restart.

The main Electron process validates requests and owns the provider processes.
Prompts travel over stdin rather than shell arguments. Child environments omit
API keys, arbitrary Node options and unrelated service credentials. Claude runs
in safe mode with tools/MCP/skills disabled. Codex runs ephemeral/read-only with
user configuration, rules, shell, apps, plugins, hooks, browsing, image and agent
features disabled. Managed provider policy still applies; this is not a claim of
an independently audited process sandbox. Usage/account identity remains owned
by the provider CLI, not a third-party token-forwarding service.

## Repeatable verification

```sh
npm test
npm run build:electron
npm run check:agent-ux
```

The native checker needs optional Playwright and axe-core in the test environment;
like the recon checker, it accepts `TRACE_PLAYWRIGHT_MODULE`, `TRACE_AXE_PATH` and
`TRACE_UX_OUTPUT`. Its default uses deterministic synthetic providers and a fresh
disposable workspace/profile under `artifacts/agent-ux`; it never uses existing
user cases. `TRACE_AGENT_LIVE_SMOKE=1` additionally sends two tiny synthetic messages
through the real installed accounts, with case sharing off. That explicit mode
uses the providers' real plan limits. Reports distinguish it from fixture tests.
