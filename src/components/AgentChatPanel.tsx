import { useEffect, useRef, useState } from 'react';
import type { AgentConversation, AgentProvider, ProviderStatus } from '../services/agent/contracts';
import './recon.css';
import './agent-chat.css';

const providerName = (provider: AgentProvider) => provider === 'codex' ? 'Codex / ChatGPT account' : 'Claude Code account';
function messageError(error: unknown) { return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
export function AgentChatPanel({ caseId, caseName, onClose, onReview, onOpenSource }: { caseId: string; caseName?: string; onClose: () => void; onReview: () => void; onOpenSource: (id: string) => void }) {
  const api = window.electronAPI?.agent;
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const announcedMessage = useRef('');
  const [chats, setChats] = useState<AgentConversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const conversationRef = useRef('');
  useEffect(() => { conversationRef.current = conversationId; }, [conversationId]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [provider, setProvider] = useState<AgentProvider>('codex');
  const [models, setModels] = useState<Record<AgentProvider, string>>({ codex: '', claude: '' });
  const [draft, setDraft] = useState('');
  const [shareCase, setShareCase] = useState(false);
  const [preview, setPreview] = useState<{ text: string; records: number; truncated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading this case’s conversations…');
  const chat = chats.find(item => item.id === conversationId);
  const running = chat?.messages.some(message => message.status === 'running') ?? false;
  const account = providers.find(item => item.provider === provider);
  const disabled = busy || running || !conversationId || !account?.installed || account.account !== 'subscription';
  const lastMessage = chat?.messages.at(-1);
  useEffect(() => {
    if (followTranscript.current) transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' });
  }, [lastMessage?.id, lastMessage?.content, lastMessage?.status]);

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
    const poll = async () => {
      try {
        const id = conversationRef.current;
        if (id) {
          const next = await api.get(caseId, id);
          if (!stopped && conversationRef.current === id) {
            setChats(previous => previous.map(item => item.id === id ? next : item));
            const last = next.messages.at(-1);
            const key = last ? `${last.id}:${last.status}` : '';
            if (last?.role === 'assistant' && last.status !== 'running' && announcedMessage.current !== key) {
              announcedMessage.current = key;
              setStatus(last.status === 'completed' ? `${providerName(last.provider ?? 'codex')} response ready. Check cited evidence before relying on it.` : last.status === 'cancelled' ? 'Response stopped. Completed case activity remains in the conversation.' : 'Response failed. Check its recovery details or choose another account explicitly.');
            }
          }
        }
      }
      catch (error) { if (!stopped) setError(messageError(error)); }
      if (!stopped) timer = setTimeout(() => void poll(), 1000);
    };
    void api.list(caseId).then(async existing => {
      if (stopped) return;
      const first = existing[0] ?? await api.create(caseId);
      if (!stopped) { setChats(existing.length ? existing : [first]); setConversationId(first.id); setStatus('Choose an account, then send a message. Case sharing is off.'); setLoaded(true); }
    }).catch(error => { if (!stopped) { setError(messageError(error)); setLoaded(true); } });
    void poll();
    void api.providers().then(result => { if (!stopped) setProviders(result); }).catch(error => { if (!stopped) setError(messageError(error)); });
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, caseId]);

  async function action(work: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); if (alive.current) setStatus(message); }
    catch (error) { if (alive.current) setError(messageError(error)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function refreshAccounts() {
    if (!api) return; setChecking(true); setError('');
    try { const result = await api.providers(); if (alive.current) { setProviders(result); setStatus('CLI/account checks updated. Availability and usage remain controlled by each provider.'); } }
    catch (error) { if (alive.current) setError(messageError(error)); }
    finally { if (alive.current) setChecking(false); }
  }
  return <dialog ref={dialog} className="recon-dialog agent-chat-dialog" aria-labelledby="agent-title" aria-describedby="agent-description" onCancel={onClose}>
    <header className="recon-header"><div><h2 id="agent-title">Case agent</h2><p className="recon-muted recon-case">{caseName ?? caseId}</p></div><button onClick={onClose}>Close</button></header>
    <p id="agent-description" className="recon-intro">Ask about evidence, compare explanations, or propose domain leads for review.</p>
    {!api ? <div className="recon-body"><p>The case agent requires Trace desktop and a signed-in Codex or Claude Code CLI.</p></div> : <>
      <div className="agent-toolbar">
        <label htmlFor="agent-conversation">Conversation</label><select id="agent-conversation" disabled={busy} value={conversationId} onChange={event => { followTranscript.current = true; setConversationId(event.target.value); setError(''); }}>{chats.map(item => <option key={item.id} value={item.id}>{item.messages.find(message => message.role === 'user')?.content.slice(0, 60) || 'New conversation'}</option>)}</select>
        <button disabled={busy || !loaded} onClick={() => void action(async () => { const next = await api.create(caseId); followTranscript.current = true; setChats(previous => [next, ...previous]); setConversationId(next.id); setDraft(''); setShareCase(false); setPreview(null); }, 'New conversation created. Case sharing is off.')}>New chat</button>
        <details className="agent-accounts"><summary>Accounts & models</summary><div>
          <p className="recon-muted">Trace uses the official CLIs’ existing logins. It does not store passwords or subscription tokens. No provider switch happens automatically.</p>
          {(['codex', 'claude'] as const).map(id => { const item = providers.find(value => value.provider === id); return <section key={id}><h3>{providerName(id)}</h3><p>{item ? item.installed ? item.version || 'Installed' : 'Not installed' : 'Checking CLI…'}</p><p>{item?.detail}</p><p className="recon-muted">Terminal sign-in: <code>{id === 'codex' ? 'codex login' : 'claude auth login'}</code></p></section>; })}
          <label htmlFor="agent-model">Model (optional)</label><input id="agent-model" form="agent-compose" disabled={busy || running} value={models[provider]} onChange={event => setModels(previous => ({ ...previous, [provider]: event.target.value }))} pattern={String.raw`[A-Za-z0-9][A-Za-z0-9_.:\/\-]*`} maxLength={120} placeholder="Provider default" spellCheck={false} />
          <p className="recon-muted">Applies to {providerName(provider)}. Each provider keeps its own model choice.</p>
          <button disabled={checking} onClick={() => void refreshAccounts()}>{checking ? 'Checking accounts…' : 'Refresh account checks'}</button>
        </div></details>
      </div>
      <div className="agent-transcript" ref={transcript} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation messages" tabIndex={0} onScroll={event => { const element = event.currentTarget; followTranscript.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
        {!loaded ? <p>Loading messages…</p> : !chat?.messages.length ? <div className="agent-empty"><h3>Start with a question about this investigation</h3><p>Try “What evidence is missing?” or “Which domain leads need checking?”</p><p className="recon-muted">Turn on case sharing to let the agent read this case. Proposals stay unverified until you review them.</p></div> : chat.messages.map(message => <article key={message.id} className={`agent-message agent-message-${message.role}`}>
          <div className="agent-message-heading"><strong>{message.role === 'user' ? 'You' : providerName(message.provider ?? 'codex')}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></div>
          {message.role === 'assistant' && <p className="recon-muted">{message.model} · {message.includeCase ? 'Case sharing on' : 'Case sharing off'}</p>}
          {message.content && <p className="agent-message-content">{message.content}</p>}
          {message.status === 'running' && <p role="status">Thinking with {providerName(message.provider ?? 'codex')}…</p>}
          {message.error && <p className="recon-error">{message.status === 'cancelled' ? 'Stopped' : 'Response failed'}: {message.error}</p>}
          {message.citations.length > 0 && <div><strong>Referenced case sources</strong><ul>{message.citations.map(id => <li key={id}><button onClick={() => onOpenSource(id)}>Open source: {id}</button></li>)}</ul><p className="recon-muted">References identify provided records. Check the evidence before relying on the answer.</p></div>}
          {message.activity.length > 0 && <details><summary>Case activity ({message.activity.length})</summary><ul>{message.activity.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
          {message.contextHash && <details><summary>Shared context record</summary><p>{message.contextRecords} records in the initial snapshot. The case retains the snapshot, shared history and tool results for this turn.</p><p className="recon-domain">Snapshot SHA-256: {message.contextHash}</p></details>}
          {message.proposalId && <button onClick={onReview}>Review proposed domains in Recon</button>}
        </article>)}
      </div>
      <form id="agent-compose" className="agent-composer" aria-label="Send a case agent message" onSubmit={event => { event.preventDefault(); if (disabled || !draft.trim()) return; followTranscript.current = true; void action(async () => {
        const next = await api.send({ caseId, conversationId, provider, model: models[provider], message: draft, includeCase: shareCase });
        setChats(previous => previous.map(item => item.id === next.id ? next : item)); setDraft('');
        requestAnimationFrame(() => transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'instant' }));
      }, 'Message sent to the selected provider. Stop is available while it responds.'); }}>
        <div className="agent-provider-row"><label htmlFor="agent-provider">Account for this message</label><select id="agent-provider" disabled={busy || running} value={provider} onChange={event => setProvider(event.target.value as AgentProvider)}><option value="codex">Codex / ChatGPT</option><option value="claude">Claude Code</option></select><span className={account?.account === 'api' || account?.account === 'signed_out' ? 'recon-warning' : 'recon-muted'}>{!account ? 'Checking account…' : !account.installed ? 'CLI not installed' : account.account === 'subscription' ? 'Account login detected' : account.account === 'api' ? 'API billing detected' : account.account === 'signed_out' ? 'Sign in in your terminal' : 'Account status unverified'}</span></div>
        <label className="agent-share"><input type="checkbox" checked={shareCase} disabled={busy || running} onChange={event => { setShareCase(event.target.checked); setPreview(null); }} /><span>Share case records and case-assisted history</span></label>
        {shareCase && <details className="agent-context"><summary>Sharing details and preview</summary><p className="recon-muted">Sends a bounded snapshot and enables case-only search/read tools. Switching accounts sends permitted conversation history to the newly selected provider. Case-assisted history is excluded when sharing is off.</p><button type="button" disabled={busy} onClick={() => void action(async () => setPreview(await api.context(caseId)), 'Context preview loaded locally. Nothing was sent to a provider.')}>Preview case context</button>{preview && <details open><summary>{preview.records} records in snapshot{preview.truncated ? ' · content truncated' : ''}</summary><pre role="region" tabIndex={0} aria-label="Case context preview">{preview.text}</pre></details>}</details>}
        <label htmlFor="agent-message">Message</label><textarea id="agent-message" rows={2} maxLength={12000} required value={draft} disabled={busy || running} onChange={event => setDraft(event.target.value)} placeholder="Ask a question about this case…" />
        <div className="recon-actions"><button className="recon-primary" type="submit" disabled={disabled || !draft.trim()}>Send to {provider === 'codex' ? 'Codex' : 'Claude'}</button>{running && <button disabled={busy} type="button" onClick={() => void action(() => api.cancel(caseId, conversationId), 'Stop requested. Completed activity remains in this conversation.')}>Stop response</button>}<span className="recon-muted">Plan limits apply.</span></div>
      </form>
      <footer className="recon-footer"><p role={error ? 'alert' : 'status'} className={error ? 'recon-error' : ''}>{error || status}</p></footer>
    </>}
  </dialog>;
}
