import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer'; // For handling file uploads
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import fs from 'fs'; // Import file system module
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // To handle ES module paths

// Define __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') }); // Load .env file relative to this file

// --- Load Prompt Template --- 
let promptTemplate = '';
try {
  promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt_template.txt'), 'utf8');
  console.log('Prompt template loaded successfully.');
} catch (err) {
  console.error('Error reading prompt template file:', err);
  process.exit(1); // Exit if template can't be read
}
// ------------------------

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
    const requestedModelId = req.body.modelId || null; // Get requested model from client

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
    let data = [];
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

      // Parse file based on type
      if (fileName.endsWith('.csv')) {
        console.log('Parsing CSV file...');
        const fileContent = fileBuffer.toString('utf-8');
        const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
        if (parseResult.errors.length > 0) {
          console.error('CSV parsing errors:', parseResult.errors);
          return res.status(400).json({ error: 'Failed to parse CSV file.' });
        }
        data = parseResult.data;
        console.log('CSV parsed successfully.');
      } else if (fileName.endsWith('.xlsx')) {
        console.log('Parsing Excel file...');
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
        console.log('Excel parsed successfully.');
      } else {
        console.log('Unsupported file type.');
        return res.status(400).json({ error: 'Unsupported file type. Please upload CSV or XLSX.' });
      }

      // Convert parsed data to string for Gemini
      const dataString = JSON.stringify(data, null, 2);
      
      // Construct prompt from template and replace placeholders
      finalPrompt = promptTemplate
        .replace('{{fileName}}', fileName)
        .replace('{{dataString}}', dataString)
        .replace('{{tacticsString}}', tacticsString)
        .replace('{{kpisString}}', kpisString)
        .replace('{{currentSituation}}', currentSituation || 'Not provided')
        .replace('{{desiredOutcome}}', desiredOutcome || 'Not provided');
    }
    
    // Log the prompt sent to Gemini
    console.log('--- Prompt to Gemini ---');
    console.log(finalPrompt);
    console.log('--- End Prompt ---');
    
    // Determine which model to use
    // 1. Use requested modelId from the client if provided
    // 2. Otherwise fall back to environment variable
    // 3. If neither exists, use the default
    const envModelName = process.env.GEMINI_MODEL_NAME;
    const defaultModelName = 'gemini-2.5-pro-preview-03-25';
    const modelName = requestedModelId || envModelName || defaultModelName;
    
    // Configure provider-specific options
    let provider = 'google';
    if (modelName.includes('claude')) {
      provider = 'anthropic';
    } else if (modelName.includes('gpt')) {
      provider = 'openai';
    }
    
    console.log(`Using model: ${modelName} (provider: ${provider})`);
    
    // Use appropriate provider API
    let result;
    try {
      if (provider === 'google') {
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await callModelWithRetry(model, finalPrompt);
      } else {
        // For demonstration - in production you'd implement the other provider APIs
        console.log(`Using mock implementation for ${provider} provider`);
        // Mock implementation for other providers
        result = {
          response: {
            text: () => `<div class="analysis">
              <h2>Campaign Analysis (${provider} ${modelName})</h2>
              <p>This is a mock response for ${modelName} since the actual API integration is not implemented.</p>
              <p>In a production environment, this would call the ${provider} API with the appropriate model.</p>
              <h3>Implementation Guide</h3>
              <p>To implement this properly:</p>
              <ol>
                <li>Add the ${provider} API client library</li>
                <li>Configure authentication</li>
                <li>Make the appropriate API call</li>
              </ol>
            </div>`
          }
        };
      }
    } catch (error) {
      console.error('Error calling model:', error);
      return res.status(500).json({ error: `Error calling ${modelName}: ${error.message}` });
    }
    
    const response = await result.response;
    let htmlText = response.text();    
    console.log('Raw Gemini response:', htmlText); // Log raw response first

    // Remove ```html prefix and ``` suffix if present
    const prefix = '```html';
    const suffix = '```';
    if (htmlText.startsWith(prefix)) {
        htmlText = htmlText.substring(prefix.length);
    }
    if (htmlText.endsWith(suffix)) {
        htmlText = htmlText.substring(0, htmlText.length - suffix.length);
    }
    htmlText = htmlText.trim(); // Remove any leading/trailing whitespace

    console.log('Cleaned Gemini response (with HTML):', htmlText);

    // Extract raw text content from the CLEANED HTML
    const rawText = htmlText.replace(/<\/?[^>]+(>|$)/g, "");

    // Send cleaned response to client
    res.json({
      html: htmlText, // Send the cleaned HTML
      raw: rawText,
      prompt: finalPrompt, // Send the final generated prompt
      modelName: modelName // This sends the model name used in the API call
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
app.post('/get-help', express.json(), async (req, res) => {
  console.log('--- New request to /get-help ---');
  try {
    // Extract data from request
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

    // Basic validation
    if (!question) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    // Construct a new prompt for the follow-up question
    const helpPrompt = `
You are EmilioAI, a senior digital marketing analyst. You previously provided an analysis about a marketing campaign.

ORIGINAL DATA:
Tactic: ${tactic || 'Not specified'}
KPI: ${kpi || 'Not specified'}
${fileName ? `File: ${fileName}` : ''}
${currentSituation ? `Current Situation: ${currentSituation}` : ''}
${desiredOutcome ? `Desired Outcome: ${desiredOutcome}` : ''}

YOUR PREVIOUS ANALYSIS:
${originalAnalysis || 'No previous analysis available.'}

NEW QUESTION FROM THE USER:
${question}

INSTRUCTIONS:
1. Answer the user's question directly and specifically based on the marketing data and your previous analysis
2. Provide additional context, explanations, or recommendations as needed
3. Format your response in clean, structured HTML for proper display
4. Be concise but thorough
5. If the question pertains to something not covered in your original analysis, acknowledge this and provide your best assessment based on the available information
6. If the question requires data that wasn't included in the original analysis, explain what additional data would be helpful

FORMAT YOUR RESPONSE AS HTML, with proper headings, paragraphs, and lists as appropriate.
`;

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
