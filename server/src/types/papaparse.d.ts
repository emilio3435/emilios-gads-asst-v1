declare module 'papaparse' {
  export interface ParseConfig {
    delimiter?: string;
    newline?: string;
    quoteChar?: string;
    escapeChar?: string;
    header?: boolean;
    dynamicTyping?: boolean;
    preview?: number;
    encoding?: string;
    worker?: boolean;
    comments?: boolean | string;
    download?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    fastMode?: boolean;
    withCredentials?: boolean;
    delimitersToGuess?: string[];
    chunk?(results: ParseResult, parser: Parser): void;
    complete?(results: ParseResult, file?: File): void;
    error?(error: Error, file?: File): void;
    transform?(value: string, field: string | number): any;
    step?(results: ParseResult, parser: Parser): void;
    beforeFirstChunk?(chunk: string): string | void;
  }

  export interface ParseResult {
    data: any[];
    errors: Array<{
      type: string;
      code: string;
      message: string;
      row: number;
    }>;
    meta: {
      delimiter: string;
      linebreak: string;
      aborted: boolean;
      fields?: string[];
      truncated: boolean;
      cursor?: number;
    };
  }

  export interface Parser {
    abort(): void;
    pause(): void;
    resume(): void;
  }

  export interface UnparseConfig {
    quotes?: boolean | boolean[] | string[];
    quoteChar?: string;
    escapeChar?: string;
    delimiter?: string;
    header?: boolean;
    newline?: string;
    skipEmptyLines?: boolean;
    columns?: string[] | object[];
  }

  export interface UnparseObject {
    fields?: string[];
    data: string[][] | object[];
  }

  export interface LocalFile {
    name: string;
    type: string;
    size: number;
  }

  export interface ParserHandle {
    stream(file: LocalFile): ParseResult;
    readEntry(): Entry;
    readChunk(): string | ArrayBuffer;
    close(): void;
  }

  export interface Entry {
    filename: string;
    type: string;
    content: string | ArrayBuffer;
  }

  export function parse(input: string | File | NodeJS.ReadableStream, config?: ParseConfig): ParseResult;
  export function unparse(input: string[][] | object[] | UnparseObject, config?: UnparseConfig): string;
} 