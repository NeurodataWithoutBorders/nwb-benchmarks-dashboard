// The results files key each parameter case by the Python `repr` of its parameters, so reading
// them means reading a small subset of Python literal syntax: dicts, tuples, lists, strings,
// numbers, None, True and False. `slice(...)` calls are kept as their source text, which is what
// nwb-benchmarks does too (it quotes them into strings before `ast.literal_eval`).

export type PyValue = string | number | boolean | null | PyValue[] | PyDict;
export interface PyDict {
  [key: string]: PyValue;
}

export function isPyDict(value: PyValue): value is PyDict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Parser {
  private pos = 0;

  constructor(private readonly text: string) {}

  parse(): PyValue {
    const value = this.value();
    this.skipSpace();
    if (this.pos !== this.text.length) this.fail("unexpected trailing text");
    return value;
  }

  private fail(reason: string): never {
    throw new SyntaxError(`Cannot read Python literal (${reason} at ${this.pos}): ${this.text}`);
  }

  private skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }

  private peek(): string {
    this.skipSpace();
    return this.text[this.pos] ?? "";
  }

  private expect(char: string): void {
    if (this.peek() !== char) this.fail(`expected "${char}"`);
    this.pos++;
  }

  private value(): PyValue {
    const char = this.peek();
    if (char === "{") return this.dict();
    if (char === "(") return this.sequence("(", ")", true);
    if (char === "[") return this.sequence("[", "]", false);
    if (char === "'" || char === '"') return this.string();
    if (/[-+.\d]/.test(char)) return this.number();
    return this.word();
  }

  private dict(): PyDict {
    this.expect("{");
    const result: PyDict = {};
    while (this.peek() !== "}") {
      const key = this.value();
      if (typeof key === "object" && key !== null) this.fail("unsupported dict key");
      this.expect(":");
      result[String(key)] = this.value();
      if (this.peek() === ",") this.pos++;
      else if (this.peek() !== "}") this.fail('expected "," or "}"');
    }
    this.pos++;
    return result;
  }

  /** A list, or a tuple (read as an array); `(x)` without a comma is just `x` in parentheses. */
  private sequence(open: string, close: string, isTuple: boolean): PyValue {
    this.expect(open);
    const items: PyValue[] = [];
    let sawComma = false;
    while (this.peek() !== close) {
      items.push(this.value());
      if (this.peek() === ",") {
        sawComma = true;
        this.pos++;
      } else if (this.peek() !== close) {
        this.fail(`expected "," or "${close}"`);
      }
    }
    this.pos++;
    if (isTuple && items.length === 1 && !sawComma) return items[0];
    return items;
  }

  private string(): string {
    const quote = this.text[this.pos];
    this.pos++;
    let out = "";
    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      if (char === quote) {
        this.pos++;
        return out;
      }
      if (char === "\\") {
        out += this.escape();
        continue;
      }
      out += char;
      this.pos++;
    }
    return this.fail("unterminated string");
  }

  private escape(): string {
    const next = this.text[this.pos + 1] ?? "";
    this.pos += 2;
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', "0": "\0" };
    if (next in simple) return simple[next];
    const width = next === "x" ? 2 : next === "u" ? 4 : next === "U" ? 8 : 0;
    if (width === 0) return `\\${next}`;
    const hex = this.text.slice(this.pos, this.pos + width);
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== width) this.fail("bad escape");
    this.pos += width;
    return String.fromCodePoint(parseInt(hex, 16));
  }

  private number(): number {
    const match = /^[-+]?(\d[\d_]*)?(\.\d*)?([eE][-+]?\d+)?/.exec(this.text.slice(this.pos));
    if (!match || match[0] === "" || match[0] === "-" || match[0] === "+") this.fail("bad number");
    this.pos += match[0].length;
    return Number(match[0].replace(/_/g, ""));
  }

  private word(): PyValue {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.text.slice(this.pos));
    if (!match) this.fail("unexpected character");
    const word = match[0];
    if (word === "slice" && this.text[this.pos + word.length] === "(") {
      // The same text nwb-benchmarks keeps: `slice(` up to the first `)`.
      const end = this.text.indexOf(")", this.pos);
      if (end < 0) this.fail("unterminated slice");
      const source = this.text.slice(this.pos, end + 1);
      this.pos = end + 1;
      return source;
    }
    this.pos += word.length;
    if (word === "None") return null;
    if (word === "True") return true;
    if (word === "False") return false;
    if (word === "nan") return Number.NaN;
    if (word === "inf") return Number.POSITIVE_INFINITY;
    return this.fail(`unknown name "${word}"`);
  }
}

/** Reads one Python literal, as `ast.literal_eval` would after slices are quoted. */
export function parsePyLiteral(text: string): PyValue {
  return new Parser(text).parse();
}

/**
 * Reads a parameter case key the way nwb-benchmarks' `Results.parse_parameter_case` does: a dict
 * as is, and the bare tuple older results used as `{https_url: <first item>}`.
 */
/** What results files before format 3.0.0 recorded a case's parameters as, by position. */
const POSITIONAL_PARAMETERS = ["https_url", "object_name", "slice_range"];

/** Each positional parameter, itself written as a Python literal ("'ElectricalSeries'"). */
function positionalCase(values: PyValue[]): PyDict {
  const parameters: PyDict = {};
  values.slice(0, POSITIONAL_PARAMETERS.length).forEach((value, position) => {
    let parsed: PyValue = value;
    if (typeof value === "string") {
      try {
        parsed = parsePyLiteral(value);
      } catch {
        parsed = value.replace(/^'+|'+$/g, "");
      }
    }
    parameters[POSITIONAL_PARAMETERS[position]] = parsed;
  });
  return parameters;
}

export function parseParameterCase(text: string): PyDict {
  const value = parsePyLiteral(text);
  if (isPyDict(value)) return value;
  if (Array.isArray(value)) return positionalCase(value);
  const first = typeof value === "string" ? value[0] : null;
  return { https_url: typeof first === "string" ? first.replace(/^'+|'+$/g, "") : null };
}
