declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
    Props?: any;
    Custprops?: any;
    Workbook?: any;
  }

  export interface WorkSheet {
    [cell: string]: CellObject | any;
    '!ref'?: string;
    '!merges'?: any[];
    '!cols'?: any[];
    '!rows'?: any[];
    '!outline'?: any;
    '!margins'?: any;
    '!protect'?: any;
    '!autofilter'?: any;
  }

  export interface CellObject {
    t: string; // Cell type: b Boolean, n Number, e Error, s String, d Date, z Stub
    v: any; // Cell value
    f?: string; // Formula
    r?: string; // Rich Text
    h?: string; // HTML rendering
    w?: string; // Formatted text
    c?: any[]; // Comments
    z?: string; // Number format string
    l?: any; // Cell hyperlink
    s?: any; // Style/theme info
  }

  export interface CellAddress {
    c: number; // Column index
    r: number; // Row index
  }

  export interface Range {
    s: CellAddress; // Start
    e: CellAddress; // End
  }

  export interface Sheet2JSONOpts {
    header?: 1 | string[] | "A";
    dateNF?: string;
    defval?: any;
    blankrows?: boolean;
    raw?: boolean;
    range?: any;
    header_strict?: boolean;
    skipHidden?: boolean;
    density?: number;
  }

  export interface JSON2SheetOpts {
    header?: string[];
    skipHeader?: boolean;
    dateNF?: string;
    cellDates?: boolean;
    skipBlanks?: boolean;
  }

  export interface WritingOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'file' | 'array' | 'string';
    bookType?: 'xlsx' | 'xlsm' | 'xlsb' | 'xls' | 'csv' | 'txt' | 'html' | 'htm' | 'dif' | 'ods' | 'fods' | 'biff2';
    bookSST?: boolean;
    sheet?: string;
    compression?: boolean;
    ignoreEC?: boolean;
    ignoreStyles?: boolean;
    cellDates?: boolean;
    Props?: any;
    themeXLSX?: any;
    password?: string;
    cellStyles?: boolean;
    numbers?: boolean;
  }

  export interface ParsingOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'file' | 'array' | 'string';
    cellDates?: boolean;
    cellStyles?: boolean;
    cellNF?: boolean;
    sheetStubs?: boolean;
    sheetRows?: number;
    bookDeps?: boolean;
    bookFiles?: boolean;
    bookProps?: boolean;
    bookSheets?: boolean;
    bookVBA?: boolean;
    password?: string;
    WTF?: boolean;
    sheets?: number | string | string[];
    dateNF?: string;
    cellHTML?: boolean;
    dense?: boolean;
    raw?: boolean;
  }

  export function readFile(filename: string, opts?: ParsingOptions): WorkBook;
  export function read(data: any, opts?: ParsingOptions): WorkBook;
  export function writeFile(wb: WorkBook, filename: string, opts?: WritingOptions): void;
  export function write(wb: WorkBook, opts?: WritingOptions): any;
  export function writeFileSync(wb: WorkBook, filename: string, opts?: WritingOptions): void;
  export function writeFileAsync(filename: string, wb: WorkBook, opts: WritingOptions, callback: (err: Error) => void): void;
  
  export const utils: {
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
    cell_set_number_format(cell: CellObject, fmt: string): CellObject;
    cell_set_hyperlink(cell: CellObject, target: string, tooltip?: string): CellObject;
    cell_set_internal_link(cell: CellObject, range: Range, tooltip?: string): CellObject;
    cell_add_comment(cell: CellObject, comment: string, author?: string): CellObject;
    sheet_to_json<T>(ws: WorkSheet, opts?: Sheet2JSONOpts): T[];
    sheet_to_csv(ws: WorkSheet, opts?: Sheet2JSONOpts): string;
    sheet_to_txt(ws: WorkSheet, opts?: Sheet2JSONOpts): string;
    sheet_to_html(ws: WorkSheet, opts?: Sheet2JSONOpts): string;
    sheet_to_formulae(ws: WorkSheet): string[];
    sheet_add_aoa(ws: WorkSheet, data: any[][], opts?: any): WorkSheet;
    sheet_add_json(ws: WorkSheet, data: any[], opts?: JSON2SheetOpts): WorkSheet;
    aoa_to_sheet(data: any[][], opts?: any): WorkSheet;
    json_to_sheet(data: any[], opts?: JSON2SheetOpts): WorkSheet;
    sheet_new(): WorkSheet;
    sheet_set_array_formula(ws: WorkSheet, range: string | Range, formula: string, dynamic?: boolean): void;
    encode_cell(cell: CellAddress): string;
    encode_range(range: Range): string;
    decode_cell(address: string): CellAddress;
    decode_range(range: string): Range;
    format_cell(cell: CellObject, v?: any, opts?: any): string;
  };
} 