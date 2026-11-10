# Importing data from external tools

TRACE is an investigation workspace, not a collection engine. Collection tools (SpiderFoot, recon scripts, scrapers, spreadsheets) produce the data; TRACE organises, connects and documents it.

Open a case, then **Import data** in the Case brief toolbar (or the import icon in the explorer rail).

## Supported formats

| Format | Detected by | Notes |
| :--- | :--- | :--- |
| **TRACE import JSON** | `"trace_import": 1` field | Canonical format; the recommended target for your own scripts |
| **SpiderFoot CSV** | header with `Type`, `Module`, `Source`, `Data` | Event types mapped to TRACE types; `Source` column becomes `related_to` links; rows marked false positive (`F/P = 1`) are kept as unmapped |
| **CSV** | `.csv` with a `value` / `indicator` / `name` / `data` column | Optional `type`, `source_url`, `observed_at`/`timestamp`, `tool` columns; other columns become attributes |
| **Indicator list** | `.txt`, one value per line | Types guessed: email, IP, URL, domain, phone, MAC address, `@handle`; `#` lines ignored |

The format can be changed manually in the dialog.

## TRACE import JSON

```json
{
  "trace_import": 1,
  "tool": "my-recon-script",
  "entities": [
    {
      "key": "d1",
      "type": "domain",
      "name": "example.com",
      "aliases": [],
      "attributes": { "registrar": "Example Registrar" },
      "tags": ["recon"],
      "source_url": "https://whois.example/example.com",
      "observed_at": "2026-11-01T10:00:00Z"
    },
    { "key": "ip1", "type": "ip", "name": "93.184.216.34" }
  ],
  "relationships": [
    {
      "source": "d1",
      "target": "ip1",
      "type": "resolves_to",
      "status": "candidate",
      "confidence": 0.8,
      "source_url": "https://dns.example/example.com",
      "observed_at": "2026-11-01T10:00:00Z",
      "note": "A record at time of scan"
    }
  ]
}
```

- `type`: a TRACE entity type (`person`, `organization`, `company`, `website`, `domain`, `account`, `email`, `phone`, `ip`, `location`, `document`, `event`, `computer`, `laptop`, `smartphone`, `server`, `network_interface`, `custom`) or a common alias (`hostname`, `ipv4`, `url`, `username`, `mac_address`…).
- `status`: `candidate` (default), `unverified`, `supported`, `confirmed`, `rejected`.
- Only `http(s)` URLs are kept in `source_url`.

## Review before commit

Nothing is written until you press **Import into case**. For every entity you choose:

- **Create new**
- **Use existing**: offered when the entity matches an existing one of the same type by normalised name or alias (`www.`, trailing dots, URL schemes, phone punctuation and `@` are ignored when comparing). The existing record is **never modified**; imported relationships simply point to it.
- **Skip**

Relationships that already exist (same endpoints and type) are skipped. Relationships whose endpoint was skipped are dropped.

## What gets written

- A **source** for the import (`Import: <file> (<tool>)`) recording tool, format, file, time, counts, warnings and every record that could not be mapped (`trace_import.unmapped` in its frontmatter).
- New **entities** tagged `imported`, with `trace_import` frontmatter: batch id, tool, format, file, `imported_at`, `source_url`, `observed_at` and the tool's original record (`raw`).
- New **relationships** with the same provenance, citing the import source as evidence, status `candidate` unless the file says otherwise.

Because provenance lives in frontmatter, imported data stays distinguishable from manual work, survives export/import and is visible to the MCP server (`provenance.origin = "import"`).

## Adding an adapter

Add an `ImportAdapter` to `src/services/import/adapters.ts`:

```ts
export const myToolAdapter: ImportAdapter = {
  id: 'my-tool',
  label: 'My tool (JSON)',
  detect: (fileName, text) => (text.includes('"my_tool_version"') ? 80 : 0),
  parse: (text, fileName) => ({ format: 'my-tool', tool: 'My tool', fileName, entities: [], relationships: [], unmapped: [], warnings: [] }),
};
```

and register it in `IMPORT_ADAPTERS`. Adapters are pure functions (text in, `ImportBatch` out), so they can be unit-tested without the UI. Records that cannot be mapped belong in `unmapped`, never silently dropped.
