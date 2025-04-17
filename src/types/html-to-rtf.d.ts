declare module 'html-to-rtf' {
  export function saveAs(fileName: string, content: string): void;
  export function convertHtmlToRtf(html: string): string;
  
  const htmlToRtf: {
    saveAs: typeof saveAs;
    convertHtmlToRtf: typeof convertHtmlToRtf;
  };
  
  export default htmlToRtf;
} 