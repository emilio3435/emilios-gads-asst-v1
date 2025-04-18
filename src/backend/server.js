import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer'; // For handling file uploads
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib'; // Replace pdf-parse with pdf-lib
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
4.  **Provide Strategic Recommendations:** Based on the analysis, offer specific, actionable recommendations.
    *   **Formatting for Strategic Recommendations:**
        *   Use a main heading (like \`<h2>\`) for "Strategic Recommendations".
        *   For *each* individual recommendation:
            *   Use a sub-heading (like \`<h3>\`) for the recommendation's title (e.g., "Optimize 'Boost Checking' Campaign").
            *   Use clear paragraphs (\`<p>\`) for any introductory or explanatory text for the recommendation.
            *   Use bullet points (\`<ul>\` and \`<li>\`) for specific, actionable steps related to that recommendation.
            *   **NEVER use any of these robotic-sounding prefixes** in your text:
                * "Action/Aspect X:" 
                * "Recommendation X Title:"
                * "Short-term:" or "Long-term:" as standalone labels
                * Any numbering scheme like "Action 1:", "Step 2:", etc.
            *   Instead, write in natural language. For example, instead of "Action 1: Increase bid adjustments", write "• Increase bid adjustments for top-performing keywords by 15-20%"
            *   If timing is relevant, integrate it naturally: "• Implement a new testing strategy within the next 30 days" instead of "Short-term: Implement testing"
    *   Keep recommendations directly relevant to achieving the desired outcome.
    *   Explain the rationale behind each recommendation in clear, conversational language.
5.  **Structure the Output:** Organize the analysis into logical sections using clear headings (<h2>, <h3>, etc.) and paragraphs (<p>). Use lists (<ul>, <ol>, <li>) for itemized information where appropriate. Ensure the entire analysis output is valid HTML suitable for direct rendering in a web application.
6.  **Consider the Tactic:** Tailor the analysis and recommendations specifically to the selected digital tactic (\`{{tacticsString}}\`). If the tactic is "SEM", focus on keywords, ad groups, bids, quality score, etc. If "Display", focus on placements, creatives, targeting, frequency.
7.  **Data Visualization (Optional but Recommended):** If the data lends itself to visualization (e.g., time series, comparisons), generate data suitable for a simple chart (e.g., bar, line). Format this data as a JSON object enclosed in \`---CHART_DATA_START---\` and \`---CHART_DATA_END---\`. The JSON should follow a format usable by charting libraries like Chart.js (e.g., \`{ labels: [...], datasets: [{ label: '...', data: [...] }] }\`). If no chart is suitable, omit this section including the delimiters.
8.  **Data Table (Optional but Recommended):** If presenting summary data or specific data points in a table is beneficial, generate data for a table. Format this data as a JSON array of objects enclosed in \`---TABLE_DATA_START---\` and \`---TABLE_DATA_END---\`. Each object in the array represents a row, with keys as column headers (e.g., \`[{ "Campaign": "X", "Spend": 100, "Conversions": 5 }, { ... }]\`). If no table is suitable, omit this section including the delimiters.
9.  **Tone:** Maintain a professional, analytical, and helpful tone.
10. **Output Delimiters:** Ensure the final output contains the primary analysis formatted as HTML enclosed in \`---HTML_ANALYSIS_START---\` and \`---HTML_ANALYSIS_END---\`. Place the optional chart and table data sections *after* the HTML section if included.

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

---CHART_DATA_START---
{ ... chart data JSON ... }
---CHART_DATA_END---

---TABLE_DATA_START---
[ ... table data JSON array ... ]
---TABLE_DATA_END---

Now, perform the analysis based on the provided data and instructions.
`;

// Create Express app
const app = express();
const port = 5002;

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
        console.log('Parsing PDF file...');
        try {
          // Load PDF with pdf-lib
          const pdfDoc = await PDFDocument.load(fileBuffer);
          
          // Get total pages
          const pageCount = pdfDoc.getPageCount();
          console.log(`PDF has ${pageCount} pages`);
          
          // We can't directly extract text with pdf-lib, so we'll send page info
          dataString = `PDF file with ${pageCount} pages. File name: ${fileName}`;
          
          // Add metadata info if available
          const { title, author, subject, keywords, creator } = pdfDoc.getTitle() ? 
            { 
              title: pdfDoc.getTitle() || 'N/A', 
              author: pdfDoc.getAuthor() || 'N/A',
              subject: pdfDoc.getSubject() || 'N/A',
              keywords: pdfDoc.getKeywords() || 'N/A',
              creator: pdfDoc.getCreator() || 'N/A'
            } : 
            { title: 'N/A', author: 'N/A', subject: 'N/A', keywords: 'N/A', creator: 'N/A' };
            
          if (title !== 'N/A') {
            dataString += `\nTitle: ${title}`;
          }
          if (author !== 'N/A') {
            dataString += `\nAuthor: ${author}`;
          }
          if (subject !== 'N/A') {
            dataString += `\nSubject: ${subject}`;
          }
          
          console.log('PDF parsed successfully (metadata only).');
        } catch (pdfError) {
          console.error('PDF parsing error:', pdfError);
          return res.status(400).json({ error: 'Failed to parse PDF file.', details: pdfError.message });
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
        'gemini-2.5-flash-preview',
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
        case 'gemini-2.5-flash-preview':
            displayModelName = "Audacy AI (Gemini 2.5 Flash Preview)";
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
    let chartData = {};
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

        const chartMatch = fullResponseText.match(/---CHART_DATA_START---([\s\S]*?)---CHART_DATA_END---/);
        if (chartMatch && chartMatch[1]) {
            try {
                chartData = JSON.parse(chartMatch[1].trim());
                console.log('Parsed Chart Data:', chartData);
            } catch (jsonError) {
                console.error('Error parsing chart JSON data:', jsonError);
                console.error('Problematic chart JSON string:', chartMatch[1].trim());
                chartData = {}; // Send empty object on parse failure
            }
        } else {
            console.warn('Could not find chart data part in response.');
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
        chartData = {};
        tableData = [];
    }
    // --------------------------------------------

    console.log('Cleaned Gemini response (HTML):', htmlAnalysis);
    console.log('Final Chart Data:', chartData);
    console.log('Final Table Data:', tableData);

    // Send structured response to client
    res.json({
      html: htmlAnalysis, // The main HTML analysis
      raw: rawText,       // Raw text version of the HTML analysis
      chartData: chartData, // Parsed chart data JSON
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
    // Extract data from request (now coming from form-data)
    const {
      originalPrompt,
      originalAnalysis,
      question,
      tactic,
      kpi,
      fileName,
      currentSituation,
      desiredOutcome,
      modelId
    } = req.body;

    // Get additional context file if uploaded
    const contextFile = req.file;
    let additionalContext = '';

    // Basic validation
    if (!question) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    // Get conversation history
    const conversationHistory = req.body.conversationHistory ? 
      JSON.parse(req.body.conversationHistory) : [];
    
    // Check if this is a follow-up question (conversation history already exists)
    const isFollowUp = conversationHistory && conversationHistory.length > 0;
    
    let helpPrompt = '';
    
    if (isFollowUp) {
      // For follow-up questions, just send the question directly without additional context
      // This ensures unmodified interaction with the model after the initial prompt
      helpPrompt = question;
      
      console.log('Follow-up question detected - sending direct question without additional context');
    } else {
      // Process the context file if provided (only for initial question)
      if (contextFile) {
        console.log(`Context file uploaded: ${contextFile.originalname}`);
        
        try {
          // Handle different file types
          if (contextFile.originalname.endsWith('.csv')) {
            // Parse CSV
            const csvData = contextFile.buffer.toString('utf8');
            additionalContext = `\nADDITIONAL CONTEXT (CSV):\n${csvData}\n`;
            console.log('CSV context file processed successfully');
          } 
          else if (contextFile.originalname.endsWith('.xlsx')) {
            // For XLSX, we can only use basic info
            additionalContext = `\nADDITIONAL CONTEXT:\nAn Excel file named "${contextFile.originalname}" was provided for additional context.\n`;
            console.log('XLSX context noted (cannot process detailed content)');
          }
          else if (contextFile.originalname.endsWith('.pdf')) {
            additionalContext = `\nADDITIONAL CONTEXT:\nA PDF file named "${contextFile.originalname}" was provided for additional context.\n`;
            console.log('PDF context noted (cannot process detailed content)');
          }
        } catch (fileError) {
          console.error('Error processing context file:', fileError);
          additionalContext = `\nADDITIONAL CONTEXT:\nA file named "${contextFile.originalname}" was provided, but could not be fully processed.\n`;
        }
      }
      
      // For initial question, construct a rich prompt with all context
      helpPrompt = `
You are EmilioAI, a senior digital marketing analyst. You previously provided an analysis about a marketing campaign.

ORIGINAL DATA:
Tactic: ${tactic || 'Not specified'}
KPI: ${kpi || 'Not specified'}
${fileName ? `File: ${fileName}` : ''}
${currentSituation ? `Current Situation: ${currentSituation}` : ''}
${desiredOutcome ? `Desired Outcome: ${desiredOutcome}` : ''}

YOUR PREVIOUS ANALYSIS:
${originalAnalysis || 'No previous analysis available.'}
${additionalContext}
NEW QUESTION FROM THE USER:
${question}

FORMAT YOUR RESPONSE AS HTML, with proper headings, paragraphs, and lists as appropriate.
`;
    }

    console.log('--- Help Prompt to Gemini ---');
    console.log(helpPrompt);
    console.log('--- End Help Prompt ---');

    // Determine which model to use
    const envModelName = process.env.GEMINI_MODEL_NAME;
    const defaultModelName = 'gemini-2.5-pro-preview-03-25';
    const modelName = modelId || envModelName || defaultModelName;
    
    // Configure provider-specific options  
    let provider = 'google';
    if (modelName.includes('claude')) {
      provider = 'anthropic';
    } else if (modelName.includes('gpt')) {
      provider = 'openai';
    }
    
    console.log(`Using model for help: ${modelName} (provider: ${provider})`);
    
    // Use appropriate provider API
    let result;
    try {
      if (provider === 'google') {
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await callModelWithRetry(model, helpPrompt, 3);
      } else {
        // Mock implementation for other providers
        console.log(`Using mock implementation for ${provider} provider`);
        result = {
          response: {
            text: () => `<div class="help-response">
              <h2>Follow-up Answer (${provider} ${modelName})</h2>
              <p>This is a mock response for ${modelName} since the actual API integration is not implemented.</p>
              <p>In a production environment, this would use the ${provider} API with the appropriate model to answer your question.</p>
            </div>`
          }
        };
      }
    } catch (error) {
      console.error('Error calling model for help:', error);
      return res.status(500).json({ error: `Error calling ${modelName}: ${error.message}` });
    }

    const response = await result.response;
    let htmlText = response.text();
    console.log('Raw Gemini help response:', htmlText);

    // Check if the response is wrapped in markdown code blocks
    const prefix = '```html';
    const suffix = '```';
    if (htmlText.startsWith(prefix)) {
        htmlText = htmlText.substring(prefix.length);
    }
    if (htmlText.endsWith(suffix)) {
        htmlText = htmlText.substring(0, htmlText.length - suffix.length);
    }
    htmlText = htmlText.trim();

    console.log('Cleaned Gemini help response:', htmlText);

    // Extract raw text content from the HTML
    const rawText = htmlText.replace(/<\/?[^>]+(>|$)/g, "");

    // Send response to client
    res.json({
      html: htmlText,
      raw: rawText,
      modelName: modelName
    });

    console.log('Help response sent to client.');
  } catch (error) {
    console.error('--- Error in /get-help ---');
    console.error(error);
    res.status(500).json({ error: 'Server error while getting help', details: error.message });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
}).on('error', (error) => {
  console.error('--- Server startup error ---');
  console.error(error);
  process.exit(1);
});

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
