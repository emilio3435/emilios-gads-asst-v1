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
    step?: (results: ParseResult<any>, parser: any) => void;
    transform?: (value: string, field: string | number) => any;
    delimitersToGuess?: string[];
    complete?: (results: ParseResult<any>, file: any) => void;
    error?: (error: Error, file: any) => void;
    chunk?: (results: ParseResult<any>, parser: any) => void;
    beforeFirstChunk?: (chunk: string) => string | void;
  }

  export interface ParseResult<T> {
    data: T[];
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
      truncated: boolean;
      cursor: number;
    };
  }

  export interface UnparseConfig {
    quotes?: boolean | boolean[] | ((value: any) => boolean);
    quoteChar?: string;
    escapeChar?: string;
    delimiter?: string;
    header?: boolean;
    newline?: string;
    skipEmptyLines?: boolean | 'greedy';
    columns?: string[] | ((input: any) => string[]);
  }

  export function parse(input: string, config?: ParseConfig): ParseResult<any>;
  export function unparse(data: any, config?: UnparseConfig): string;

  const Papa: {
    parse: typeof parse;
    unparse: typeof unparse;
  };

  export default Papa;
} 