import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Initialize Firebase Admin SDK first
import { db } from './firebase'; // Import the initialized Firestore instance
import * as admin from 'firebase-admin'; // Import Firebase Admin types

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authenticateToken } from './middleware/auth'; // Import the auth middleware
import { sessionMiddleware } from './middleware/session'; // Import the session middleware
import { ServiceAccount } from 'firebase-admin';
import { OAuth2Client } from 'google-auth-library';

// --- Imports needed for /analyze ---
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer'; // For handling file uploads
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'; // Use pdfjs-dist
import fs from 'fs'; // Import file system module
import path from 'path'; // Import path module
// --- End imports for /analyze ---

// Verify GOOGLE_CLIENT_ID is loaded after dotenv.config()
// This check is now less critical here as firebase init would fail first
// if (!process.env.GOOGLE_CLIENT_ID) {
//   console.error('FATAL ERROR: GOOGLE_CLIENT_ID environment variable is not set after loading .env.');
//   process.exit(1);
// }

const app = express();
const port = process.env.PORT || 5001; // Use environment variable or default to 5001

// --- SIMPLE REQUEST LOGGER --- 
// Add this middleware EARLY to see all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received Request: ${req.method} ${req.originalUrl}`);
  next(); // Pass control to the next middleware/route handler
});
// --- END REQUEST LOGGER ---

// --- Configuration needed for /analyze ---
// Configure Multer for file uploads (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB limit for files
    fieldSize: 50 * 1024 * 1024,  // 50 MB limit for non-file fields
  },
});

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY is not defined in the .env file.');
  process.exit(1); // Exit if API key is missing
} else {
  console.log(`GEMINI_API_KEY loaded successfully: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
}
const genAI = new GoogleGenerativeAI(apiKey);
// --- End configuration for /analyze ---

// Log allowed CORS origin from env for debugging
console.log('CORS_ORIGIN from env:', process.env.CORS_ORIGIN);

// Middleware
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); // Or 'unsafe-none' if needed, but start with 'require-corp'
  next();
});
app.use(cors({ 
  origin: function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins - use CORS_ORIGIN env var if available
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      process.env.CORS_ORIGIN
    ].filter(Boolean); // Remove any null/undefined values
    
    console.log(`Received request from origin: ${origin}, allowed origins:`, allowedOrigins);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Important for cookies/sessions
})); 
app.use(express.json({ limit: '50mb' })); // Parse JSON request bodies
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add session middleware
app.use(sessionMiddleware);

// Simple Root Route
app.get('/', (req: Request, res: Response) => {
  res.send('Audacy Assistant Backend is running!');
});

// Define interfaces for document data
interface DocumentData {
  userId: string;
  results?: {
    helpConversation?: any[];
    [key: string]: any;
  };
  [key: string]: any;
}

// --- Helper functions needed for /analyze (copied from server.js) ---

// Define industry-specific context data for Audacy (assuming this structure is correct)
const audacyIndustryContext: { [key: string]: { contextDetails: string; specificTips: string[] } } = {
  retail: {
    contextDetails: "Retail clients focus on driving store visits, product sales, and seasonal promotions. Audacy's audio solutions reach 92M combined monthly listeners who are not found on competing platforms (92% not on Amazon Music, 89% not on YouTube Music, 63% not on Spotify), providing exclusive audience access. Audacy's attribution suite connects audio campaigns directly to in-store visits and sales lift.",
    specificTips: [
      "Highlight Audacy's advanced targeting capabilities for specific retail demographics including 'In-Market' segments and 'Passionate About' segments",
      "Emphasize attribution metrics that directly connect audio campaigns to in-store foot traffic with geofencing technology",
      "Showcase how Audacy campaigns can be quickly adjusted for seasonal promotions with both streaming and podcast content",
      "Note that 65% of Audacy's audience has household income of $50k+ and 31% has income of $100k+, making them valuable retail consumers"
    ]
  },
  automotive: {
    contextDetails: "Automotive clients need consistent brand presence and targeted local campaigns for dealerships. Audacy's exclusive audience (89% not found on YouTube Music, 67% not on Pandora/SXM) enables dealers to reach qualified auto intenders. The audience is older and more affluent (25-54, 55+), matching the prime demographic for auto purchases.",
    specificTips: [
      "Highlight Audacy's ability to target auto intenders through behavioral audio targeting - we have specific 'In Market for New Vehicle' and 'Car Intender' segments",
      "Emphasize Audacy's cross-device attribution capabilities that connect audio advertising to dealership visits",
      "Showcase how Audacy's combination of radio and digital audio creates surround-sound campaigns for sales events",
      "Point out that Audacy's audio can engage consumers during the critical research and consideration phase of car buying"
    ]
  },
  entertainment: {
    contextDetails: "Entertainment clients (media, streaming, events) value Audacy's ability to reach entertainment-focused audiences across 92M monthly listeners, with deep podcast expertise including 26M podcast listeners and 25M+ weekly downloads. Audacy is a top podcast network with 7 shows in the Top 100.",
    specificTips: [
      "Emphasize Audacy's entertainment audience segments and 'Audio Rituals' data showing 47% of listeners plan their day around audio content",
      "Highlight Audacy's content alignment opportunities for entertainment brands with our owned and operated premium podcast content",
      "Suggest integrated promotions that leverage Audacy's on-air talent and live events for entertainment properties",
      "Showcase Audacy's brand safety advantages with Sounder partnership that uses AI to ensure appropriate content alignment"
    ]
  },
  financial: {
    contextDetails: "Financial services clients (banking, insurance, investment) require trust-building campaigns and detailed demographic targeting for high-value services. Audacy's older, affluent audience (31% with $100k+ HHI, 45% college educated) provides an ideal match for financial services marketing.",
    specificTips: [
      "Focus on Audacy's ability to reach affluent, business-minded listeners who are active financial decision-makers",
      "Highlight brand safety advantages of Audacy's premium content environment, especially important for financial brands",
      "Emphasize how Audacy creates opportunities for detailed messaging on complex financial products through both streaming and podcasts",
      "Showcase Audacy's 'Financial Market Followers,' 'Investors,' and 'Business Decision Maker' targeting segments"
    ]
  },
  b2b: {
    contextDetails: "B2B clients value Audacy's ability to reach business decision-makers during commute times and through business-focused content. With 92M combined monthly audience and 41% listening on mobile and 33% on smart speakers, Audacy reaches executives throughout their day with trusted content.",
    specificTips: [
      "Highlight targeting capabilities for reaching executives and business decision-makers, especially through LinkedIn and Elite Social B2B options",
      "Focus on metrics that demonstrate quality over quantity for B2B lead generation using Audacy's attribution suite",
      "Emphasize Audacy's business and news content environments for contextual relevance with decision-makers",
      "Showcase Audacy's exclusive reach - 66% of Audacy listeners are not found on iHeart Radio Network"
    ]
  }
};

// Function to detect industry based on data content or current situation
function getIndustryContext(dataString: string, currentSituation: string): { contextDetails: string; specificTips: string[] } | null {
  const industryKeywords: { [key: string]: string[] } = {
    retail: ['retail', 'store', 'shop', 'product', 'consumer', 'purchase', 'merchandise', 'inventory', 'sale', 'discount', 'ecommerce', 'customer'],
    automotive: ['automotive', 'car', 'vehicle', 'dealership', 'auto', 'dealer', 'drive', 'test drive', 'model', 'manufacturer'],
    entertainment: ['entertainment', 'movie', 'show', 'concert', 'event', 'stream', 'media', 'music', 'performance', 'festival', 'ticket'],
    financial: ['financial', 'bank', 'insurance', 'invest', 'finance', 'loan', 'mortgage', 'credit', 'wealth', 'money', 'banking'],
    b2b: ['b2b', 'business', 'solution', 'enterprise', 'corporate', 'company', 'professional', 'service', 'client', 'industry']
  };

  const combinedText = (dataString || '') + ' ' + (currentSituation || '');
  const lowerCaseText = combinedText.toLowerCase();
  const industryCounts: { [key: string]: number } = {};

  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    industryCounts[industry] = 0;
    for (const keyword of keywords) {
      const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
      const matches = lowerCaseText.match(regex);
      if (matches) {
        industryCounts[industry] += matches.length;
      }
    }
  }

  let detectedIndustry: string | null = null;
  let maxCount = 0;

  for (const [industry, count] of Object.entries(industryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      detectedIndustry = industry;
    }
  }

  if (detectedIndustry && maxCount >= 1) {
    return audacyIndustryContext[detectedIndustry];
  }

  return null;
}

// Helper function to call models with retry logic (add types)
async function callModelWithRetry(model: any, prompt: string, maxRetries = 5): Promise<any> { // Consider defining a more specific type for model and result
  let retryCount = 0;
  let result;

  while (retryCount < maxRetries) {
    try {
      console.log(`Attempt ${retryCount + 1} of ${maxRetries} to call API`);
      result = await model.generateContent(prompt);
      console.log('API call successful!');
      return result;
    } catch (error: any) { // Type the error
      console.error(`Error on attempt ${retryCount + 1}:`, error);

      if (error.message && (error.message.includes('429') || error.message.includes('503'))) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
        }
        const baseDelay = 1000;
        const maxDelay = 30000;
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, retryCount - 1));
        const jitter = delay * 0.1 * Math.random();
        const waitTime = delay + jitter;
        console.log(`Retrying in ${Math.round(waitTime / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts`);
}
// --- End Helper functions ---

// --- Analyze Endpoint (copied from server.js and adapted) ---
app.post('/analyze', upload.single('file'), async (req: Request, res: Response) => {
  console.log('--- [/analyze] Request received ---'); 
  try {
    console.log('[/analyze] Request body (summary):', { 
        tactics: req.body.tactics, 
        kpis: req.body.kpis, 
        currentSituation: !!req.body.currentSituation, 
        modelId: req.body.modelId, 
        outputDetail: req.body.outputDetail 
    });
    // Correct typing for req.file with multer
    const uploadedFile = req.file; // multer middleware adds .file property typed correctly if @types/multer is installed
    console.log('[/analyze] File:', uploadedFile ? uploadedFile.originalname : 'No file uploaded');

    const tacticsString = req.body.tactics ? JSON.parse(req.body.tactics) : '';
    const kpisString = req.body.kpis ? JSON.parse(req.body.kpis) : '';
    const currentSituation = req.body.currentSituation || '';
    const modelId = req.body.modelId || 'gemini-2.0-flash';
    const outputDetail = req.body.outputDetail || 'detailed';
    console.log(`[/analyze] Parsed - modelId: ${modelId}, outputDetail: ${outputDetail}`);

    const allowedModels = ['gemini-2.5-pro-preview-03-25', 'gemini-2.0-flash'];
    let modelName = allowedModels.includes(modelId) ? modelId : 'gemini-2.0-flash';

    let displayModelName: string;
    switch (modelName) {
        case 'gemini-2.5-pro-preview-03-25': displayModelName = "Audacy AI (Gemini 2.5 Pro Preview)"; break;
        case 'gemini-2.0-flash': displayModelName = "Audacy AI (Gemini 2.0 Flash)"; break;
        default: displayModelName = "Audacy AI";
    }
    console.log(`Initializing model for analysis: ${modelName}`);

    let result;
    let finalPrompt = ''; 
    let dataString = ''; 
    let fileName = uploadedFile ? uploadedFile.originalname : 'N/A'; 
    let rawFileContent = ''; 

    try {
      console.log('[/analyze] Entering file processing/model call block'); 
      const model = genAI.getGenerativeModel({ model: modelName });
      console.log(`[/analyze] Initialized model: ${modelName}`); 

      console.log('[/analyze] Starting file processing...'); 
      if (!uploadedFile) {
          console.log('[/analyze] No file uploaded.');
          dataString = 'No file content provided.'; 
          rawFileContent = 'No file uploaded.';
      } else {
          fileName = uploadedFile.originalname;
          const fileBuffer = uploadedFile.buffer;
          console.log(`Processing file: ${fileName}`);
          const lowerCaseFileName = fileName.toLowerCase();

          if (lowerCaseFileName.endsWith('.csv')) {
              console.log('Parsing CSV file...');
              const fileContent = fileBuffer.toString('utf-8');
              rawFileContent = fileContent;
              const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
              if (parseResult.errors.length > 0) {
                  console.error('[/analyze] CSV parsing errors:', parseResult.errors);
                  throw new Error('Failed to parse CSV file.');
              }
              dataString = JSON.stringify(parseResult.data, null, 2);
              console.log('CSV parsed successfully.');
          } else if (lowerCaseFileName.endsWith('.xlsx')) {
              console.log('Parsing Excel file...');
              const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const excelData = XLSX.utils.sheet_to_json(worksheet);
              dataString = JSON.stringify(excelData, null, 2);
              rawFileContent = dataString;
              console.log('Excel parsed successfully.');
          } else if (lowerCaseFileName.endsWith('.pdf')) {
              console.log('Parsing PDF file with pdfjs-dist...');
              try {
                  // Get the correct directory path using standard Node.js method
                  const currentDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
                  const workerSrcPath = path.join(currentDir, 'legacy/build/pdf.worker.mjs');
                  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;
                  const uint8Array = new Uint8Array(fileBuffer);
                  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
                  const pdfDoc = await loadingTask.promise;
                  console.log(`PDF loaded successfully. Pages: ${pdfDoc.numPages}`);
                  let fullText = '';
                  for (let i = 1; i <= pdfDoc.numPages; i++) {
                      const page = await pdfDoc.getPage(i);
                      const textContent = await page.getTextContent();
                      const pageText = textContent.items.map((item: any) => item.str).join(' '); // Add type for item
                      fullText += pageText + '\n';
                  }
                  dataString = fullText.trim();
                  rawFileContent = dataString;
                  console.log(`[/analyze] PDF parsed successfully. Extracted ${dataString.length} characters.`);
              } catch (pdfError: any) { // Type error
                  console.error('[/analyze] PDF parsing error with pdfjs-dist:', pdfError);
                  let errorMessage = 'Failed to parse PDF file.';
                  if (pdfError instanceof Error) errorMessage += ` Details: ${pdfError.message}`;
                  throw new Error(errorMessage);
              }
          } else if (lowerCaseFileName.endsWith('.png') || lowerCaseFileName.endsWith('.jpg') || lowerCaseFileName.endsWith('.jpeg') || lowerCaseFileName.endsWith('.gif') || lowerCaseFileName.endsWith('.webp')) {
              console.log('Processing image file...');
              const base64Image = fileBuffer.toString('base64');
              const mimeType = uploadedFile.mimetype;
              dataString = `data:${mimeType};base64,${base64Image}`;
              rawFileContent = dataString;
              console.log(`Image (${mimeType}) processed successfully.`);
          } else {
              console.log('Unsupported file type.');
              rawFileContent = 'Unsupported file type.';
              throw new Error('Unsupported file type. Please upload CSV, XLSX, PDF, PNG, JPG, GIF, or WEBP.');
          }
      }
      console.log('[/analyze] File processing finished.');

      let promptTemplatePath;
      if (outputDetail === 'brief') {
          promptTemplatePath = path.join(__dirname, 'prompt_template_brief.txt');
          console.log(`Using BRIEF prompt template: ${promptTemplatePath}`);
      } else {
          promptTemplatePath = path.join(__dirname, 'prompt_template.txt');
          console.log(`Using DETAILED prompt template: ${promptTemplatePath}`);
      }
      let promptTemplateContent = await fs.promises.readFile(promptTemplatePath, 'utf-8');

      const industryContext = getIndustryContext(dataString, currentSituation);
      console.log(`[/analyze] Detected industry context: ${industryContext ? Object.keys(audacyIndustryContext).find(key => audacyIndustryContext[key] === industryContext) : 'None'}`);
      
      finalPrompt = promptTemplateContent;
      finalPrompt = finalPrompt.replace('{{fileName}}', fileName);
      finalPrompt = finalPrompt.replace('{{tacticsString}}', tacticsString || 'N/A');
      finalPrompt = finalPrompt.replace('{{kpisString}}', kpisString || 'N/A');
      finalPrompt = finalPrompt.replace('{{currentSituation}}', currentSituation || 'N/A');
      finalPrompt = finalPrompt.replace('{{desiredOutcome}}', 'N/A');
      finalPrompt = finalPrompt.replace('{{dataString}}', dataString);
      finalPrompt = finalPrompt.replace('{{industryContext}}', industryContext ? industryContext.contextDetails : 'General audio advertising context.');
      finalPrompt = finalPrompt.replace('{{industryTips}}', industryContext ? industryContext.specificTips.map(tip => `- ${tip}`).join('\n') : 'Focus on standard audio campaign best practices.');
      console.log("[/analyze] Final prompt constructed. Length:", finalPrompt.length);

      console.log('[/analyze] Calling Gemini model...');
      result = await callModelWithRetry(model, finalPrompt);
      console.log('[/analyze] Gemini model call successful.');
    
    } catch (processingError: any) { // Type error
      console.error('[/analyze] Error during processing/model call block:', processingError);
      if (!res.headersSent) {
           return res.status(500).json({ error: `Server error during processing: ${processingError.message}` });
      }
      console.error('[/analyze] Headers already sent, could not send processing error response.');
      return; 
    }
    
    if (!result) {
        console.error("Model result is undefined, cannot proceed to process response.");
        if (!res.headersSent) {
             return res.status(500).json({ error: 'Model did not return a result.' });
        }
        return;
    }

    try {
        console.log('[/analyze] Processing model response...');
        const response = await result.response;
        const fullResponseText = response.text();
        console.log('[/analyze] Raw Gemini response length:', fullResponseText.length);

        let htmlAnalysis = '';
        let rawText = '';

        const htmlMatch = fullResponseText.match(/---HTML_ANALYSIS_START---([\s\S]*?)---HTML_ANALYSIS_END---/);
        if (htmlMatch && htmlMatch[1]) {
            htmlAnalysis = htmlMatch[1].trim();
            const prefix = '```html';
            const suffix = '```';
            if (htmlAnalysis.startsWith(prefix)) {
                htmlAnalysis = htmlAnalysis.substring(prefix.length);
            }
            if (htmlAnalysis.endsWith(suffix)) {
                htmlAnalysis = htmlAnalysis.substring(0, htmlAnalysis.length - suffix.length);
            }
            htmlAnalysis = htmlAnalysis.trim();
            rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, "");
        } else {
            console.warn('Could not find HTML analysis part in response. Using full response as fallback.');
            htmlAnalysis = fullResponseText.trim(); 
             rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, "");
        }

        console.log('[/analyze] Cleaned Gemini response (HTML) length:', htmlAnalysis.length);

        if (!res.headersSent) {
            console.log('[/analyze] Sending final JSON response to client.');
            res.json({
                html: htmlAnalysis,
                raw: rawText,
                prompt: finalPrompt,
                modelName: displayModelName,
                rawFileContent: rawFileContent
            });
            console.log('[/analyze] Response sent to client.');
        }
    } catch (responseProcessingError: any) { // Type error
        console.error('[/analyze] Error processing model response:', responseProcessingError);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Server error processing analysis response', details: responseProcessingError.message });
        }
    }

  } catch (outerError: any) { // Type error for the outer try/catch
    console.error('--- [/analyze] Outer Catch Block Error --- ');
    console.error(outerError);
    if (!res.headersSent) {
         // Send plain text error for robustness
         res.status(500).send(`Server error during analysis setup: ${outerError.message}`);
    }
  }
});
// --- End Analyze Endpoint ---

// --- Get Help Endpoint (copied from server.js and adapted) ---
app.post('/get-help', upload.single('contextFile'), async (req: Request, res: Response) => {
  console.log('--- New request to /get-help ---');
  try {
    const {
      originalPrompt,
      originalAnalysis,
      question,
      tactic,
      kpi,
      fileName,
      currentSituation,
      desiredOutcome,
      conversationHistory: conversationHistoryJson,
      modelId,
      analysisResult,
      originalFileContent
    } = req.body;

    const contextFile = req.file; // Multer adds .file property

    console.log('--- Help Request Received ---');
    console.log('Question:', question);
    console.log('Conversation History JSON:', conversationHistoryJson);

    if (!question) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    let additionalContext = '';
    if (contextFile) {
      console.log(`Processing help context file: ${contextFile.originalname}`);
      const fileBuffer = contextFile.buffer;
      const lowerCaseFileName = contextFile.originalname.toLowerCase();

      try {
        if (lowerCaseFileName.endsWith('.csv')) {
          const fileContent = fileBuffer.toString('utf-8');
          const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
          if (parseResult.errors.length > 0) {
            console.warn('CSV parsing errors in help context:', parseResult.errors);
            additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n[Could not fully parse CSV, but content starts with: ${fileContent.substring(0, 500)}]`;
          } else {
            additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n${JSON.stringify(parseResult.data, null, 2)}`;
          }
        } else if (lowerCaseFileName.endsWith('.xlsx')) {
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const excelData = XLSX.utils.sheet_to_json(worksheet);
          additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n${JSON.stringify(excelData, null, 2)}`;
        } else if (lowerCaseFileName.endsWith('.pdf')) {
          const uint8Array = new Uint8Array(fileBuffer);
          const currentDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
          const workerSrcPath = path.join(currentDir, 'legacy/build/pdf.worker.mjs');
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          const pdfDoc = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n'; // Add type for item
          }
          additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n${fullText.trim()}`;
        } else {
          additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n[Unsupported file type for direct processing]`;
        }
        console.log('Processed additional context from file.');
      } catch (fileError: any) { // Type error
        console.error(`Error processing help context file ${contextFile.originalname}:`, fileError);
        additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n[Error processing file: ${fileError.message}]`;
      }
    }

    let previousConversationFormatted = '';
    try {
      const conversationHistory = req.body.conversationHistory ? 
        JSON.parse(req.body.conversationHistory) : [];
        
      if (conversationHistory && conversationHistory.length > 0) {
        const previousMessages = conversationHistory.slice(0, -1);
        if (previousMessages.length > 0) {
          previousConversationFormatted = "===== CONVERSATION HISTORY =====\n";
          previousMessages.forEach((message: { content: string; type: string }) => { // Add type for message
            const textContent = message.content.replace(/<\/?[^>]+(>|$)/g, "");
            const role = message.type === 'user' ? 'USER' : 'ASSISTANT';
            previousConversationFormatted += `${role}: ${textContent}\n\n`;
          });
          previousConversationFormatted += "===== END OF CONVERSATION HISTORY =====\n\n";
        }
      }
    } catch (error) {
      console.error('Error formatting conversation history:', error);
      previousConversationFormatted = '';
    }

    let campaignContext = '';
    if (tactic || kpi || fileName || currentSituation || desiredOutcome) {
      campaignContext = "===== CAMPAIGN CONTEXT =====\n";
      if (tactic) campaignContext += `Tactic: ${tactic}\n`;
      if (kpi) campaignContext += `KPI: ${kpi}\n`;
      if (fileName) campaignContext += `File: ${fileName}\n`;
      if (currentSituation) campaignContext += `Current Situation: ${currentSituation}\n`;
      if (desiredOutcome) campaignContext += `Desired Outcome: ${desiredOutcome}\n`;
      campaignContext += "===== END CAMPAIGN CONTEXT =====\n\n";
    }

    let analysisContext = '';
    if (analysisResult) {
      analysisContext = `===== PREVIOUS ANALYSIS RESULT =====\n${analysisResult}\n===== END PREVIOUS ANALYSIS RESULT =====\n\n`;
    }

    let originalDataContext = '';
    if (originalFileContent) {
      originalDataContext = `===== ORIGINAL UPLOADED FILE CONTENT =====\n${originalFileContent}\n===== END ORIGINAL UPLOADED FILE CONTENT =====\n\n`;
    }

    const promptForHelp = `You are a helpful AI assistant specializing in digital marketing analytics for Audacy. Your goal is to help users understand their marketing campaign data.

${originalDataContext}${previousConversationFormatted}${campaignContext}${analysisContext}${additionalContext ? `===== ADDITIONAL CONTEXT =====\n${additionalContext}\n===== END ADDITIONAL CONTEXT =====\n\n` : ''}
CURRENT QUESTION: ${req.body.question}

`;

    console.log("=================================================================================");
    console.log("HELP PROMPT BEING SENT TO MODEL:");
    console.log("----------------------------------------------------------------------------------");
    console.log(promptForHelp);
    console.log("=================================================================================");

    const allowedModels = ['gemini-2.5-pro-preview-03-25', 'gemini-2.0-flash'];
    let helpModelId = 'gemini-2.0-flash'; 
    if (modelId && allowedModels.includes(modelId)) {
      helpModelId = modelId;
    } else if (modelId) {
      console.warn(`Requested model ${modelId} for help not allowed or invalid. Falling back to default.`);
    }

    console.log(`Using model for help: ${helpModelId}`);
    const model = genAI.getGenerativeModel({ model: helpModelId });
    const result = await callModelWithRetry(model, promptForHelp);
    const response = await result.response;
    const responseText = response.text();
    
    console.log("=================================================================================");
    console.log("RAW RESPONSE FROM MODEL:");
    console.log("----------------------------------------------------------------------------------");
    console.log(responseText);
    console.log("=================================================================================");

    res.json({ response: responseText });
  } catch (error: any) { // Type error
    console.error('--- Error in /get-help ---');
    console.error(error);
    res.status(500).json({ error: 'Server error while getting help', details: error.message });
  }
});
// --- End Get Help Endpoint ---

// --- History API Routes (Protected by Auth Middleware) ---

// GET /api/history - Fetch history for the user
app.get('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received GET /api/history request for user: ${req.user?.email}`);
  const userId = req.user?.sub;

  if (!userId) {
    console.error('User ID missing after authentication.');
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  try {
    console.log(`Looking up history for user ${userId}...`);
    const query = db.collection('userHistory').where('userId', '==', userId);
    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log(`No history found for user ${userId}.`);
      return res.status(200).json({ message: 'No history found.', data: [] });
    }

    // Convert snapshot to array of history entries
    const historyEntries = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      };
    });

    console.log(`Successfully fetched ${historyEntries.length} history entries for user ${userId}.`);
    res.status(200).json({ 
      message: 'History fetched successfully.',
      data: historyEntries
    });

  } catch (error) {
    console.error(`Error fetching history for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to fetch history due to a server error.' });
  }
});

// GET /api/history/:id - Fetch a specific history entry by ID
app.get('/api/history/:id', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received GET /api/history/:id request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  try {
    console.log(`Looking up document with ID: ${entryId} in collection 'userHistory'`);
    // Get the document
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`GET ERROR: History entry ${entryId} not found. Doc doesn't exist.`);
      return res.status(404).json({ message: 'This history entry is no longer available. It may have been deleted.' });
    }

    const data = doc.data() as DocumentData;
    
    // Verify the entry belongs to the authenticated user
    if (data?.userId !== userId) {
      console.log(`GET ERROR: Unauthorized attempt to access history entry ${entryId} by user ${userId}.`);
      return res.status(403).json({ message: 'Unauthorized. You can only access your own history entries.' });
    }

    // Return the entry data with its ID
    const historyEntry = {
      id: doc.id,
      ...data
    };
    
    console.log(`Successfully fetched history entry ${entryId} for user ${userId}.`);
    res.status(200).json({ message: 'History entry fetched successfully.', data: historyEntry });

  } catch (error) {
    console.error(`GET ERROR: Error fetching history entry ${entryId} for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to fetch history entry due to a server error.' });
  }
});

// POST /api/history - Save a new history entry
app.post('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received POST /api/history request for user: ${req.user?.email}`);
  console.log(`POST request body size: ${JSON.stringify(req.body).length} bytes`);
  console.log('Request headers:', req.headers);
  
  const userId = req.user?.sub;
  const historyEntryData = req.body; // Get data from frontend

  if (!userId) {
    console.error('Error in POST /api/history: User ID missing after authentication.');
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!historyEntryData || typeof historyEntryData !== 'object' || Object.keys(historyEntryData).length === 0) {
    console.error('Error in POST /api/history: Invalid or empty request body.');
    return res.status(400).json({ message: 'Invalid or missing history entry data in request body.' });
  }

  try {
    console.log(`History data structure: ${JSON.stringify(Object.keys(historyEntryData))}`);
    console.log(`Results keys: ${historyEntryData.results ? JSON.stringify(Object.keys(historyEntryData.results)) : 'No results'}`);
    
    // Truncate large fields to prevent Firestore document size limits
    const sanitizedData = {
      ...historyEntryData,
      results: {
        ...historyEntryData.results,
        // Limit the size of these fields if they're too large
        analysisResult: historyEntryData.results?.analysisResult ? 
          (historyEntryData.results.analysisResult.length > 100000 ? 
            historyEntryData.results.analysisResult.substring(0, 100000) + '... [truncated]' : 
            historyEntryData.results.analysisResult) : 
          null,
        rawAnalysisResult: historyEntryData.results?.rawAnalysisResult ? 
          (historyEntryData.results.rawAnalysisResult.length > 100000 ? 
            historyEntryData.results.rawAnalysisResult.substring(0, 100000) + '... [truncated]' : 
            historyEntryData.results.rawAnalysisResult) : 
          null,
        promptSent: historyEntryData.results?.promptSent ? 
          (historyEntryData.results.promptSent.length > 100000 ? 
            historyEntryData.results.promptSent.substring(0, 100000) + '... [truncated]' : 
            historyEntryData.results.promptSent) : 
          null,
      }
    };

    const dataToSave = {
      ...sanitizedData,
      userId: userId, 
      timestamp: historyEntryData.timestamp ? new Date(historyEntryData.timestamp) : new Date(), 
    };

    console.log(`Sanitized data ready for Firestore, final size: ${JSON.stringify(dataToSave).length} bytes`);

    let docRef;
    try {
      docRef = await db.collection('userHistory').add(dataToSave);
      console.log(`History entry saved successfully for user ${userId} with ID: ${docRef.id}`);
    } catch (firestoreError) {
      console.error(`Firestore error saving history entry: ${firestoreError}`);
      throw firestoreError;
    }
    
    // Create a simple response that's not too large
    const responseData = { 
      message: `History entry saved successfully for user ${userId}`,
      entryId: docRef.id,
      data: {
        id: docRef.id 
      }
    };
    
    console.log(`Sending response: ${JSON.stringify(responseData)}`);
    return res.status(201).json(responseData);

  } catch (error: any) {
    console.error(`Error saving history entry for user ${userId}:`, error);
    return res.status(500).json({ 
      message: 'Failed to save history entry due to a server error.',
      error: error.message 
    });
  }
});

// POST /api/history/:id/chat - Add a chat message to an existing history entry
app.post('/api/history/:id/chat', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received POST /api/history/:id/chat request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;
  const messageData = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  if (!messageData || !messageData.type || !messageData.content) {
    return res.status(400).json({ message: 'Message data must include type and content.' });
  }

  try {
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'History entry not found.' });
    }

    const data = doc.data() as DocumentData;
    
    if (data?.userId !== userId) {
      return res.status(403).json({ message: 'Unauthorized. You can only update your own history entries.' });
    }

    // Create a new message with a timestamp
    const newMessage = {
      type: messageData.type,
      content: messageData.content,
      timestamp: new Date()
    };

    // Update the document to append the new message to the helpConversation array
    await docRef.update({
      'results.helpConversation': admin.firestore.FieldValue.arrayUnion(newMessage)
    });
    
    console.log(`Successfully added chat message to history entry ${entryId} for user ${userId}.`);
    res.status(200).json({ 
      message: 'Chat message added successfully.',
      entryId: entryId,
      chatMessage: newMessage
    });

  } catch (error) {
    console.error(`Error adding chat message to history entry ${entryId} for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to add chat message due to a server error.' });
  }
});

// PUT /api/history/:id/chat - Update entire chat history for a specific entry
app.put('/api/history/:id/chat', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received PUT /api/history/:id/chat request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;
  const { helpConversation } = req.body;

  if (!userId) {
    console.log('PUT ERROR: User ID not found after authentication');
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    console.log('PUT ERROR: History entry ID is required');
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  if (!helpConversation || !Array.isArray(helpConversation)) {
    console.log('PUT ERROR: Valid helpConversation array is required');
    return res.status(400).json({ message: 'Valid helpConversation array is required.' });
  }

  try {
    console.log(`Looking up document with ID: ${entryId} in collection 'userHistory'`);
    // Get the document to verify ownership
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`PUT ERROR: History entry ${entryId} not found. Doc doesn't exist.`);
      return res.status(404).json({ message: 'History entry not found.' });
    }

    const data = doc.data() as DocumentData;
    console.log(`Found entry with ID ${entryId}, updating chat history`);
    
    // Verify the entry belongs to the authenticated user
    if (data?.userId !== userId) {
      console.log(`PUT ERROR: Unauthorized attempt to update history entry ${entryId} by user ${userId}.`);
      console.log(`Entry belongs to user ${data?.userId}`);
      return res.status(403).json({ message: 'Unauthorized. You can only update your own history entries.' });
    }

    // Log the entry data for debugging
    console.log('Entry data before update:', {
      hasResults: !!data.results,
      resultsKeys: data.results ? Object.keys(data.results) : [],
      currentHelpConversation: data.results?.helpConversation || 'undefined'
    });

    // Prepare the update data
    const updateData = {
      'results.helpConversation': helpConversation
    };
    
    console.log('Updating with help conversation:', {
      conversationLength: helpConversation.length,
      firstMessageType: helpConversation.length > 0 ? helpConversation[0].type : 'none',
      lastMessageType: helpConversation.length > 0 ? helpConversation[helpConversation.length-1].type : 'none'
    });

    // Update the document with the new chat history
    await docRef.update(updateData);
    
    console.log(`Successfully updated chat history for entry ${entryId}`);
    res.status(200).json({ 
      message: 'Chat history updated successfully.',
      entryId: entryId
    });

  } catch (error) {
    console.error(`PUT ERROR: Error updating chat history for entry ${entryId}:`, error);
    res.status(500).json({ message: 'Failed to update chat history due to a server error.' });
  }
});

// DELETE /api/history - Clear history for the user
app.delete('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received DELETE /api/history request for user: ${req.user?.email}`);
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  try {
    console.log(`Attempting to delete history for user ${userId}...`);
    const query = db.collection('userHistory').where('userId', '==', userId);
    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log(`No history found to delete for user ${userId}.`);
      return res.status(200).json({ message: 'No history found to delete.' });
    }

    // Use a batched write to delete all documents efficiently
    const batch = db.batch();
    // Explicitly type 'doc' using Firestore types
    snapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    const deleteCount = snapshot.size;
    console.log(`Successfully deleted ${deleteCount} history entries for user ${userId}.`);
    res.status(200).json({ message: `Successfully deleted ${deleteCount} history entries.` });

  } catch (error) {
    console.error(`Error deleting history for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to delete history due to a server error.' });
  }
});

// DELETE /api/history/:id - Delete a specific history entry
app.delete('/api/history/:id', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received DELETE /api/history/:id request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;

  if (!userId) {
    console.log('DELETE ERROR: User ID not found after authentication');
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    console.log('DELETE ERROR: History entry ID is required');
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  try {
    console.log(`Looking up document with ID: ${entryId} in collection 'userHistory'`);
    // Get the document to verify ownership
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`DELETE ERROR: History entry ${entryId} not found. Doc doesn't exist.`);
      return res.status(404).json({ message: 'History entry not found.' });
    }

    const data = doc.data() as DocumentData;
    console.log(`Found entry with ID ${entryId}, data:`, data);
    
    // Verify the entry belongs to the authenticated user
    if (data?.userId !== userId) {
      console.log(`DELETE ERROR: Unauthorized attempt to delete history entry ${entryId} by user ${userId}.`);
      console.log(`Entry belongs to user ${data?.userId}`);
      return res.status(403).json({ message: 'Unauthorized. You can only delete your own history entries.' });
    }

    // Delete the document
    await docRef.delete();
    
    console.log(`Successfully deleted history entry ${entryId} for user ${userId}.`);
    res.status(200).json({ message: 'History entry deleted successfully.' });

  } catch (error) {
    console.error(`DELETE ERROR: Error deleting history entry ${entryId} for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to delete history entry due to a server error.' });
  }
});

// Debug endpoint to test Firebase connection - remove after confirming
app.get('/api/debug/firebase-test', async (req: Request, res: Response) => {
  try {
    // Attempt to access the userHistory collection
    const collectionRef = db.collection('userHistory');
    const snapshot = await collectionRef.limit(1).get();
    
    res.status(200).json({
      message: 'Firebase connection successful',
      isConnected: true,
      collectionExists: !!collectionRef,
      documentCount: snapshot.size
    });
  } catch (error) {
    console.error('Firebase connection test failed:', error);
    res.status(500).json({
      message: 'Firebase connection failed',
      isConnected: false,
      error: String(error)
    });
  }
});

// Debug endpoint to test JSON responses
app.post('/api/debug/json-test', (req: Request, res: Response) => {
  console.log('Debug JSON test received:', {
    bodySize: JSON.stringify(req.body).length,
    contentType: req.headers['content-type']
  });
  
  try {
    // Log the request body structure
    console.log('Request body keys:', Object.keys(req.body));
    
    // Attempt to process and return a simple response
    const testData = {
      message: 'JSON test successful',
      received: true,
      timestamp: new Date().toISOString(),
      data: { test: 'value' }
    };
    
    console.log('Sending response:', testData);
    res.status(200).json(testData);
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Internal server error', message: String(error) });
  }
});

// Global Error Handler (Example)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start Server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
}); 