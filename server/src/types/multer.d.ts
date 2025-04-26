declare module 'multer' {
  import { Request, Response } from 'express';

  namespace multer {
    interface Field {
      name: string;
      maxCount?: number;
    }

    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
    }

    interface Options {
      dest?: string;
      storage?: StorageEngine;
      limits?: {
        fieldNameSize?: number;
        fieldSize?: number;
        fields?: number;
        fileSize?: number;
        files?: number;
        parts?: number;
        headerPairs?: number;
      };
      fileFilter?(req: Request, file: File, callback: (error: Error | null, acceptFile: boolean) => void): void;
      preservePath?: boolean;
    }

    interface StorageEngine {
      _handleFile(req: Request, file: File, callback: (error?: any, info?: Partial<File>) => void): void;
      _removeFile(req: Request, file: File, callback: (error: Error) => void): void;
    }

    interface DiskStorageOptions {
      destination?: string | ((req: Request, file: File, callback: (error: Error | null, destination: string) => void) => void);
      filename?(req: Request, file: File, callback: (error: Error | null, filename: string) => void): void;
    }

    interface MemoryStorageOptions { }

    interface MulterIncomingMessage extends Request {
      file?: File;
      files?: {
        [fieldname: string]: File[] | File;
      } | File[] | undefined;
    }
  }

  interface Multer {
    (options?: multer.Options): Middleware;
    diskStorage(options: multer.DiskStorageOptions): multer.StorageEngine;
    memoryStorage(options?: multer.MemoryStorageOptions): multer.StorageEngine;
    single(fieldname: string): Middleware;
    array(fieldname: string, maxCount?: number): Middleware;
    fields(fields: multer.Field[]): Middleware;
    none(): Middleware;
  }

  interface Middleware {
    (req: Request, res: Response, next: (error?: any) => void): void;
    single(fieldname: string): Middleware;
    array(fieldname: string, maxCount?: number): Middleware;
    fields(fields: multer.Field[]): Middleware;
    none(): Middleware;
  }

  const multer: Multer;
  export = multer;
}

// Extend Express Request interface to include files from multer
declare global {
  namespace Express {
    interface Request {
      file?: multer.File;
      files?: {
        [fieldname: string]: multer.File[];
      } | multer.File[];
    }
  }
} 