import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** GitHub release notes rendered as Markdown in the app's dense style. Links open externally. */
export const ReleaseNotes: React.FC<{ markdown: string; className?: string }> = ({ markdown, className = '' }) => (
  <div
    className={`text-zinc-300 text-[11.5px] leading-relaxed select-text break-words [&_h1]:text-[12.5px] [&_h2]:text-[12px] [&_h3]:text-[11.5px] [&_h1,&_h2,&_h3]:font-semibold [&_h1,&_h2,&_h3]:text-zinc-100 [&_h1,&_h2,&_h3]:mt-2 [&_h1,&_h2,&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_a]:text-[var(--t-accent)] [&_a]:underline-offset-2 hover:[&_a]:underline [&_code]:font-mono [&_code]:text-[10.5px] [&_code]:bg-[var(--t-raised)] [&_code]:px-1 [&_code]:rounded-[2px] [&_hr]:border-[var(--t-border)] [&_hr]:my-2 [&_img]:max-w-full ${className}`}
  >
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  </div>
);
