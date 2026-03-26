import type { ReactNode } from 'react';

export function render_dialogue_markdown(source: string): ReactNode[] {
  return split_paragraphs(source).map((paragraph, index) => (
    <span key={`paragraph:${index}`} className="speech-bubble__paragraph">
      {render_paragraph(paragraph)}
    </span>
  ));
}

function render_paragraph(paragraph: string) {
  const lines = paragraph.split('\n');

  return lines.flatMap((line, line_index) => {
    const rendered_line = render_inline(line);

    if (line_index === lines.length - 1) {
      return rendered_line;
    }

    return [...rendered_line, <br key={`break:${line_index}`} />];
  });
}

function render_inline(source: string, key_prefix = 'inline'): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let text_index = 0;

  while (cursor < source.length) {
    const token = find_next_token(source, cursor);

    if (!token) {
      push_text(nodes, source.slice(cursor), `${key_prefix}:text:${text_index}`);
      break;
    }

    if (token.index > cursor) {
      push_text(nodes, source.slice(cursor, token.index), `${key_prefix}:text:${text_index}`);
      text_index += 1;
    }

    const closing_index = source.indexOf(token.marker, token.index + token.marker.length);
    if (closing_index === -1) {
      push_text(nodes, source.slice(token.index, token.index + token.marker.length), `${key_prefix}:text:${text_index}`);
      text_index += 1;
      cursor = token.index + token.marker.length;
      continue;
    }

    const inner = source.slice(token.index + token.marker.length, closing_index);
    const children = render_inline(inner, `${key_prefix}:${token.marker}:${token.index}`);
    const element_key = `${key_prefix}:node:${token.index}`;

    switch (token.marker) {
      case '**':
        nodes.push(<strong key={element_key}>{children}</strong>);
        break;
      case '*':
        nodes.push(<em key={element_key}>{children}</em>);
        break;
      case '`':
        nodes.push(<code key={element_key}>{inner}</code>);
        break;
      default:
        push_text(nodes, source.slice(token.index, closing_index + token.marker.length), `${key_prefix}:text:${text_index}`);
        text_index += 1;
        break;
    }

    cursor = closing_index + token.marker.length;
  }

  return nodes;
}

function find_next_token(source: string, start_index: number) {
  const markers = ['**', '*', '`'] as const;
  let best_index = -1;
  let best_marker: string | null = null;

  for (const marker of markers) {
    const index = source.indexOf(marker, start_index);
    if (index === -1) {
      continue;
    }

    if (best_index === -1 || index < best_index || (index === best_index && marker.length > (best_marker?.length ?? 0))) {
      best_index = index;
      best_marker = marker;
    }
  }

  if (best_marker === null) {
    return null;
  }

  return {
    index: best_index,
    marker: best_marker,
  };
}

function split_paragraphs(source: string) {
  return source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function push_text(nodes: ReactNode[], text: string, key: string) {
  if (!text) {
    return;
  }

  nodes.push(<span key={key}>{text}</span>);
}
