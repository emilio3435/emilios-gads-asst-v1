declare module '@google/generative-ai' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: { model: string }): GenerativeModel;
  }

  export class GenerativeModel {
    constructor(options: { model: string; apiKey: string });
    startChat(options?: { history?: Array<{ role: string; parts: Array<{ text: string }> }> }): ChatSession;
    generateContent(prompt: string | Array<Part>): Promise<GenerateContentResult>;
  }

  export interface Part {
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }

  export class ChatSession {
    sendMessage(message: string | Array<Part>): Promise<GenerateContentResult>;
    getHistory(): Array<{ role: string; parts: Array<{ text: string }> }>;
  }

  export interface GenerateContentResult {
    response: {
      text(): string;
      candidates: Array<{
        content: {
          parts: Array<{ text: string }>;
        };
      }>;
    };
  }
} 