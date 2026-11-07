import React, { useState, useEffect } from 'react';
import { useEscapeKey } from '@/components/common/Dialog';
import { QuickSource, Entity } from '@/types';
import { safeUrlPathname } from '@/utils/url';
import {
  Send,
  X,
  Play,
  Copy,
  Check,
  Link2,
  FileText,
  Tag,
  AlertCircle,
  Clock,
  ScanSearch,
  Code,
  Globe,
  Settings,
  ChevronDown,
} from 'lucide-react';

interface ApiQuickSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  quickSource: QuickSource | null;
  onUpdateQuickSource?: (qs: QuickSource) => void;
  entities: Entity[];
  onAttachSourceToEntity?: (entityId: string, sourceTitle: string, url: string, content: string) => Promise<void> | void;
  onAddEntityAttribute?: (entityId: string, key: string, value: any) => Promise<void> | void;
  onCreateNoteOnEntity?: (entityId: string, title: string, content: string) => Promise<void> | void;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const ApiQuickSourceModal: React.FC<ApiQuickSourceModalProps> = ({
  isOpen,
  onClose,
  quickSource,
  onUpdateQuickSource,
  entities,
  onAttachSourceToEntity,
  onAddEntityAttribute,
  onCreateNoteOnEntity,
}) => {
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  const [url, setUrl] = useState<string>('');
  const [headers, setHeaders] = useState<string>('{\n  "Accept": "application/json"\n}');
  const [body, setBody] = useState<string>('{\n  \n}');
  const [activeRequestTab, setActiveRequestTab] = useState<'body' | 'headers'>('body');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<{
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
    error?: string;
    durationMs?: number;
  } | null>(null);

  // Linking state
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [linkMode, setLinkMode] = useState<'source' | 'note' | 'attribute'>('source');
  const [attributeKey, setAttributeKey] = useState<string>('api_data');
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync state when modal opens or quickSource changes
  useEffect(() => {
    if (quickSource) {
      setMethod((quickSource.method as any) || 'GET');
      setUrl(quickSource.url || '');
      if (quickSource.headers) {
        if (typeof quickSource.headers === 'string') {
          setHeaders(quickSource.headers);
        } else {
          setHeaders(JSON.stringify(quickSource.headers, null, 2));
        }
      } else {
        setHeaders('{\n  "Accept": "application/json"\n}');
      }
      setBody(quickSource.body || '{\n  \n}');
      if (quickSource.lastResponse) {
        setResponse(quickSource.lastResponse);
      } else {
        setResponse(null);
      }
      setLinkSuccess(null);
      if (entities.length > 0 && !selectedEntityId) {
        setSelectedEntityId(entities[0].id);
      }
    }
  }, [quickSource, isOpen, entities]);

  useEscapeKey(isOpen, onClose);
  if (!isOpen || !quickSource) return null;

  const handleSendRequest = async () => {
    if (!url.trim()) return;
    setIsLoading(true);
    setResponse(null);
    setLinkSuccess(null);

    let parsedHeaders: Record<string, string> = {};
    try {
      if (headers.trim()) {
        parsedHeaders = JSON.parse(headers);
      }
    } catch {
      // If not valid JSON, parse line-by-line Key: Value
      headers.split('\n').forEach((line) => {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (k) parsedHeaders[k] = v;
        }
      });
    }

    try {
      const electronAPI = (window as any).electronAPI;
      let resData: any = null;

      if (electronAPI?.sendApiRequest) {
        // Native Electron fetch (bypasses CORS completely)
        resData = await electronAPI.sendApiRequest({
          url: url.trim(),
          method,
          headers: parsedHeaders,
          body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? body : undefined,
        });
      } else {
        // Fallback for browser
        const startTime = Date.now();
        const res = await fetch(url.trim(), {
          method,
          headers: parsedHeaders,
          body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? body : undefined,
        });

        let data: any;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          try {
            data = await res.json();
          } catch {
            data = await res.text();
          }
        } else {
          data = await res.text();
        }

        const headObj: Record<string, string> = {};
        res.headers.forEach((val, k) => {
          headObj[k] = val;
        });

        resData = {
          success: res.ok,
          status: res.status,
          statusText: res.statusText,
          headers: headObj,
          data,
          durationMs: Date.now() - startTime,
        };
      }

      setResponse(resData);

      // Persist configuration back to quick source
      if (onUpdateQuickSource) {
        onUpdateQuickSource({
          ...quickSource,
          url: url.trim(),
          method,
          headers: parsedHeaders,
          body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? body : undefined,
          lastResponse: {
            status: resData.status,
            statusText: resData.statusText,
            data: resData.data,
            durationMs: resData.durationMs,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err: any) {
      setResponse({
        error: err.message || 'Request execution failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkToEntity = async () => {
    if (!selectedEntityId || !response?.data) return;
    const targetEntity = entities.find((e) => e.id === selectedEntityId);
    if (!targetEntity) return;

    const dataString =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data, null, 2);

    try {
      if (linkMode === 'source' && onAttachSourceToEntity) {
        const sourceTitle = `${quickSource.title}: ${method} ${safeUrlPathname(url)}`;
        await onAttachSourceToEntity(
          targetEntity.id,
          sourceTitle,
          url,
          `### API Request: ${method} ${url}\n\n**Status:** ${response.status} ${response.statusText || ''}\n\n\`\`\`json\n${dataString}\n\`\`\``
        );
        setLinkSuccess(`Linked as source to "${targetEntity.name}"`);
      } else if (linkMode === 'note' && onCreateNoteOnEntity) {
        await onCreateNoteOnEntity(
          targetEntity.id,
          `API: ${quickSource.title} Result`,
          `# ${quickSource.title} API Response\n\n- **Endpoint:** \`${method} ${url}\`\n- **Status:** \`${response.status} ${response.statusText || ''}\`\n- **Date:** ${new Date().toLocaleString()}\n\n\`\`\`json\n${dataString}\n\`\`\``
        );
        setLinkSuccess(`Created note on "${targetEntity.name}"`);
      } else if (linkMode === 'attribute' && onAddEntityAttribute) {
        await onAddEntityAttribute(targetEntity.id, attributeKey.trim() || 'api_data', response.data);
        setLinkSuccess(`Saved attribute "${attributeKey}" on "${targetEntity.name}"`);
      }
      setTimeout(() => setLinkSuccess(null), 3500);
    } catch (err: any) {
      alert(`Failed to link: ${err.message}`);
    }
  };

  const handleCopy = () => {
    if (!response?.data) return;
    const text =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatJsonBody = () => {
    try {
      const parsed = JSON.parse(body);
      setBody(JSON.stringify(parsed, null, 2));
    } catch {}
  };

  const isMethodWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
      <div className="bg-[var(--t-raised)] border border-obsidian-border rounded max-w-3xl w-full shadow-popover flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-obsidian-border bg-[var(--t-panel)]">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white truncate">{quickSource.title}</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  API Endpoint
                </span>
              </div>
              <p className="text-[11px] text-obsidian-muted truncate">
                Send live HTTP requests and link response data to investigation entities.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-obsidian-dim hover:text-white rounded-lg hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* URL Bar & Method Selector */}
        <div className="p-4 border-b border-obsidian-border bg-[var(--t-raised)] space-y-3">
          <div className="flex items-center space-x-2">
            {/* Method Select */}
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className={`px-3 py-2 rounded text-xs font-bold font-mono tracking-wider border cursor-pointer focus:outline-none transition-colors ${
                method === 'GET'
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                  : method === 'POST'
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                  : method === 'PUT'
                  ? 'bg-amber-600/20 text-amber-300 border-amber-500/40'
                  : method === 'PATCH'
                  ? 'bg-orange-600/20 text-orange-300 border-orange-500/40'
                  : 'bg-rose-600/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m} className="bg-[var(--t-raised)] text-white">
                  {m}
                </option>
              ))}
            </select>

            {/* URL Input */}
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/v1/lookup?ip=..."
              className="flex-1 px-3 py-2 bg-[var(--t-bg)] border border-obsidian-border rounded text-xs font-mono text-white placeholder:text-obsidian-dim focus:outline-none focus:border-[var(--t-accent)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSendRequest();
                }
              }}
            />

            {/* Send Button */}
            <button
              type="button"
              disabled={isLoading || !url.trim()}
              onClick={handleSendRequest}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded flex items-center space-x-1.5 shadow-md transition-colors disabled:opacity-50 shrink-0"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{isLoading ? 'Sending...' : 'Send'}</span>
            </button>
          </div>

          {/* Request Config Tabs */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center space-x-2">
              {isMethodWithBody && (
                <button
                  type="button"
                  onClick={() => setActiveRequestTab('body')}
                  className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                    activeRequestTab === 'body'
                      ? 'bg-white/10 text-white'
                      : 'text-obsidian-dim hover:text-white'
                  }`}
                >
                  Request Body
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveRequestTab('headers')}
                className={`px-2.5 py-1 rounded-lg transition-colors font-medium ${
                  activeRequestTab === 'headers'
                    ? 'bg-white/10 text-white'
                    : 'text-obsidian-dim hover:text-white'
                }`}
              >
                Headers
              </button>
            </div>

            {isMethodWithBody && activeRequestTab === 'body' && (
              <button
                type="button"
                onClick={formatJsonBody}
                className="text-[11px] text-amber-400/80 hover:text-amber-300 flex items-center space-x-1"
                title="Format JSON"
              >
                <Code className="w-3 h-3" />
                <span>Format JSON</span>
              </button>
            )}
          </div>

          {/* Body Editor or Headers Editor */}
          {isMethodWithBody && activeRequestTab === 'body' && (
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Request body (JSON or raw text)..."
              className="w-full p-2.5 bg-[var(--t-bg)] border border-obsidian-border rounded text-xs font-mono text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/60 leading-relaxed resize-y"
            />
          )}

          {activeRequestTab === 'headers' && (
            <textarea
              rows={4}
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder={`{\n  "Authorization": "Bearer token...",\n  "Content-Type": "application/json"\n}`}
              className="w-full p-2.5 bg-[var(--t-bg)] border border-obsidian-border rounded text-xs font-mono text-zinc-200 focus:outline-none focus:border-[var(--t-accent)]/60 leading-relaxed resize-y"
            />
          )}
        </div>

        {/* Response & Linking Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {response ? (
            <div className="space-y-3">
              {/* Status Header */}
              <div className="flex items-center justify-between bg-[var(--t-panel)] px-3 py-2 rounded border border-obsidian-border">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-obsidian-dim font-medium">Status:</span>
                  {response.status ? (
                    <span
                      className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                        response.status >= 200 && response.status < 300
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : response.status >= 400 && response.status < 500
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {response.status} {response.statusText}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-rose-400">Request Error</span>
                  )}

                  {response.durationMs !== undefined && (
                    <span className="text-[11px] text-obsidian-dim flex items-center space-x-1 pl-2 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{response.durationMs}ms</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs text-obsidian-dim hover:text-white px-2 py-1 rounded bg-[var(--t-hover)] flex items-center space-x-1 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 opacity-70" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Response'}</span>
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {response.error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{response.error}</span>
                </div>
              )}

              {/* Response Body Box */}
              {response.data !== undefined && (
                <div className="bg-[var(--t-bg)] border border-obsidian-border rounded p-3 font-mono text-xs overflow-x-auto max-h-64 text-zinc-300 scrollbar-thin">
                  <pre className="whitespace-pre-wrap break-all">
                    {typeof response.data === 'string'
                      ? response.data
                      : JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>
              )}

              {/* Link to Entity Panel */}
              {response.data && (
                <div className="p-3.5 rounded bg-purple-950/20 border border-purple-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-xs font-semibold text-purple-300">
                      <Link2 className="w-4 h-4" />
                      <span>Link Result to Entity (Повʼязати результат із сутністю)</span>
                    </div>
                    {linkSuccess && (
                      <span className="text-[11px] text-emerald-300 font-medium flex items-center space-x-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{linkSuccess}</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {/* Entity Select */}
                    <div className="col-span-1 md:col-span-1">
                      <label className="block text-[11px] text-zinc-500 mb-1">Target Entity</label>
                      <select
                        value={selectedEntityId}
                        onChange={(e) => setSelectedEntityId(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-xs text-white focus:outline-none focus:border-[var(--t-accent)]"
                      >
                        {entities.map((ent) => (
                          <option key={ent.id} value={ent.id}>
                            {ent.name} ({ent.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mode Select */}
                    <div className="col-span-1 md:col-span-1">
                      <label className="block text-[11px] text-zinc-500 mb-1">Action</label>
                      <select
                        value={linkMode}
                        onChange={(e) => setLinkMode(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-xs text-white focus:outline-none focus:border-[var(--t-accent)]"
                      >
                        <option value="source">Attach as Project Source</option>
                        <option value="note">Save as Investigation Note</option>
                        <option value="attribute">Set Entity Attribute</option>
                      </select>
                    </div>

                    {/* Action Button */}
                    <div className="col-span-1 md:col-span-1 flex items-end">
                      {linkMode === 'attribute' ? (
                        <div className="flex space-x-1.5 w-full">
                          <input
                            type="text"
                            value={attributeKey}
                            onChange={(e) => setAttributeKey(e.target.value)}
                            placeholder="attribute_key"
                            className="w-1/2 px-2 py-1.5 bg-[var(--t-panel)] border border-obsidian-border rounded-lg text-xs text-white font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleLinkToEntity}
                            disabled={!selectedEntityId}
                            className="w-1/2 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-lg transition-colors"
                          >
                            Save Attr
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleLinkToEntity}
                          disabled={!selectedEntityId}
                          className="w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-lg flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Link to Entity</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-14 text-center space-y-2">
              <Globe className="w-8 h-8 text-obsidian-dim mx-auto stroke-1" />
              <div className="text-xs font-medium text-obsidian-muted">Ready to execute API request</div>
              <p className="text-[11px] text-obsidian-dim max-w-sm mx-auto">
                Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">Send</kbd> or{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">⌘+Enter</kbd> to dispatch the request. Response results can be linked to any entity in your project.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-obsidian-border bg-[var(--t-panel)] flex items-center justify-between text-xs">
          <span className="text-obsidian-dim text-[11px]">
            API Endpoint: <strong className="text-zinc-300 font-mono">{quickSource.title}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-obsidian-hover hover:bg-[var(--t-hover)] text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
