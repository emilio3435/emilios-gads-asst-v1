import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Create Express app
const app = express();
const port = 5000;

// Middleware setup
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY is not set in .env file.');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(apiKey);

// Default prompt for client-friendly explanations
const defaultPrompt = "You are Emilio’s AE, explaining complex digital marketing results to clients in relatable terms without making them feel dumb. Use simple language and analogies where possible.";

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

    let prompt;
    let data = [];

    if (!req.file) {
      // Handle no file uploaded
      console.log('No file uploaded. Instructing Gemini to return error message.');
      prompt = "No file was uploaded for analysis. Please respond with exactly this message: 'please upload file for analysis'.";
    } else {
      // Process uploaded file
      const fileName = req.file.originalname;
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
      console.log('Parsed data:', dataString);

      // Construct prompt with file data and form inputs
      prompt = `Analyze the following digital marketing campaign data from the file "${fileName}":\n\n`;
      prompt += `Data:\n${dataString}\n\n`;
      prompt += `Tactics: ${tactics.join(', ')}\n`;
      prompt += `KPIs: ${kpis.join(', ')}\n`;
      prompt += `Current Situation: ${currentSituation}\n`;
      prompt += `Desired Outcome: ${desiredOutcome}\n\n`;
      prompt += defaultPrompt;
    }

    // Log the prompt sent to Gemini
    console.log('--- Prompt to Gemini ---');
    console.log(prompt);
    console.log('--- End Prompt ---');

    // Call Gemini API
    const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash';
    console.log(`Using Gemini model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Gemini response:', text);

    // Send response to client
    res.json({
      analysis: text,
      prompt: prompt,
      modelName: modelName
    });
    console.log('Response sent to client.');

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
