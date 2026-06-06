import { Fragment } from "react";

const MARKER = /\[\[(.+?)\]\]/g;

/**
 * Renders the passage, turning [[bracketed]] target words into <mark> spans.
 * Text is rendered as React nodes (never innerHTML), so it is XSS-safe.
 */
export function PassageView({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  MARKER.lastIndex = 0;
  while ((match = MARKER.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    nodes.push(
      <mark key={key++} className="target">
        {match[1]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return <div className="passage-body">{nodes}</div>;
}
