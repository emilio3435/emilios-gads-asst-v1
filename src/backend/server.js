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

// Async function to check available models
async function checkAvailableModels() {
  try {
    console.log('Attempting to get available models...');
    // Note: This is an example - the actual API might not support this method directly
    // You may need to check Google Generative AI API documentation for the correct method
    const models = await genAI.getModels();
    console.log('Available models:', models);
    return models;
  } catch (error) {
    console.error('Error getting available models:', error.message);
    return null;
  }
}

// Try to check available models (this may not work depending on the API implementation)
checkAvailableModels().catch(error => {
  console.log('Could not check available models:', error.message);
});

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
    
    // Call Gemini API
    const envModelName = process.env.GEMINI_MODEL_NAME;
    const defaultModelName = 'gemini-2.5-pro-preview-03-25';
    const modelName = envModelName || defaultModelName;
    
    console.log(`Environment variable GEMINI_MODEL_NAME is set to: ${envModelName ? envModelName : 'not set'}`);
    console.log(`Default model name is: ${defaultModelName}`);
    console.log(`Final model being used is: ${modelName}`);
    
    const model = genAI.getGenerativeModel({ model: modelName });
    console.log(`Model initialized with: ${modelName}`);
    
    // Add retry logic with exponential backoff for API calls
    const maxRetries = 5;
    let retryCount = 0;
    let result;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`Attempt ${retryCount + 1} of ${maxRetries} to call Gemini API with model: ${modelName}`);
        result = await model.generateContent(finalPrompt);
        console.log('API call successful!');
        break; // If successful, exit the loop
      } catch (error) {
        console.error(`Error on attempt ${retryCount + 1}:`, error);
        
        // Check if this is a model-not-found error
        if (error.message && error.message.includes('not found')) {
          console.error(`The specified model '${modelName}' was not found or is not available.`);
          // Try using a fallback model if the specified one doesn't exist
          if (modelName === 'gemini-2.5-pro-preview-03-25') {
            const fallbackModel = 'gemini-1.5-pro-latest';
            console.log(`Attempting to use fallback model: ${fallbackModel}`);
            try {
              const fallbackModelInstance = genAI.getGenerativeModel({ model: fallbackModel });
              result = await fallbackModelInstance.generateContent(finalPrompt);
              console.log(`Successfully used fallback model: ${fallbackModel}`);
              break;
            } catch (fallbackError) {
              console.error(`Error using fallback model: ${fallbackError.message}`);
            }
          }
        }
        
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
          // For other errors, show more details but still retry
          console.error('Detailed error:', JSON.stringify(error, null, 2));
          retryCount++;
          
          if (retryCount >= maxRetries) {
            throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
          }
          
          // Use a simple backoff for other errors
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
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
      modelName: modelName, // This sends the model name used in the API call
      actualModelUsed: result.modelName || modelName // Try to get the actual model name from the response if available
    });

    console.log('Response sent to client with model:', modelName);
  } catch (error) {
    // Handle errors (e.g., JSON parsing, file parsing, API call)
    console.error('--- Error in /analyze ---');
    console.error(error);
    res.status(500).json({ error: 'Server error during analysis', details: error.message });
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
