import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Text from the agents: Markdown, with tables. Answers written without the model use
 * "•" bullets, which become a list too. Links open in a new tab; raw HTML is not rendered.
 */
export const Markdown: React.FC<{ children: string; className?: string }> = ({ children, className = "" }) => (
  <div className={`markdown-body ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline font-bold" style={{ color: "var(--accent)" }}>{label}</a>
        ),
        table: ({ children: rows }) => <div className="overflow-x-auto"><table>{rows}</table></div>,
      }}
    >
      {children.replace(/^• /gm, "- ")}
    </ReactMarkdown>
  </div>
);
