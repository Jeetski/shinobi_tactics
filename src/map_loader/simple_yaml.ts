type Scalar = boolean | number | string | null;
type YamlValue = Scalar | YamlMap | YamlArray;

interface YamlMap {
  [key: string]: YamlValue;
}

interface YamlArray extends Array<YamlValue> {}

type LineState = {
  indent: number;
  text: string;
};

export function parse_simple_yaml(source: string): YamlValue {
  const lines = source
    .split(/\r?\n/)
    .map((line) => normalize_line(line))
    .filter((line): line is LineState => line !== null);

  if (lines.length === 0) {
    return {};
  }

  const [value] = parse_block(lines, 0, lines[0].indent);
  return value;
}

function normalize_line(line: string): LineState | null {
  if (!line.trim()) {
    return null;
  }

  const without_comments = line.trimStart().startsWith('#') ? '' : line;
  if (!without_comments.trim()) {
    return null;
  }

  const indent = without_comments.length - without_comments.trimStart().length;
  return {
    indent,
    text: without_comments.trim(),
  };
}

function parse_block(lines: LineState[], start_index: number, indent: number): [YamlValue, number] {
  const line = lines[start_index];

  if (line.text.startsWith('- ')) {
    return parse_array(lines, start_index, indent);
  }

  return parse_object(lines, start_index, indent);
}

function parse_object(lines: LineState[], start_index: number, indent: number): [YamlMap, number] {
  const result: YamlMap = {};
  let index = start_index;

  while (index < lines.length) {
    const line = lines[index];

    if (line.indent < indent) {
      break;
    }

    if (line.indent > indent) {
      throw new Error(`Unexpected indentation near "${line.text}"`);
    }

    const separator_index = line.text.indexOf(':');
    if (separator_index === -1) {
      throw new Error(`Invalid YAML mapping near "${line.text}"`);
    }

    const key = line.text.slice(0, separator_index).trim();
    const rest = line.text.slice(separator_index + 1).trim();

    if (!rest) {
      const next_line = lines[index + 1];
      if (!next_line || next_line.indent <= indent) {
        result[key] = {};
        index += 1;
        continue;
      }

      const [nested_value, next_index] = parse_block(lines, index + 1, next_line.indent);
      result[key] = nested_value;
      index = next_index;
      continue;
    }

    result[key] = parse_scalar(rest);
    index += 1;
  }

  return [result, index];
}

function parse_array(lines: LineState[], start_index: number, indent: number): [YamlValue[], number] {
  const result: YamlValue[] = [];
  let index = start_index;

  while (index < lines.length) {
    const line = lines[index];

    if (line.indent < indent) {
      break;
    }

    if (line.indent !== indent || !line.text.startsWith('- ')) {
      throw new Error(`Invalid YAML list near "${line.text}"`);
    }

    const rest = line.text.slice(2).trim();

    if (rest.includes(':')) {
      const [inline_object, next_index] = parse_inline_object(lines, index, indent, rest);
      result.push(inline_object);
      index = next_index;
      continue;
    }

    if (!rest) {
      const next_line = lines[index + 1];
      if (!next_line || next_line.indent <= indent) {
        result.push(null);
        index += 1;
        continue;
      }

      const [nested_value, next_index] = parse_block(lines, index + 1, next_line.indent);
      result.push(nested_value);
      index = next_index;
      continue;
    }

    result.push(parse_scalar(rest));
    index += 1;
  }

  return [result, index];
}

function parse_inline_object(
  lines: LineState[],
  start_index: number,
  indent: number,
  first_entry: string,
): [YamlMap, number] {
  const result: YamlMap = {};
  let index = start_index;
  let current_entry = first_entry;

  while (true) {
    const separator_index = current_entry.indexOf(':');
    if (separator_index === -1) {
      throw new Error(`Invalid YAML mapping near "${current_entry}"`);
    }

    const key = current_entry.slice(0, separator_index).trim();
    const value = current_entry.slice(separator_index + 1).trim();
    result[key] = value ? parse_scalar(value) : {};

    const next_line = lines[index + 1];
    if (!next_line || next_line.indent <= indent || next_line.text.startsWith('- ')) {
      return [result, index + 1];
    }

    current_entry = next_line.text;
    index += 1;
  }
}

function parse_scalar(value: string): Scalar {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'null') {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return unescape_quoted_scalar(value.slice(1, -1));
  }

  return value;
}

function unescape_quoted_scalar(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}
