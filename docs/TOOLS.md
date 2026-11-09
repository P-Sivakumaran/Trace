# Tools: running OSINT tools from TRACE

**Tools** in the left rail opens a small marketplace of external OSINT tools that TRACE installs and runs locally. TRACE stays the workspace: tools collect, and their findings go through the import review before entering a case.

Desktop app only. Requires **Python 3.9+** on the machine (`python3`, or `py -3` on Windows).

## Catalog

| Tool | Input | What it finds | Package |
| :--- | :--- | :--- | :--- |
| [Sherlock](https://github.com/sherlock-project/sherlock) | username | Accounts with that username on 400+ sites | `sherlock-project` |
| [Maigret](https://github.com/soxoj/maigret) | username | Accounts on the top 500 sites, with profile details (name, location, IDs…) where exposed | `maigret` |
| [Holehe](https://github.com/megadose/holehe) | email | Services where the email is registered (password-recovery probes disabled, so the target is not notified) | `holehe` |

## Install and remove

**Install** creates `<app data>/tools/<tool>/` (a Python virtual environment) and runs `pip install <package>` into it. Nothing is installed system-wide. **Uninstall** deletes that folder.

App data folder: `~/Library/Application Support/trace` (macOS), `%APPDATA%\trace` (Windows), `~/.config/trace` (Linux).

## Run

1. Choose a **case entity** (an account/person for username tools, an email for Holehe). Its name fills the input; you can also type a value.
2. **Run**. The output streams live; **Stop** kills the tool and its child processes. Each run has a hard time limit (5–15 minutes depending on the tool).
3. **Review & add to case** opens the import review:
   - the target is matched to the existing entity (never modified),
   - each hit becomes an `account` entity (`<value> (<site>)`) with `platform`, `url` and any extracted profile fields as attributes,
   - links (`has_account` / `registered_on`) start as **Candidate**,
   - everything is tagged `imported` and with the tool name, keeps the raw output line as provenance, and cites an import source recording the run.

## Security

- The renderer can only send a catalog tool id and an input value. The command line is built in the main process from the catalog.
- Inputs are validated (usernames `[A-Za-z0-9._-]`, max 64; emails), and can never start with `-`, so they cannot become command-line flags.
- Processes are spawned without a shell, in a temporary working directory that is deleted afterwards, in their own process group so Stop/timeout also ends helper processes.
- Tools make network requests to third-party sites directly from your computer. Use them only where you are allowed to.

## Adding a tool

1. Add a `ToolSpec` to `src/services/tools/catalog.ts` (PyPI package, console script, input kind) and its argv to `buildToolArgs`.
2. Teach `src/services/tools/parsers.ts` to turn its stdout into an `ImportBatch`.
3. Add a parser test with real captured output to `src/tests/tools.test.ts`.

`TRACE_REAL_TOOLS=1 npx vitest run src/tests/tools.real.test.ts` performs a real install + run of Sherlock (network required).
