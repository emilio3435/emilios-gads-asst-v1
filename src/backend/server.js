import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer'; // For handling file uploads
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib'; // Replace pdf-parse with pdf-lib
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'; // Use pdfjs-dist
import * as dotenv from 'dotenv';
import fs from 'fs'; // Import file system module
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // To handle ES module paths

// Define __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') }); // Load .env file relative to this file

// Define industry-specific context data for Audacy
const audacyIndustryContext = {
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
function getIndustryContext(dataString, currentSituation) {
  // Industry detection keywords
  const industryKeywords = {
    retail: ['retail', 'store', 'shop', 'product', 'consumer', 'purchase', 'merchandise', 'inventory', 'sale', 'discount', 'ecommerce', 'customer'],
    automotive: ['automotive', 'car', 'vehicle', 'dealership', 'auto', 'dealer', 'drive', 'test drive', 'model', 'manufacturer'],
    entertainment: ['entertainment', 'movie', 'show', 'concert', 'event', 'stream', 'media', 'music', 'performance', 'festival', 'ticket'],
    financial: ['financial', 'bank', 'insurance', 'invest', 'finance', 'loan', 'mortgage', 'credit', 'wealth', 'money', 'banking'],
    b2b: ['b2b', 'business', 'solution', 'enterprise', 'corporate', 'company', 'professional', 'service', 'client', 'industry']
  };

  // Combine data and situation text for analysis
  const combinedText = (dataString || '') + ' ' + (currentSituation || '');
  const lowerCaseText = combinedText.toLowerCase();
  
  // Count keyword matches for each industry
  const industryCounts = {};
  
  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    industryCounts[industry] = 0;
    for (const keyword of keywords) {
      // Count occurrences of each keyword
      const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
      const matches = lowerCaseText.match(regex);
      if (matches) {
        industryCounts[industry] += matches.length;
      }
    }
  }
  
  // Find industry with most keyword matches
  let detectedIndustry = null;
  let maxCount = 0;
  
  for (const [industry, count] of Object.entries(industryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      detectedIndustry = industry;
    }
  }
  
  // Only return detected industry if we have a significant number of matches
  if (maxCount >= 1) {
    return audacyIndustryContext[detectedIndustry];
  }
  
  // Default to generic context if no clear industry detected
  return null;
}

// Create Express app
const app = express();
const DEFAULT_PORT = 5002;
const MAX_PORT_ATTEMPTS = 10;

// Middleware setup
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('Error: GEMINI_API_KEY is not defined in the .env file.');
  process.exit(1); // Exit if API key is missing
} else {
  // Log only the first few and last few characters for security
  console.log(`GEMINI_API_KEY loaded successfully: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`); 
}

const genAI = new GoogleGenerativeAI(apiKey);

// Helper function to call models with retry logic
async function callModelWithRetry(model, prompt, maxRetries = 5) {
  let retryCount = 0;
  let result;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`Attempt ${retryCount + 1} of ${maxRetries} to call API`);
      result = await model.generateContent(prompt);
      console.log('API call successful!');
      return result;
    } catch (error) {
      console.error(`Error on attempt ${retryCount + 1}:`, error);
      
      // If this is a 429 resource exhaustion error or a 503 unavailable error
      if (error.message && (error.message.includes('429') || error.message.includes('503'))) {
        retryCount++;
        
        if (retryCount >= maxRetries) {
          throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff with jitter
        const baseDelay = 1000; // 1 second
        const maxDelay = 30000; // 30 seconds
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, retryCount - 1));
        const jitter = delay * 0.1 * Math.random(); // Add 0-10% jitter
        const waitTime = delay + jitter;
        
        console.log(`Retrying in ${Math.round(waitTime / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        // For other errors, don't retry
        throw error;
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts`);
}

// POST endpoint for analyzing marketing data
app.post('/analyze', upload.single('file'), async (req, res) => {
  console.log('--- New request to /analyze ---');
  try {
    // Log incoming request data
    console.log('Request body:', req.body);
    console.log('File:', req.file ? req.file.originalname : 'No file uploaded');

    // Extract form data with defaults to avoid undefined errors
    const tacticsString = req.body.tactics ? JSON.parse(req.body.tactics) : '';
    const kpisString = req.body.kpis ? JSON.parse(req.body.kpis) : '';
    const currentSituation = req.body.currentSituation || '';
    const targetCPA = req.body.targetCPA || '';
    const targetROAS = req.body.targetROAS || '';
    const modelId = req.body.modelId || 'gemini-2.0-flash'; // Default to flash if not provided
    const outputDetail = req.body.outputDetail || 'detailed'; // Get output detail, default to detailed
    console.log(`Received outputDetail: ${outputDetail}`);

    // Determine model based on ID
    const allowedModels = [
      'gemini-2.5-pro-preview-03-25',
      'gemini-2.0-flash'
    ];

    let modelName;
    if (allowedModels.includes(modelId)) {
      modelName = modelId;
    } else {
      console.warn(`Requested model ${modelId} not allowed or invalid. Falling back to default.`);
      modelName = 'gemini-2.0-flash'; // Fallback to default
    }

    // Determine display name based on model used
    let displayModelName;
    switch (modelName) {
      case 'gemini-2.5-pro-preview-03-25':
        displayModelName = "Audacy AI (Gemini 2.5 Pro Preview)";
        break;
      case 'gemini-2.0-flash':
        displayModelName = "Audacy AI (Gemini 2.0 Flash)";
        break;
      default:
        displayModelName = "Audacy AI"; // Generic fallback
    }

    console.log(`Initializing model for analysis: ${modelName}`);
    
    // Initialize the model
    let result;
    let finalPrompt = ''; // Define finalPrompt here to be accessible in response
    let dataString = ''; // Initialize dataString here
    let fileName = req.file ? req.file.originalname : 'N/A'; // Get filename early

    try {
        const model = genAI.getGenerativeModel({ model: modelName });

        // --- Process Uploaded File --- 
        if (!req.file) {
            console.log('No file uploaded.');
            dataString = 'No file content provided.'; 
        } else {
            fileName = req.file.originalname;
            const fileBuffer = req.file.buffer;
            console.log(`Processing file: ${fileName}`);
            const lowerCaseFileName = fileName.toLowerCase();

            if (lowerCaseFileName.endsWith('.csv')) {
                // CSV Parsing logic...
                console.log('Parsing CSV file...');
                const fileContent = fileBuffer.toString('utf-8');
                const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
                if (parseResult.errors.length > 0) {
                    console.error('CSV parsing errors:', parseResult.errors);
                    throw new Error('Failed to parse CSV file.'); // Throw error to be caught
                }
                dataString = JSON.stringify(parseResult.data, null, 2);
                console.log('CSV parsed successfully.');
            } else if (lowerCaseFileName.endsWith('.xlsx')) {
                // XLSX Parsing logic...
                console.log('Parsing Excel file...');
                const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const excelData = XLSX.utils.sheet_to_json(worksheet);
                dataString = JSON.stringify(excelData, null, 2);
                console.log('Excel parsed successfully.');
            } else if (lowerCaseFileName.endsWith('.pdf')) {
                 // PDF Parsing logic...
                console.log('Parsing PDF file with pdfjs-dist...');
                try {
                    const workerSrcPath = path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;
                    const uint8Array = new Uint8Array(fileBuffer);
                    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
                    const pdfDoc = await loadingTask.promise;
                    console.log(`PDF loaded successfully. Pages: ${pdfDoc.numPages}`);
                    let fullText = '';
                    for (let i = 1; i <= pdfDoc.numPages; i++) {
                        const page = await pdfDoc.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map((item) => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    dataString = fullText.trim();
                    console.log(`PDF parsed successfully. Extracted ${dataString.length} characters.`);
                } catch (pdfError) {
                    console.error('PDF parsing error with pdfjs-dist:', pdfError);
                    let errorMessage = 'Failed to parse PDF file.';
                    if (pdfError instanceof Error) errorMessage += ` Details: ${pdfError.message}`;
                    throw new Error(errorMessage); // Throw error
                }
            } else {
                console.log('Unsupported file type.');
                throw new Error('Unsupported file type. Please upload CSV, XLSX, or PDF.'); // Throw error
            }
        }
        // --- End File Processing ---

        // --- Select and Read Prompt Template --- 
        let promptTemplatePath;
        if (outputDetail === 'brief') {
            promptTemplatePath = path.join(__dirname, 'prompt_template_brief.txt');
            console.log(`Using BRIEF prompt template: ${promptTemplatePath}`);
        } else { // Default to detailed
            promptTemplatePath = path.join(__dirname, 'prompt_template.txt');
            console.log(`Using DETAILED prompt template: ${promptTemplatePath}`);
        }
        let promptTemplateContent = await fs.promises.readFile(promptTemplatePath, 'utf-8');
        // --- End Select and Read --- 

        // --- Get Industry Context (AFTER processing file) ---
        const industryContext = getIndustryContext(dataString, currentSituation);
        console.log(`Detected industry context: ${industryContext ? Object.keys(audacyIndustryContext).find(key => audacyIndustryContext[key] === industryContext) : 'None'}`);
        // --- End Get Industry Context ---
        
        // --- Fill Prompt Placeholders --- 
        finalPrompt = promptTemplateContent; // Use the selected template
        finalPrompt = finalPrompt.replace('{{fileName}}', fileName); // fileName is set earlier
        finalPrompt = finalPrompt.replace('{{tacticsString}}', tacticsString || 'N/A');
        finalPrompt = finalPrompt.replace('{{kpisString}}', kpisString || 'N/A');
        finalPrompt = finalPrompt.replace('{{currentSituation}}', currentSituation || 'N/A');
        finalPrompt = finalPrompt.replace('{{desiredOutcome}}', 'N/A'); // Placeholder 
        finalPrompt = finalPrompt.replace('{{dataString}}', dataString); // Use processed dataString
        finalPrompt = finalPrompt.replace('{{industryContext}}', industryContext ? industryContext.contextDetails : 'General audio advertising context.');
        finalPrompt = finalPrompt.replace('{{industryTips}}', industryContext ? industryContext.specificTips.map(tip => `- ${tip}`).join('\n') : 'Focus on standard audio campaign best practices.');
        // --- End Fill Placeholders ---

        // --- Log the final prompt before sending --- 
        console.log("=================================================================================");
        console.log("FINAL PROMPT BEING SENT TO MODEL:");
        console.log("----------------------------------------------------------------------------------");
        console.log(finalPrompt);
        console.log("=================================================================================");
        // --- End Log --- 

        // Call the model
        result = await callModelWithRetry(model, finalPrompt);
    
    } catch (error) {
      // Catch errors from file processing or model call
      console.error('Error during analysis processing or model call:', error);
      // Ensure a response is sent even on error
      // Check if headers are already sent before sending response
      if (!res.headersSent) {
           if (error instanceof Error && error.message.includes('Unsupported file type')) {
               return res.status(400).json({ error: error.message });
           } else if (error instanceof Error && error.message.includes('Failed to parse')) {
               return res.status(400).json({ error: error.message });
           } else {
                return res.status(500).json({ error: `Server error during analysis step: ${error.message}` });
           }
      }
      // If headers were sent, we can't send another response, just log
       console.error('Headers already sent, could not send error response to client.');
       return; // Stop further processing in this catch block
    } // End of outer try block
    
    // --- Process Model Response (Ensure this runs ONLY if model call was successful) ---
    if (!result) {
        console.error("Model result is undefined, cannot proceed to process response.");
        if (!res.headersSent) {
             return res.status(500).json({ error: 'Model did not return a result.' });
        }
        return;
    }

    try {
        const response = await result.response;
        const fullResponseText = response.text();
        console.log('Raw Gemini response:', fullResponseText);

        // --- Parse the response based on delimiters --- 
        let htmlAnalysis = '';
        let rawText = ''; // For the text version of the HTML analysis

        const htmlMatch = fullResponseText.match(/---HTML_ANALYSIS_START---([\s\S]*?)---HTML_ANALYSIS_END---/);
        if (htmlMatch && htmlMatch[1]) {
            htmlAnalysis = htmlMatch[1].trim();
            // Optional: Remove ```html tags if they still appear within the block
            const prefix = '```html';
            const suffix = '```';
            if (htmlAnalysis.startsWith(prefix)) {
                htmlAnalysis = htmlAnalysis.substring(prefix.length);
            }
            if (htmlAnalysis.endsWith(suffix)) {
                htmlAnalysis = htmlAnalysis.substring(0, htmlAnalysis.length - suffix.length);
            }
            htmlAnalysis = htmlAnalysis.trim();
            rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, ""); // Extract raw text from HTML
        } else {
            console.warn('Could not find HTML analysis part in response. Using full response as fallback.');
            // Fallback: Assume the whole response is HTML if delimiters are missing
            htmlAnalysis = fullResponseText.trim(); 
             rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, "");
        }
        // --------------------------------------------

        console.log('Cleaned Gemini response (HTML):', htmlAnalysis);

        // Send structured response to client
        // Ensure response is sent only once
        if (!res.headersSent) {
            res.json({
                html: htmlAnalysis, // The main HTML analysis
                raw: rawText,       // Raw text version of the HTML analysis
                prompt: finalPrompt,  // Send the final generated prompt
                modelName: displayModelName  // Send the display model name (Audacy branded) instead of actual model name
            });
            console.log('Response sent to client.');
        }
    } catch (responseProcessingError) {
        console.error('Error processing model response:', responseProcessingError);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Server error processing analysis response', details: responseProcessingError.message });
        }
    }
    // --- End Process Model Response ---

  } catch (outerError) {
    // Catch errors from initial setup or logic outside the main try block
    console.error('--- Outer Error in /analyze --- ');
    console.error(outerError);
    if (!res.headersSent) {
         res.status(500).json({ error: 'Server error during analysis setup', details: outerError.message });
    }
  }
});

// POST endpoint for getting follow-up help
app.post('/get-help', upload.single('contextFile'), async (req, res) => {
  console.log('--- New request to /get-help ---');
  try {
    // Extract data from the request body (now coming from form-data)
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
      modelId // Extract modelId from the request
    } = req.body;

    const contextFile = req.file; // Get the uploaded file

    console.log('--- Help Request Received ---');
    console.log('Question:', question);
    console.log('Conversation History JSON:', conversationHistoryJson);
    // console.log('Context File:', contextFile ? contextFile.originalname : 'None');

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
          // Configure PDF.js worker
          pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          const pdfDoc = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
          }
          additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n${fullText.trim()}`;
        } else {
          additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n[Unsupported file type for direct processing]`;
        }
        console.log('Processed additional context from file.');
      } catch (fileError) {
        console.error(`Error processing help context file ${contextFile.originalname}:`, fileError);
        additionalContext = `\n\n--- Additional Context File (${contextFile.originalname}) ---\n[Error processing file: ${fileError.message}]`;
      }
    }

    // Format previous conversation if provided
    let previousConversationFormatted = '';
    try {
      const conversationHistory = req.body.conversationHistory ? 
        JSON.parse(req.body.conversationHistory) : [];
      
      if (conversationHistory && conversationHistory.length > 0) {
        // Remove the check for only the current message
        // Always use conversation history
        const previousMessages = conversationHistory.slice(0, -1);
        
        if (previousMessages.length > 0) {
          previousConversationFormatted = "===== CONVERSATION HISTORY =====\n";
          previousMessages.forEach(message => {
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
    
    // Add campaign context if available
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

    // NEW Streamlined Prompt
    const promptForHelp = `You are a helpful AI assistant specializing in digital marketing analytics for Audacy. Your goal is to help users understand their marketing campaign data.

${previousConversationFormatted}${campaignContext}${additionalContext ? `===== ADDITIONAL CONTEXT =====\n${additionalContext}\n===== END ADDITIONAL CONTEXT =====\n\n` : ''}
CURRENT QUESTION: ${req.body.question}

`; // Removed response guidelines

    // Enhanced logging for debugging prompt issues
    console.log("=================================================================================");
    console.log("HELP PROMPT BEING SENT TO MODEL:");
    console.log("----------------------------------------------------------------------------------");
    console.log(promptForHelp);
    console.log("=================================================================================");

    // Validate the requested model ID
    const allowedModels = [
      'gemini-2.5-pro-preview-03-25',
      'gemini-2.0-flash' // Removed flash-preview earlier
    ];
    let helpModelId = 'gemini-2.0-flash'; // Default fallback
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
    
    // Enhanced logging for debugging response issues
    console.log("=================================================================================");
    console.log("RAW RESPONSE FROM MODEL:");
    console.log("----------------------------------------------------------------------------------");
    console.log(responseText);
    console.log("=================================================================================");

    res.json({ response: responseText });
  } catch (error) {
    console.error('--- Error in /get-help ---');
    console.error(error);
    res.status(500).json({ error: 'Server error while getting help', details: error.message });
  }
});

// Function to find an available port
const findAvailablePort = async (startPort, maxAttempts) => {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    try {
      await new Promise((resolve, reject) => {
        const server = app.listen(port)
          .once('error', reject)
          .once('listening', () => {
            server.close();
            resolve();
          });
      });
      return port;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      console.log(`Port ${port} is in use, trying another one...`);
    }
  }
  throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
};

// Start server with port fallback logic
const startServer = async () => {
  try {
    const port = await findAvailablePort(DEFAULT_PORT, MAX_PORT_ATTEMPTS);
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Initialize server
startServer();

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('--- Uncaught Exception ---');
  console.error(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- Unhandled Rejection ---');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
});
