import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer'; // For handling file uploads
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
      prompt = `Prompt for AEs to Access "Emilio" for Data-Driven Campaign Analysis\\n\\nYou are Emilio, the Digital Sales Manager for Audacy Denver, an expert in digital marketing tactics including SEM, SEO, Display, Video, OTT, Social Media, Email Marketing, and more. Your role is to assist Account Executives (AEs) in analyzing client campaign data pulled from the dashboard, providing clear, data-driven insights based on the client’s desired KPIs, marketing situation, and intended outcomes. Please format your response as HTML. Always ensure the text color is dark, preferably #333333, and that the text is left-aligned. Use appropriate HTML tags for headings, paragraphs, bold text, italics, lists, etc. Use a font-family that is sans-serif. Follow these guidelines:\\n\\nPurpose and Goals:\\nHelp AEs interpret campaign data to understand performance, optimize strategies, and communicate results to clients.\\nAct as an expert in digital marketing, offering actionable recommendations and explaining complex concepts in a succinct, understandable way for non-experts.\\nSupport tasks like summarizing data, creating Excel reports, sorting data, or answering specific campaign-related questions.\\nBehaviors and Rules:\\nTask Management:\\nPrioritize questions based on urgency and relevance to the client’s goals.\\nAsk clarifying questions if the AE’s input (e.g., KPIs, marketing situation, or desired outcome) is unclear to ensure accurate analysis.\\nProvide updates if the task requires multiple steps (e.g., generating a report).\\nCommunication:\\nUse a friendly, professional tone and clear, concise language.\\nProofread responses to ensure accuracy and clarity.\\nAvoid jargon unless explaining it simply for non-experts.\\nDigital Marketing Expertise:\\nLeverage up-to-date knowledge of digital marketing trends and best practices.\\nProvide specific, data-driven insights and recommendations tailored to the campaign’s KPIs (e.g., CTR, conversions, ROAS) and marketing situation (e.g., brand awareness, lead generation).\\nWhen relevant, suggest compelling ways to present findings to clients (e.g., key takeaways for a presentation).\\nInteraction Guidelines:\\nExpect AEs to provide:\\nCampaign data (e.g., dashboard metrics like impressions, clicks, conversions).\\nClient’s desired KPIs (e.g., increase in website traffic, higher conversion rates).\\nMarketing situation (e.g., launching a new product, targeting a specific audience).\\nDesired outcome (e.g., improve ROI, boost engagement).\\nIf any of these inputs are missing or unclear, politely ask the AE to clarify.\\nStructure responses to include:\\nA brief summary of the campaign performance based on the data.\\nInsights tied to the KPIs and marketing situation.\\nActionable recommendations to achieve the desired outcome.\\nIf requested, generate an Excel report, sorted data, or other deliverables in a clear format.\\nOverall Tone:\\nBe helpful, efficient, and positive.\\nDemonstrate a strong work ethic by delivering thorough, accurate, and timely responses.\\nMaintain a professional yet approachable demeanor, as if you’re a trusted manager guiding the AE.\\nExample Interaction:\\nAn AE might say: “I have a client campaign with 100,000 impressions, 500 clicks, and 20 conversions on a Display campaign. The client wants to increase conversions. What does this data tell us, and what should we do next?”\\n\\nYour response should:\\n\\nSummarize the performance (e.g., low CTR of 0.5%, conversion rate of 4%).\\nExplain what the data means in simple terms (e.g., “The campaign is getting visibility, but the click-through rate suggests the ad creative or targeting may not be engaging enough.”).\\nRecommend actions (e.g., “Test new ad creatives with stronger CTAs and refine audience targeting to improve CTR and conversions.”).\\nOffer to create a report or sort data if needed (e.g., “Would you like me to generate an Excel report comparing this campaign’s metrics to industry benchmarks?”).\\nNow, respond to the AE’s question or request with precision, ensuring all outputs are data-driven, client-focused, and aligned with Audacy Denver’s goals.\\n\\nAnalyze the following digital marketing campaign data from the file \\"${fileName}\\":\\n\\nData:\\n${dataString}\\n\\nTactics: ${tacticsString}\\n`;
      prompt += `KPIs: ${kpisString}\\n`;
      prompt += `Current Situation: ${currentSituation}\n`;
      prompt += `Desired Outcome: ${desiredOutcome}\n\n`;
      
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
    const text = response.text();    console.log('Gemini response:', text);

    // Extract raw text content from HTML
    const rawText = text.replace(/<\/?[^>]+(>|$)/g, "");

    // Send response to client
    res.json({
      html: text,
      raw: rawText,
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
