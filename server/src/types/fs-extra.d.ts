declare module 'fs-extra' {
  export * from 'fs';

  export function copy(src: string, dest: string, options?: CopyOptions): Promise<void>;
  export function copySync(src: string, dest: string, options?: CopyOptions): void;

  export function emptyDir(dir: string): Promise<void>;
  export function emptyDirSync(dir: string): void;

  export function ensureDir(dir: string, options?: EnsureDirOptions | number): Promise<void>;
  export function ensureDirSync(dir: string, options?: EnsureDirOptions | number): void;

  export function ensureFile(file: string): Promise<void>;
  export function ensureFileSync(file: string): void;

  export function ensureLink(src: string, dest: string): Promise<void>;
  export function ensureLinkSync(src: string, dest: string): void;

  export function ensureSymlink(src: string, dest: string, type?: SymlinkType): Promise<void>;
  export function ensureSymlinkSync(src: string, dest: string, type?: SymlinkType): void;

  export function mkdirp(dir: string, options?: MkdirpOptions | number): Promise<void>;
  export function mkdirpSync(dir: string, options?: MkdirpOptions | number): void;

  export function move(src: string, dest: string, options?: MoveOptions): Promise<void>;
  export function moveSync(src: string, dest: string, options?: MoveOptions): void;

  export function outputFile(file: string, data: any, options?: WriteFileOptions): Promise<void>;
  export function outputFileSync(file: string, data: any, options?: WriteFileOptions): void;

  export function outputJSON(file: string, data: any, options?: WriteJsonOptions): Promise<void>;
  export function outputJson(file: string, data: any, options?: WriteJsonOptions): Promise<void>;
  export function outputJSONSync(file: string, data: any, options?: WriteJsonOptions): void;
  export function outputJsonSync(file: string, data: any, options?: WriteJsonOptions): void;

  export function pathExists(path: string): Promise<boolean>;
  export function pathExistsSync(path: string): boolean;

  export function readJSON(file: string, options?: ReadOptions): Promise<any>;
  export function readJson(file: string, options?: ReadOptions): Promise<any>;
  export function readJSONSync(file: string, options?: ReadOptions): any;
  export function readJsonSync(file: string, options?: ReadOptions): any;

  export function remove(path: string): Promise<void>;
  export function removeSync(path: string): void;

  export function writeJSON(file: string, object: any, options?: WriteJsonOptions): Promise<void>;
  export function writeJson(file: string, object: any, options?: WriteJsonOptions): Promise<void>;
  export function writeJSONSync(file: string, object: any, options?: WriteJsonOptions): void;
  export function writeJsonSync(file: string, object: any, options?: WriteJsonOptions): void;

  export interface CopyOptions {
    overwrite?: boolean;
    errorOnExist?: boolean;
    dereference?: boolean;
    preserveTimestamps?: boolean;
    filter?: (src: string, dest: string) => boolean | Promise<boolean>;
  }

  export interface EnsureDirOptions {
    mode?: number;
  }

  export interface MkdirpOptions {
    mode?: number;
    fs?: any;
  }

  export interface MoveOptions {
    overwrite?: boolean;
    errorOnExist?: boolean;
  }

  export interface ReadOptions {
    throws?: boolean;
    fs?: any;
    reviver?: (key: any, value: any) => any;
    encoding?: string;
    flag?: string;
  }

  export interface WriteFileOptions {
    encoding?: string;
    flag?: string;
    mode?: number;
  }

  export interface WriteJsonOptions {
    spaces?: number | string;
    replacer?: (key: string, value: any) => any;
    encoding?: string;
    mode?: number;
    flag?: string;
    EOL?: string;
  }

  export type SymlinkType = 'dir' | 'file' | 'junction';
} 