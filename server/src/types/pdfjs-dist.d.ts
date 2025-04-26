declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const getDocument: (source: string | URL | ArrayBuffer | { url: string } | { data: Uint8Array }) => PDFDocumentLoadingTask;
  
  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }
  
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }
  
  export interface PDFPageProxy {
    getTextContent(): Promise<PDFTextContent>;
  }
  
  export interface PDFTextContent {
    items: PDFTextItem[];
  }
  
  export interface PDFTextItem {
    str: string;
  }

  export const GlobalWorkerOptions: {
    workerSrc: string;
  };
} 