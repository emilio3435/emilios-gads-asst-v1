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
Analyze the provided campaign data and generate a comprehensive report.

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

1.  **Understand the Goal:** Based on the selected tactic, KPIs, current situation, and desired outcome, identify the primary objective of the analysis.
2.  **Analyze the Data:**
    *   Thoroughly examine the provided data (\`{{dataString}}\`).
    *   Identify key trends, patterns, outliers, and potential issues related to the selected KPIs and tactic.
    *   Calculate relevant summary statistics or metrics if applicable (e.g., total spend, average CTR, conversion rate, ROAS).
3.  **Generate Insights:** Explain the findings clearly. What does the data reveal about the campaign's performance concerning the goals? Highlight both positive and negative aspects.
4.  **Provide Strategic Recommendations:** Based on the analysis, offer specific, actionable recommendations. Format these using appropriate HTML headings (\`<h2>\`, \`<h3>\`) and bullet points (\`<ul>\`, \`<li>\`) for clarity.
    *   Keep recommendations directly relevant to achieving the desired outcome.
    *   Explain the rationale behind each recommendation in clear, conversational language.
5.  **Structure the Output:** Organize the analysis into logical sections using clear headings (<h2>, <h3>, etc.) and paragraphs (<p>). Use lists (<ul>, <ol>, <li>) for itemized information where appropriate. Ensure the entire analysis output is valid HTML suitable for direct rendering in a web application.
6.  **Consider the Tactic:** Tailor the analysis and recommendations specifically to the selected digital tactic (\`{{tacticsString}}\`). If the tactic is "SEM", focus on keywords, ad groups, bids, quality score, etc. If "Display", focus on placements, creatives, targeting, frequency.
7.  **Data Table (Optional but Recommended):** If presenting summary data or specific data points in a table is beneficial, generate data for a table. Format this data as a JSON array of objects enclosed in \`---TABLE_DATA_START---\` and \`---TABLE_DATA_END---\`. Each object in the array represents a row, with keys as column headers (e.g., \`[{ "Campaign": "X", "Spend": 100, "Conversions": 5 }, { ... }]\`). If no table is suitable, omit this section including the delimiters.
8.  **Tone:** Maintain a professional, analytical, and helpful tone.
9. **Output Delimiters:** Ensure the final output contains the primary analysis formatted as HTML enclosed in \`---HTML_ANALYSIS_START---\` and \`---HTML_ANALYSIS_END---\`. Place the optional table data section *after* the HTML section if included.

**Final Output Structure Example:**

---HTML_ANALYSIS_START---
<h2>Analysis Summary</h2>
<p>Overall findings...</p>
<h2>Detailed Findings</h2>
<h3>Performance Metric 1</h3>
<p>Details...</p>
<ul><li>Point 1</li><li>Point 2</li></ul>
<h2>Strategic Recommendations</h2>
<h3>Recommendation Title 1</h3>
<p>Explanation...</p>
<ul><li>Actionable step 1 (e.g., Short-term: Implement X)</li><li>Actionable step 2 (e.g., Long-term: Integrate Y)</li></ul>
<h3>Recommendation Title 2</h3>
<p>Explanation...</p>
<ul><li>Actionable step 1</li></ul>
---HTML_ANALYSIS_END---

---TABLE_DATA_START---
[ ... table data JSON array ... ]
---TABLE_DATA_END---

Now, perform the analysis based on the provided data and instructions.
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
    let tableData = [];
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

        const tableMatch = fullResponseText.match(/---TABLE_DATA_START---([\s\S]*?)---TABLE_DATA_END---/);
        if (tableMatch && tableMatch[1]) {
            try {
                tableData = JSON.parse(tableMatch[1].trim());
                console.log('Parsed Table Data:', tableData);
            } catch (jsonError) {
                console.error('Error parsing table JSON data:', jsonError);
                console.error('Problematic table JSON string:', tableMatch[1].trim());
                tableData = []; // Send empty array on parse failure
            }
        } else {
            console.warn('Could not find table data part in response.');
        }

    } catch (parsingError) {
        console.error('Error parsing response sections:', parsingError);
        // Use the full response as HTML as a fallback if parsing fails catastrophically
        htmlAnalysis = fullResponseText.trim();
        rawText = htmlAnalysis.replace(/<\/?[^>]+(>|$)/g, "");
        tableData = [];
    }
    // --------------------------------------------

    console.log('Cleaned Gemini response (HTML):', htmlAnalysis);
    console.log('Final Table Data:', tableData);

    // Send structured response to client
    res.json({
      html: htmlAnalysis, // The main HTML analysis
      raw: rawText,       // Raw text version of the HTML analysis
      tableData: tableData, // Parsed table data JSON
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
        // Get all messages except the most recent user message (which is the current question)
        const previousMessages = conversationHistory.slice(0, -1);
        
        if (previousMessages.length > 0) {
          previousConversationFormatted = "PREVIOUS CONVERSATION:\n";
          previousMessages.forEach(message => {
            const textContent = message.content.replace(/<\/?[^>]+(>|$)/g, "");
            const role = message.type === 'user' ? 'User' : 'You (EmilioAI)';
            previousConversationFormatted += `${role}: ${textContent}\n\n`;
          });
        }
      }
    } catch (error) {
      console.error('Error formatting conversation history:', error);
      previousConversationFormatted = '';
    }

    const promptForHelp = `You are EmilioAI, a helpful assistant working with the Audacy Campaign Performance Analysis tool. The user is asking for help related to their analysis. 

RESPOND IN VALID HTML FORMAT. Wrap paragraphs in <p> tags, use <ul> and <li> for lists, and <strong> for emphasis. Do not use markdown formatting like # or **. 

User Question: ${req.body.question}

${additionalContext ? `Additional Context from Uploaded File: ${additionalContext}\n\n` : ''}${previousConversationFormatted}

FORMAT INSTRUCTIONS:
1. Answer the user's question directly and concisely.
2. Format your response with proper HTML elements:
   - Use <h3> tags for section headings
   - Use <p> tags for paragraphs
   - Use <ul> and <li> tags for lists
   - Use <strong> for emphasis

3. When providing strategic recommendations:
   <h3>Strategic Recommendations</h3>
   <p>[Optional introductory text explaining the recommendations]</p>
   
   <h4>Recommendation: [Title of First Recommendation]</h4>
   <p>[Explanation of the recommendation]</p>
   <ul>
     <li>Increase bid adjustments for top-performing keywords by 15-20%</li>
     <li>Review negative keyword list and expand it with irrelevant search terms</li>
   </ul>

   <h4>Recommendation: [Title of Second Recommendation]</h4>
   <p>[Explanation of the recommendation]</p>
   <ul>
     <li>Specific action to take</li>
     <li>Another specific action to take</li>
   </ul>

4. IMPORTANT: NEVER use robotic-sounding prefixes such as:
   - "Recommendation X:"
   - "Action/Aspect X:" 
   - "Short-term:" or "Long-term:" as standalone labels
   - Any numbering scheme like "Action 1:", "Step 2:", etc.

5. Instead, use proper HTML heading structure and natural language bullet points.

Respond in a friendly, helpful manner. If you don't know the answer, acknowledge that and suggest what might help.`;

    console.log("Help prompt:", promptForHelp);

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
    
    console.log('Raw help response from Gemini:', responseText);

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
