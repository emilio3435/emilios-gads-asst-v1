import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import Papa from 'papaparse'; // Correct import
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

// --- Add global error handlers ---
process.on('uncaughtException', (error, origin) => {
  console.error('----- Uncaught Exception -----');
  console.error(error);
  console.error('Origin:', origin);
  process.exit(1); // Exit loudly
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('----- Unhandled Rejection -----');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  // process.exit(1); // Consider exiting on unhandled rejections too
});
// ---------------------------------

try {
  console.log('Loading environment variables...');
  dotenv.config(); // Load environment variables first
  console.log('Environment variables loaded.');

  const app = express();
  const port = 5000;

  console.log('Configuring middleware...');
  app.use(cors());
  app.use(express.json());
  console.log('Middleware configured.');

  // Configure Multer
  console.log('Configuring Multer...');
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });
  console.log('Multer configured.');

  // Initialize Gemini API
  console.log('Initializing Gemini API...');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is not set.');
    process.exit(1); // Exit if API key is missing
  }
  let genAI;
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('Gemini API initialized successfully.');
  } catch (geminiError) {
    console.error('----- Error Initializing Gemini -----');
    console.error(geminiError);
    process.exit(1); // Exit if Gemini init fails
  }


  // Define the route
  console.log('Defining /analyze route...');
  app.post('/analyze', upload.single('file'), async (req, res) => {
    console.log('--- Request received at /analyze ---');
    try {
      console.log('Request body:', req.body);
      console.log('File received:', req.file ? req.file.originalname : 'No file');

      if (!req.file) {
        console.log("Validation Error: No file uploaded.");
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let data = []; // Initialize data array
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      console.log("Parsing file: " + fileName); // Replaced template literal with string concatenation

      // --- Check file type and parse accordingly ---
      if (fileName.endsWith('.csv')) {
        console.log("Parsing as CSV...");
        const fileContent = fileBuffer.toString('utf-8');
        const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
         if (parseResult.errors.length > 0) {
             console.error("CSV Parsing Errors:", parseResult.errors);
             // throw new Error('Failed to parse CSV file.');
         }
        data = parseResult.data;
        console.log("CSV parsed successfully.");
      } else if (fileName.endsWith('.xlsx')) {
        console.log("Parsing as XLSX...");
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
        console.log("XLSX parsed successfully.");
      } else {
        console.log("Unsupported file type.");
        return res.status(400).json({ error: 'Unsupported file type. Please upload CSV or XLSX.' });
      }
      // --------------------------------------------

      const tactics = JSON.parse(req.body.tactics);
      const kpis = JSON.parse(req.body.kpis);
      console.log("Received tactics:", tactics);
      console.log("Received kpis:", kpis);

      console.log("Creating prompt for Gemini...");
      const prompt = "Analyze the following marketing data (provided as a JSON array):\n" + JSON.stringify(data) + "\n\nI am focusing on the following tactics: " + tactics.join(', ') + " and the following KPIs: " + kpis.join(', ') + ".\n\nProvide a concise analysis and recommendations based ONLY on the data provided."; // Replaced template literal with string concatenation

      console.log("Sending prompt to Gemini...");
      // --- Read model name from environment variable ---
      const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash'; // Use env var or default
      console.log("Using Gemini model: " + modelName); // Log the model name being used
      const model = genAI.getGenerativeModel({ model: modelName });
      // ---------------------------------------------
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      console.log("Received response from Gemini.");

      console.log("Sending response to frontend...");
      res.json({ analysis: text });
      console.log("Response sent successfully.");

    } catch (error) {
      console.error('----- Error within /analyze route -----');
      console.error(error); // Log the actual error
      res.status(500).json({ error: 'Error during analysis', details: error.message });
    }
  });
  console.log('/analyze route defined.');

  // Start the server
  console.log("Attempting to listen on host 0.0.0.0 port " + port + "..."); // Replaced template literal with string concatenation
  app.listen(port, '0.0.0.0', () => {
    console.log("Backend server successfully listening on host 0.0.0.0 port " + port); // Replaced template literal with string concatenation
    console.log('Server is now ready to accept connections.');
  }).on('error', (error) => {
    console.error('----- Server Startup Error -----');
    console.error("Failed to start server on port " + port); // Replaced template literal with string concatenation
    console.error(error);
    process.exit(1);
  });

} catch (initializationError) {
  console.error('----- Initialization Error -----');
  console.error('An error occurred during server setup before listening.');
  console.error(initializationError);
  process.exit(1);
}

console.log('End of server.js script reached (before async operations complete).');
