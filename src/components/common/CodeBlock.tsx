import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Tiny syntax highlighter for the snippets TRACE shows (JSON configs and shell
 * commands). No dependency; output is plain tokens so it is trivially testable.
 */
export type TokenKind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'command' | 'flag' | 'env' | 'path' | 'plain';
export interface Token {
  kind: TokenKind;
  text: string;
}

export function tokenizeJson(src: string): Token[] {
  const out: Token[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out.push({ kind: 'key', text: m[1] }, { kind: 'punct', text: m[2] });
      } else out.push({ kind: 'string', text: m[1] });
    } else if (m[3] !== undefined) out.push({ kind: 'number', text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'literal', text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: 'punct', text: m[5] });
    else out.push({ kind: 'plain', text: m[0] });
  }
  return out;
}

export function tokenizeShell(src: string): Token[] {
  const out: Token[] = [];
  const re = /("(?:\\.|[^"\\])*"|'[^']*')|(\s+)|(--?[A-Za-z][\w-]*(?:=\S*)?)|([A-Za-z_][A-Za-z0-9_]*=)|(\S+)/g;
  let expectCommand = true;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[2] !== undefined) {
      out.push({ kind: 'plain', text: m[2] });
      if (m[2].includes('\n')) expectCommand = true;
    } else if (m[1] !== undefined) {
      out.push({ kind: /^["']?(\/|~|[A-Za-z]:\\)/.test(m[1]) ? 'path' : 'string', text: m[1] });
      expectCommand = false;
    } else if (m[3] !== undefined) {
      out.push({ kind: 'flag', text: m[3] });
      expectCommand = false;
    } else if (m[4] !== undefined) {
      out.push({ kind: 'env', text: m[4] });
    } else {
      const t = m[5];
      if (t === '--' || t === '|' || t === '&&') {
        out.push({ kind: 'punct', text: t });
        expectCommand = t !== '--';
      } else if (expectCommand) {
        out.push({ kind: 'command', text: t });
        expectCommand = false;
      } else out.push({ kind: /^(\/|~|[A-Za-z]:\\)/.test(t) ? 'path' : 'plain', text: t });
    }
  }
  return out;
}

const COLOR: Record<TokenKind, string> = {
  key: 'text-[#7fb7b0]',
  string: 'text-[#d9b98a]',
  number: 'text-[#b5a2d4]',
  literal: 'text-[#d98f8f]',
  punct: 'text-zinc-500',
  command: 'text-[#8fb5e6] font-semibold',
  flag: 'text-[#7fb7b0]',
  env: 'text-[#b5a2d4]',
  path: 'text-[#d9b98a]',
  plain: 'text-zinc-300',
};

export const CodeBlock: React.FC<{ label?: string; text: string; lang: 'json' | 'shell' }> = ({ label, text, lang }) => {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => (lang === 'json' ? tokenizeJson(text) : tokenizeShell(text)), [text, lang]);
  const copy = () =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div>
      <div className="flex items-center mb-1">
        {label && <span className="t-label">{label}</span>}
        <div className="flex-1" />
        <button type="button" className="t-btn !h-[22px]" onClick={copy}>
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="rounded-[3px] border border-[var(--t-border)] bg-[#0c0c0e] px-2.5 py-2 font-mono text-[11px] overflow-x-auto select-text whitespace-pre">
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={COLOR[t.kind]}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
};
