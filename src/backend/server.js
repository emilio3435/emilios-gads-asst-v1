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

// Define the prompt template (moved up for clarity)
// Note: Enhanced instructions for Strategic Recommendations formatting
const promptTemplate = `
Analyze the provided campaign data and generate a user-friendly, actionable analysis.

**Input Data:**
*   **File Name:** {{fileName}}
*   **Selected Tactic:** {{tacticsString}}
*   **Selected KPIs:** {{kpisString}}
*   **Current Situation/Goal:** {{currentSituation}}
*   **Desired Outcome/Goal:** {{desiredOutcome}}
*   **Data Content:**
    \`\`\`json
    {{dataString}}
    \`\`\`

**Instructions:**

You are analyzing this data for an Account Executive (AE) with a radio advertising background who needs to interpret the digital marketing data for clients. Your analysis MUST be:

1. **Simple and Digestible:** Use plain language that avoids technical jargon. When you must use a digital marketing term, briefly explain it in parentheses using radio terminology when possible.

2. **Structured in these exact sections:**
   * **Executive Summary:** (1-2 sentences max) Summarize key takeaway in the simplest possible terms.
   * **Key Findings:** (3-5 bullet points max) List the most important insights in clear, simple language.
   * **Story Angles:** Suggest 2-3 specific narrative hooks connecting data to client goals that the AE can use when speaking with clients. Use radio analogies where applicable (e.g., "Just like how drive-time radio ads reach commuters, these mobile ads reached users during peak shopping hours").
   * **Supporting Data:** Briefly list only the most critical metrics that back up your findings. Present numbers in context (e.g., "3.1% CTR, which is 2x the industry average").
   * **Actionable Recommendations:** Provide 3-5 clear, specific, step-by-step suggestions to improve results. Each MUST include WHAT to do, WHY it would help, and HOW to implement it.

3. **Action-Oriented:** Focus on what can be done differently to improve performance. Recommendations should be:
   * Specific (not "improve targeting" but "add these 3 interest categories to your audience")
   * Practical (can be implemented without extensive technical knowledge)
   * Prioritized (indicate which actions will likely have the biggest impact)
   * Contextual (explain why each recommendation matters for the campaign's goals)

4. **Formatted:** Use clear HTML formatting. Use short paragraphs, bullet points, and simple tables when needed. Make the output highly scannable.

5. **Client-Ready:** The AE should be able to use your analysis directly with clients without further translation or interpretation.

**Output Structure Requirements:**
Format your output with structured HTML that aligns with each of the sections described above.

---HTML_ANALYSIS_START---
<section class="executive-summary">
  <h2>Executive Summary</h2>
  <p>[1-2 sentence plain language summary]</p>
</section>

<section class="key-findings">
  <h2>Key Findings</h2>
  <ul>
    <li>[Clear, simple finding #1]</li>
    <li>[Clear, simple finding #2]</li>
    <!-- 3-5 bullet points maximum -->
  </ul>
</section>

<section class="story-angles">
  <h2>Potential Story Angle(s)</h2>
  <div class="story">
    <h3>[Story Title 1]</h3>
    <p>[Simple narrative that connects data to client goals with radio analogy]</p>
  </div>
  <div class="story">
    <h3>[Story Title 2]</h3>
    <p>[Simple narrative that connects data to client goals with radio analogy]</p>
  </div>
</section>

<section class="supporting-data">
  <h2>Supporting Data</h2>
  <ul>
    <li>[Key metric 1 with context]</li>
    <li>[Key metric 2 with context]</li>
    <!-- Focus on clarity over comprehensiveness -->
  </ul>
</section>

<section class="recommendations">
  <h2>Actionable Recommendations</h2>
  <div class="recommendation">
    <h3>[Recommendation Title 1]</h3>
    <p>[Why this matters in simple terms]</p>
    <ul>
      <li>Specific action to take</li>
      <li>Expected outcome</li>
      <li>How to implement</li>
    </ul>
  </div>
  <!-- Repeat for 3-5 recommendations -->
</section>
---HTML_ANALYSIS_END---

Ensure your analysis delivers meaningful, easy-to-understand insights focused on what the AE can actually do with this information to improve results.
`;

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
    const tactics = req.body.tactics ? JSON.parse(req.body.tactics) : [];
    const kpis = req.body.kpis ? JSON.parse(req.body.kpis) : [];
    const currentSituation = req.body.currentSituation || 'Not provided';
    const desiredOutcome = req.body.desiredOutcome || 'Not provided';
    // Extract modelId from the request, default to a stable model if not provided
    const requestedModelId = req.body.modelId || 'gemini-2.0-flash'; // Changed default

    let tacticsString = '';
    if (Array.isArray(tactics)) {
      tacticsString = tactics.join(', ');
    } else {
      tacticsString = tactics;
    }

    let kpisString = '';
    if (Array.isArray(kpis)) {
      kpisString = kpis.join(', ');
    } else {
      kpisString = kpis;
    }

    let finalPrompt;
    let dataString = ''; // Initialize dataString
    let fileName = 'N/A'; // Default file name if none uploaded

    if (!req.file) {
      // Handle no file uploaded
      console.log('No file uploaded. Using specific no-file prompt.');
      // Keep the specific no-file prompt logic if desired, or adapt the template
      finalPrompt = "No file was uploaded for analysis. Please respond with exactly this message: 'please upload file for analysis'.";
    } else {
      // Process uploaded file
      fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;
      console.log(`Processing file: ${fileName}`);

      // Parse file based on type (case-insensitive check)
      const lowerCaseFileName = fileName.toLowerCase();

      if (lowerCaseFileName.endsWith('.csv')) {
        console.log('Parsing CSV file...');
        const fileContent = fileBuffer.toString('utf-8');
        const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
        if (parseResult.errors.length > 0) {
          console.error('CSV parsing errors:', parseResult.errors);
          return res.status(400).json({ error: 'Failed to parse CSV file.' });
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
        console.log('Excel parsed successfully.');
      } else if (lowerCaseFileName.endsWith('.pdf')) {
        console.log('Parsing PDF file with pdfjs-dist...');
        try {
          // Configure pdfjs-dist worker (important for Node.js environment)
          // Note: Adjust the path if your node_modules structure is different
          const workerSrcPath = path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
          // console.log('Worker source path:', workerSrcPath); // Debug log
          // pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;

          // Load the PDF document
          // Convert the Node.js Buffer from Multer to a Uint8Array for pdfjs-dist
          const uint8Array = new Uint8Array(fileBuffer);
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array }); // Pass Uint8Array
          const pdfDoc = await loadingTask.promise;
          console.log(`PDF loaded successfully. Pages: ${pdfDoc.numPages}`);

          let fullText = '';
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item) => item.str).join(' ');
            fullText += pageText + '\n'; // Add newline between pages
          }
          
          dataString = fullText.trim(); // Assign extracted text
          
          // Log extracted text length for confirmation
          console.log(`PDF parsed successfully. Extracted ${dataString.length} characters.`);

        } catch (pdfError) {
          console.error('PDF parsing error with pdfjs-dist:', pdfError);
          // Provide a more informative error message
          let errorMessage = 'Failed to parse PDF file.';
          if (pdfError instanceof Error) {
            errorMessage += ` Details: ${pdfError.message}`;
            if (pdfError.message.includes('Setting up fake worker failed') || pdfError.message.includes('pdf.worker.mjs')) {
                 errorMessage += ' Check if the pdf.worker.mjs path is correct for your environment.';
             }
          }
          return res.status(400).json({ error: errorMessage });
        }
      } else {
        console.log('Unsupported file type.');
        return res.status(400).json({ error: 'Unsupported file type. Please upload CSV, XLSX, or PDF.' });
      }

      // Construct prompt from template and replace placeholders
      finalPrompt = promptTemplate
        .replace('{{fileName}}', fileName)
        .replace('{{dataString}}', dataString) // dataString now contains JSON string or PDF text
        .replace('{{tacticsString}}', tacticsString)
        .replace('{{kpisString}}', kpisString)
        .replace('{{currentSituation}}', currentSituation || 'Not provided')
        .replace('{{desiredOutcome}}', desiredOutcome || 'Not provided');
    }
    
    // Log the prompt sent to Gemini
    console.log('--- Prompt to Gemini ---');
    console.log(finalPrompt);
    console.log('--- End Prompt ---');
    
    // --- Use the requested model ID --- 
    const allowedModels = [
        'gemini-2.5-pro-preview-03-25',
        'gemini-2.0-flash'
    ];

    let modelName;
    if (allowedModels.includes(requestedModelId)) {
        modelName = requestedModelId;
    } else {
        console.warn(`Requested model ${requestedModelId} not allowed or invalid. Falling back to default.`);
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
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      result = await callModelWithRetry(model, finalPrompt);
    } catch (error) {
      console.error('Error calling model:', error);
      return res.status(500).json({ error: `Error calling ${modelName}: ${error.message}` });
    }
    
    const response = await result.response;
    const fullResponseText = response.text();
    console.log('Raw Gemini response:', fullResponseText);

    // --- Parse the response based on delimiters --- 
    let htmlAnalysis = '';
    let rawText = ''; // For the text version of the HTML analysis

    try {
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
            console.warn('Could not find HTML analysis part in response.');
            // Fallback: Assume the whole response is HTML if delimiters are missing
            htmlAnalysis = fullResponseText.trim(); 
            rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, "");
        }
    } catch (parsingError) {
        console.error('Error parsing response sections:', parsingError);
        // Use the full response as HTML as a fallback if parsing fails catastrophically
        htmlAnalysis = fullResponseText.trim();
        rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, "");
    }
    // --------------------------------------------

    console.log('Cleaned Gemini response (HTML):', htmlAnalysis);

    // Send structured response to client
    res.json({
      html: htmlAnalysis, // The main HTML analysis
      raw: rawText,       // Raw text version of the HTML analysis
      prompt: finalPrompt,  // Send the final generated prompt
      modelName: displayModelName  // Send the display model name (Audacy branded) instead of actual model name
    });

    console.log('Response sent to client.');
  } catch (error) {
    // Handle errors (e.g., JSON parsing, file parsing, API call)
    console.error('--- Error in /analyze ---');
    console.error(error);
    res.status(500).json({ error: 'Server error during analysis', details: error.message });
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

RESPONSE GUIDELINES:
Answer first, answer clearly. Keep it brief and directly address the user's question. Use HTML only (no <html> / <body> tags).

Purpose         Tag
Section heading <h3>
Sub-heading     <h4>
Paragraph       <p>
Bullet list     <ul><li>
Emphasis        <strong>

Strategic Advice (when needed):
Use this exact format:
<h3>Strategic Recommendations</h3>
<h4>[Recommendation Title]</h4>
<p>[Why & how it helps.]</p>
<ul>
  <li>[Specific action 1.]</li>
  <li>[Specific action 2.]</li>
</ul>

Tone & Style:
Friendly, professional, natural language. Skip robotic labels (e.g., "Recommendation 1:", "Action 2:"). Do not use numbered action prefixes.

If you don't know the answer, say so and suggest what information would help.`;

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
