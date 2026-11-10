import { useCallback, useEffect, useRef, useState } from 'react';
import { reconConfigSchema, runnerHealthSchema, domainSchema, withinScope, type ReconConfig, type ReconJob, type ReconProposal, type RunnerHealth } from '../services/recon/contracts';
import './recon.css';

type Section = 'collect' | 'connection' | 'assistant';
type Feedback = { kind: 'status' | 'error'; text: string };
const profileNames = { certificate_transparency: 'Certificate index', theharvester_crtsh: 'theHarvester · crtsh', assistant_proposal: 'Assistant proposal' };
const statusNames = { queued: 'Queued', running: 'Collecting', succeeded: 'Ready to review', failed: 'Failed', cancelled: 'Cancelled', imported: 'Imported' };
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}

function JobReview({ job, busy, perform, api, onImported }: {
  job: ReconJob; busy: boolean; perform: (work: () => Promise<void>, success: string) => Promise<void>;
  api: NonNullable<Window['electronAPI']>['recon'] & {}; onImported: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(job.selectedDomains ?? []);
  const [query, setQuery] = useState('');
  const [raw, setRaw] = useState<string | null>(null);
  const shown = job.domains.filter(domain => domain.includes(query.trim().toLowerCase()));
  const lockedSelection = Boolean(job.selectedDomains);
  return <details className="recon-job" open={['queued', 'running', 'succeeded'].includes(job.status)}>
    <summary><span className="recon-domain">{job.target}</span><span className={`recon-job-status status-${job.status}`}>{statusNames[job.status]}</span><span className="recon-muted">{job.domains.length} {job.domains.length === 1 ? 'lead' : 'leads'}</span></summary>
    <div className="recon-job-body">
      <p className="recon-muted">{profileNames[job.operation]} · <time dateTime={job.createdAt}>{dateLabel(job.createdAt)}</time></p>
      {job.synthetic && <p className="recon-warning">Synthetic test data. These are not real findings.</p>}
      {job.operation === 'assistant_proposal' && <p className="recon-warning">Unverified assistant proposal. No independent collection was performed.</p>}
      {job.error && <p className="recon-error">{job.error}</p>}
      {['queued', 'running'].includes(job.status) && <button disabled={busy} onClick={() => void perform(() => api.cancelJob(job.caseId, job.id), 'Cancellation requested. No findings were imported.')}>Cancel collection</button>}
      {job.rawHash && <details className="recon-evidence"><summary>Evidence and provenance</summary><dl><dt>Recorded</dt><dd>{job.collectedAt ? dateLabel(job.collectedAt) : 'Not reported'}</dd><dt>Collector</dt><dd>{job.toolVersion}</dd>{job.sourceUrl && <><dt>Source</dt><dd><a href={job.sourceUrl} target="_blank" rel="noreferrer">crt.sh certificate index</a></dd></>}<dt>SHA-256</dt><dd className="recon-domain">{job.rawHash}</dd></dl>
        <button disabled={busy} onClick={() => void perform(async () => { const evidence = await api.readArtifact(job.caseId, job.id); setRaw(evidence.raw); }, 'Raw evidence matches its recorded SHA-256.')}>Review raw evidence</button>
        {raw !== null && <><p className="recon-muted">{raw.length > 200000 ? 'Preview limited to the first 200,000 characters. The full artifact is retained in the case.' : 'Retained raw evidence. Treat its content as untrusted.'}</p><pre role="region" tabIndex={0} aria-label="Raw evidence">{raw.slice(0, 200000)}</pre></>}
      </details>}
      {job.status === 'succeeded' && (job.domains.length ? <fieldset disabled={busy}><legend>Select candidate domains to import</legend><p className="recon-muted">These leads do not establish ownership or current DNS resolution.</p>
        {lockedSelection && <p className="recon-warning">This import was interrupted. Retry with the saved selection.</p>}
        <label>Filter domains<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a hostname" /></label>
        <div className="recon-selection-tools"><span>{selected.length} selected · {shown.length} shown</span><button disabled={lockedSelection || !shown.length} onClick={() => setSelected(previous => [...new Set([...previous, ...shown])])}>Select shown</button><button disabled={lockedSelection || !selected.length} onClick={() => setSelected([])}>Clear selection</button></div>
        <div className="recon-domains">{shown.length ? shown.map(domain => <label key={domain}><input type="checkbox" disabled={lockedSelection} checked={selected.includes(domain)} onChange={e => setSelected(previous => e.target.checked ? [...previous, domain] : previous.filter(item => item !== domain))} /><span className="recon-domain">{domain}</span></label>) : <p>No domains match this filter.</p>}</div>
        <button className="recon-primary" disabled={!selected.length} onClick={() => void perform(async () => { await api.acceptJob(job.caseId, job.id, selected); await onImported(); }, 'Selected candidates imported with their evidence.')}>{lockedSelection ? 'Retry selected import' : `Import ${selected.length || ''} selected ${selected.length === 1 ? 'candidate' : 'candidates'}`}</button>
      </fieldset> : <p>No domain leads were returned. Try a different in-scope domain or review the raw response.</p>)}
      {job.status === 'imported' && <p>{job.selectedDomains?.length ?? 0} selected candidates imported with a source record.</p>}
    </div>
  </details>;
}

export function ReconPanel({ caseId, caseName, initialSection = 'collect', onClose, onImported }: { caseId: string; caseName?: string; initialSection?: Section; onClose: () => void; onImported: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const api = window.electronAPI?.recon;
  const alive = useRef(true);
  const inFlight = useRef(false);
  const [section, setSection] = useState<Section>(initialSection);
  const [saved, setSaved] = useState<ReconConfig | null>(null);
  const [mode, setMode] = useState<ReconConfig['mode']>('local');
  const [scope, setScope] = useState('');
  const [host, setHost] = useState('');
  const [user, setUser] = useState('');
  const [remote, setRemote] = useState('/opt/trace/dist-mcp/mcp/kali-server.js');
  const [target, setTarget] = useState('');
  const [operation, setOperation] = useState<'certificate_transparency' | 'theharvester_crtsh'>('certificate_transparency');
  const [health, setHealth] = useState<RunnerHealth | null>(null);
  const [jobs, setJobs] = useState<ReconJob[]>([]);
  const [proposals, setProposals] = useState<ReconProposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'status', text: 'Loading case settings…' });
  const [refreshError, setRefreshError] = useState('');
  const [configText, setConfigText] = useState('');
  const draft = { mode, scope: scope.split(/[\s,]+/).filter(Boolean), ...(mode === 'ssh' ? { sshHost: host, sshUser: user, remoteServer: remote } : {}) };
  const parsedDraft = reconConfigSchema.safeParse(draft);
  const dirty = !saved || !parsedDraft.success || JSON.stringify(parsedDraft.data) !== JSON.stringify(saved);
  const ready = Boolean(saved && health && !dirty);
  const pendingProposals = proposals.filter(proposal => !jobs.some(job => job.id === `proposal-${proposal.id}`));

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const [nextJobs, nextProposals] = await Promise.all([api.listJobs(caseId), api.listProposals(caseId)]);
      if (alive.current) { setJobs(nextJobs); setProposals(nextProposals); setRefreshError(''); }
    } catch (error) { if (alive.current) setRefreshError(errorText(error)); }
  }, [api, caseId]);

  useEffect(() => {
    alive.current = true;
    const prior = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { alive.current = false; prior?.focus(); };
  }, []);

  useEffect(() => {
    if (!api) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    void api.getConfig().then(config => {
      if (stopped) return;
      setSaved(config);
      if (config) { setMode(config.mode); setScope(config.scope.join('\n')); setHost(config.sshHost ?? ''); setUser(config.sshUser ?? ''); setRemote(config.remoteServer ?? '/opt/trace/dist-mcp/mcp/kali-server.js'); setTarget(config.scope[0]); }
      else setSection('connection');
      setFeedback({ kind: 'status', text: config ? 'Check the saved connection before collecting domains.' : 'Add allowed domains to set up your first collection.' });
    }).catch(error => { if (!stopped) { setSection('connection'); setFeedback({ kind: 'error', text: errorText(error) }); } }).finally(() => { if (!stopped) setLoaded(true); });
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(() => void poll(), 1500); };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, refresh]);

  async function perform(work: () => Promise<void>, success: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFeedback({ kind: 'status', text: 'Working…' });
    try { await work(); await refresh(); if (alive.current) setFeedback({ kind: 'status', text: success }); }
    catch (error) { await refresh(); if (alive.current) setFeedback({ kind: 'error', text: errorText(error) }); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }

  function changeSection(next: Section) { setSection(next); }
  function checkConnection() {
    if (!api) return;
    setHealth(null);
    void perform(async () => {
      const result = runnerHealthSchema.parse(await api.health());
      if (saved && JSON.stringify([...result.scope].sort()) !== JSON.stringify([...saved.scope].sort())) throw new Error('Runner scope differs from saved settings. Review the connection before collecting.');
      if (saved?.mode === 'ssh' && !result.kali) throw new Error('The SSH host did not identify as Kali. Check the host and runner installation.');
      setHealth(result);
      if (!result.operations.includes(operation)) setOperation('certificate_transparency');
    }, 'Connection checked. Available collection profiles are shown below.');
  }

  return <dialog ref={dialog} aria-labelledby="recon-title" aria-describedby="recon-description" onCancel={onClose} className="recon-dialog">
    <header className="recon-header"><div><h2 id="recon-title">Recon & MCP</h2><p className="recon-muted recon-case">{caseName ?? caseId}</p></div><button onClick={onClose}>Close</button></header>
    <p id="recon-description" className="recon-intro">Collect domain leads, review their evidence, then choose what enters this case.</p>
    {api && <nav className="recon-nav" aria-label="Recon sections">{([['collect', 'Collect & review'], ['connection', 'Connection'], ['assistant', 'Assistant access']] as const).map(([value, label]) => <button key={value} aria-pressed={section === value} onClick={() => changeSection(value)}>{label}{value === 'assistant' && pendingProposals.length > 0 ? ` (${pendingProposals.length})` : ''}</button>)}</nav>}
    <div className="recon-body" aria-busy={Boolean(api) && (busy || !loaded)}>
      {!api ? <section><h3>Open Trace desktop to collect domains</h3><p>The browser edition cannot launch a local runner or connect over SSH. Your existing browser cases remain available.</p></section> : !loaded ? <p>Loading connection and case records…</p> : <>
        {refreshError && <div className="recon-notice"><p role="alert">Could not refresh case records: {refreshError}</p><button disabled={busy} onClick={() => void refresh()}>Retry refresh</button></div>}
        {section === 'connection' && <section className="recon-connection"><h3>Runner connection</h3><p className="recon-muted">These settings apply to this desktop profile. Each collection stays in the case where you start it.</p>
          <form onSubmit={event => { event.preventDefault(); void perform(async () => {
            const result = reconConfigSchema.safeParse(draft);
            if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('. '));
            const config = await api.saveConfig(result.data); setSaved(config); setHealth(null); setConfigText(''); if (!target) setTarget(config.scope[0]);
          }, 'Connection saved. Check it before collecting. Changed settings cancel previous queued work.'); }}>
            <fieldset disabled={busy}><label htmlFor="recon-runner">Runner</label><select id="recon-runner" value={mode} onChange={event => setMode(event.target.value as ReconConfig['mode'])}><option value="local">Local passive runner</option><option value="ssh">Kali over SSH</option></select>
              <label>Allowed root domains, one per line<textarea rows={3} value={scope} onChange={event => setScope(event.target.value)} placeholder="example.com" aria-describedby="recon-scope-help" /></label><p id="recon-scope-help" className="recon-muted">Use hostnames, without https:// or paths. Subdomains of these roots are also allowed.</p>
              {mode === 'ssh' && <div className="recon-ssh-fields"><label>SSH host or alias<input value={host} onChange={event => setHost(event.target.value)} autoComplete="off" /></label><label>SSH username<input value={user} onChange={event => setUser(event.target.value)} autoComplete="off" /></label><label className="recon-span">Absolute compiled runner path on Kali<input value={remote} onChange={event => setRemote(event.target.value)} spellCheck={false} /></label><p className="recon-muted recon-span">Uses SSH keys and a verified known-hosts entry. Trace does not request passwords or private keys.</p></div>}
              <div className="recon-actions"><button className="recon-primary" type="submit" disabled={!dirty}>Save connection</button><button type="button" disabled={!saved || dirty} onClick={checkConnection}>Check connection</button><span className="recon-muted">{dirty ? 'Unsaved changes' : 'Saved settings'}</span></div>
            </fieldset>
          </form>
          {health && <div className="recon-notice"><h4>Connection available</h4><p>{health.kali ? 'Kali Linux' : health.platform === 'darwin' ? 'macOS' : health.platform} · {health.operations.map(item => profileNames[item]).join(', ')}</p>{health.synthetic && <p className="recon-warning">Synthetic test runner. Results will be labelled as test data.</p>}<button onClick={() => changeSection('collect')}>Continue to collection</button></div>}
        </section>}
        {section === 'collect' && <>
          <div className="recon-collect-layout"><section><h3>Collect domain leads</h3>
            <form onSubmit={event => { event.preventDefault(); void perform(async () => {
              if (!ready || !saved || !health?.operations.includes(operation)) throw new Error('Save and check the connection before collecting.');
              const parsedTarget = domainSchema.safeParse(target);
              if (!parsedTarget.success) throw new Error(parsedTarget.error.issues[0].message);
              const domain = parsedTarget.data; if (!withinScope(domain, saved.scope)) throw new Error('Choose a target inside the saved allowed domains.');
              await api.startJob({ caseId, target: domain, operation });
            }, 'Collection queued. Review the results below before importing.'); }}>
              <fieldset disabled={busy}><label>Target domain<input required value={target} onChange={event => setTarget(event.target.value)} placeholder="example.com" spellCheck={false} autoCapitalize="none" /></label>
                <label htmlFor="recon-profile">Collection profile</label><select id="recon-profile" value={operation} onChange={event => setOperation(event.target.value as typeof operation)}><option value="certificate_transparency">Certificate index (crt.sh)</option><option disabled={!ready || !health?.operations.includes('theharvester_crtsh')} value="theharvester_crtsh">theHarvester · crtsh{!ready || !health?.operations.includes('theharvester_crtsh') ? ' (requires a supported Kali runner)' : ''}</option></select>
                <button className="recon-primary" type="submit" disabled={!ready}>Run passive collection</button>
              </fieldset>
            </form><p className="recon-muted">Requests public certificate records from crt.sh. It does not scan the target host.</p>
          </section><aside className="recon-scope"><h4>{health && !dirty ? 'Connection checked' : 'Connection needs attention'}</h4><p>{saved?.mode === 'ssh' ? `Kali SSH · ${saved.sshHost}` : saved ? 'Local passive runner' : 'No connection saved'}</p>{saved && <><p className="recon-muted">Allowed domains</p><ul>{saved.scope.map(domain => <li className="recon-domain" key={domain}>{domain}</li>)}</ul></>}
            {dirty && <p className="recon-warning">{saved ? 'Save your connection changes before collecting.' : 'Set up a runner and allowed domains first.'}</p>}
            <div className="recon-actions">{saved && !dirty && <button disabled={busy} onClick={checkConnection}>{health ? 'Recheck connection' : 'Check connection'}</button>}<button onClick={() => changeSection('connection')}>{saved ? 'Edit connection' : 'Set up connection'}</button></div>
          </aside></div>
          <section className="recon-ledger"><div className="recon-section-heading"><h3>Jobs and evidence review</h3><span className="recon-muted">{jobs.filter(job => job.status === 'succeeded').length} awaiting review</span></div>
            {!jobs.length ? <div className="recon-empty"><p>No collections in this case yet.</p><p className="recon-muted">Run a collection above. Results will appear here for review before they enter the graph.</p></div> : jobs.map(job => <JobReview key={job.id} job={job} busy={busy} perform={perform} api={api} onImported={onImported} />)}
          </section>
        </>}
        {section === 'assistant' && <>
          <section><h3>Give an assistant access to this case</h3><p>The case server can read this case and submit unverified proposals. It cannot run collections or write directly to the graph.</p><p className="recon-muted">Paste this configuration into your MCP client. It contains this case ID and a snapshot of the saved allowed domains.</p><button disabled={busy || !saved || dirty} onClick={() => void perform(async () => setConfigText(JSON.stringify(await api.caseMcpConfig(caseId), null, 2)), 'Case-specific MCP configuration generated.')}>Show this case’s MCP configuration</button>{(!saved || dirty) && <p className="recon-warning">Save the connection and allowed domains first.</p>}
            {configText && <><pre role="region" tabIndex={0} aria-label="Case MCP configuration">{configText}</pre><button disabled={busy} onClick={() => void perform(() => navigator.clipboard.writeText(configText), 'MCP configuration copied.')}>Copy configuration</button></>}
          </section>
          <section className="recon-ledger"><h3>Assistant proposals</h3>{!pendingProposals.length ? <p className="recon-empty">No new proposals. Staged proposals appear in Collect & review.</p> : pendingProposals.map(proposal => <article key={proposal.id} className="recon-proposal"><h4 className="recon-domain">{proposal.target}</h4><p className="recon-warning">Unverified proposal · {proposal.domains.length} domains</p><p className="recon-proposal-summary">{proposal.summary}</p><button disabled={busy} onClick={() => void perform(async () => { await api.stageProposal(caseId, proposal.id); changeSection('collect'); }, 'Proposal ready for domain selection. The graph is unchanged.')}>Review proposed domains</button></article>)}</section>
        </>}
      </>}
    </div>
    {api && <footer className="recon-footer"><p role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind === 'error' ? 'recon-error' : ''}>{feedback.kind === 'error' ? `Could not complete action: ${feedback.text}` : feedback.text}</p></footer>}
  </dialog>;
}
