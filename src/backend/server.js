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
Analyze the provided campaign data and generate a user-friendly, actionable analysis for Audacy sales representatives.

// ==========================
// == INPUT DATA & CONTEXT ==
// ==========================

INPUT DATA:
* File Name: {{fileName}}
* Selected Tactic: {{tacticsString}}
* Selected KPIs: {{kpisString}}
* Current Situation/Goal: {{currentSituation}}
* Desired Outcome/Goal: {{desiredOutcome}}
* Data Content:
    \`\`\`json
    {{dataString}}
    \`\`\`

AUDACY BRAND & SALES CONTEXT:
You are an AI assistant for Audacy - a premier multi-platform audio content and entertainment company.
Audacy combines the power of radio, podcasting, digital, experiential, and premium live events to create meaningful connections with consumers. Audacy sales representatives work with clients across industries to develop effective advertising campaigns that span both traditional radio and digital audio channels.

CLIENT SALES ASSISTANT ROLE:
You are analyzing this data for an Audacy Account Executive (AE) who needs to interpret digital marketing data for clients. Your goal is to help the AE demonstrate the value of Audacy's advertising solutions and identify opportunities to expand or improve current campaigns. Focus on insights that showcase Audacy's unique value proposition in the audio marketing landscape.

// ===================
// == INSTRUCTIONS ===
// ===================

INSTRUCTIONS:

Your analysis MUST be:

1.  Simple and Digestible:
    * Use plain language, avoiding technical jargon.
    * When using marketing terms, briefly explain them (use simple analogies where possible).
    * Use Audacy-specific terminology where appropriate.

2.  Structured in these exact sections (using the HTML structure defined below):
    * Executive Summary: (1-2 sentences max) Simple takeaway highlighting Audacy's value.
    * Key Findings: (3-5 bullet points max) Important insights connected to Audacy's audio solutions.
    * Story Angles: (2-3 hooks) Narrative ideas connecting data to client goals, using simple analogies or metaphors where helpful for clarity (e.g., comparing reach to casting a wide net).
    * Supporting Data: Brief, critical metrics with context (e.g., "3.1% CTR, 2x industry average").
    * Actionable Recommendations: (3-5 suggestions) Clear, step-by-step actions leveraging Audacy's capabilities. Each MUST include WHAT, WHY, and HOW.

3.  Action-Oriented:
    * Focus on actionable improvements.
    * Recommendations SHOULD aim to:
        * Suggest Audacy's audio marketing solutions where applicable and aligned with client goals/situation.
        * Suggest cross-platform opportunities (radio + digital).
        * Be specific (e.g., "add these 3 interest categories," not "improve targeting").
        * Be practical (implementable by Audacy team).
        * Be prioritized (indicate likely impact).
        * Be contextual (explain why it matters for campaign goals).

4.  Formatted STRICTLY as HTML:
    * Generate output enclosed ONLY within the '---HTML_ANALYSIS_START---' and '---HTML_ANALYSIS_END---' delimiters.
    * Use ONLY standard HTML tags (e.g., <section>, <h2>, <p>, <ul>, <li>, <div>, <h3>, <strong>, <em>) for ALL structure, layout, and text emphasis.
    * DO NOT use ANY Markdown syntax (like **, *, -, #) within the generated HTML content. All formatting must be done with HTML tags.
    * Ensure the output is clean, valid HTML suitable for direct rendering.
    * Use short paragraphs and bullet points (using <ul> and <li>) for scannability.

5.  Client-Ready:
    * AE should be able to use the analysis directly with clients without translation.

// ===========================
// == OUTPUT HTML STRUCTURE ==
// ===========================

OUTPUT STRUCTURE REQUIREMENTS:
Format your output using ONLY the HTML structure and tags defined below. Ensure all content resides within appropriate tags. DO NOT include markdown.

---HTML_ANALYSIS_START---
<section class="executive-summary">
  <h2>Executive Summary</h2>
  <p>[1-2 sentence plain language summary that incorporates Audacy's value]</p>
</section>

<section class="key-findings">
  <h2>Key Findings</h2>
  <ul>
    <li>[Clear, simple finding #1 connecting to Audacy's solutions]</li>
    <li>[Clear, simple finding #2 connecting to Audacy's solutions]</li>
    </ul>
</section>

<section class="story-angles">
  <h2>Potential Story Angle(s)</h2>
  <div class="story">
    <h3>[Audacy-specific story title 1]</h3>
    <p>[Simple narrative connecting data to client goals, using a helpful analogy/metaphor if applicable]</p>
  </div>
  <div class="story">
    <h3>[Audacy-specific story title 2]</h3>
    <p>[Simple narrative connecting data to client goals, using a helpful analogy/metaphor if applicable]</p>
  </div>
  </section>

<section class="supporting-data">
  <h2>Supporting Data</h2>
  <ul>
    <li>[Key metric 1 with context and Audacy insights, e.g., <strong>Metric Name:</strong> Value (Context)]</li>
    <li>[Key metric 2 with context and Audacy insights, e.g., <strong>Metric Name:</strong> Value (Context)]</li>
    </ul>
</section>

<section class="recommendations">
  <h2>Actionable Recommendations</h2>
  <div class="recommendation">
    <h3>[Audacy-specific recommendation title 1, possibly indicating impact like (High Impact)]</h3>
    <p>[Why this matters in simple terms, with Audacy-specific value]</p>
    <ul>
      <li><strong>WHAT:</strong> Specific action to take using Audacy capabilities</li>
      <li><strong>WHY:</strong> Expected outcome / benefit</li>
      <li><strong>HOW:</strong> How Audacy's team can implement this</li>
    </ul>
  </div>
  <div class="recommendation">
    <h3>[Audacy-specific recommendation title 2, possibly indicating impact like (Medium Impact)]</h3>
    <p>[Why this matters in simple terms, with Audacy-specific value]</p>
    <ul>
      <li><strong>WHAT:</strong> Specific action to take using Audacy capabilities</li>
      <li><strong>WHY:</strong> Expected outcome / benefit</li>
      <li><strong>HOW:</strong> How Audacy's team can implement this</li>
    </ul>
  </div>
  </section>
---HTML_ANALYSIS_END---

// ===============
// == FINAL CHECK ==
// ===============

Ensure your analysis delivers meaningful, easy-to-understand insights focused on what the Audacy AE can actually do with this information to improve results and drive more business, adhering STRICTLY to the specified HTML format without any markdown.
`;

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
          const workerSrcPath = path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'); // Corrected path
          // console.log('Worker source path:', workerSrcPath); // Debug log
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;

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

      // After processing the file and before constructing the prompt
      // Detect industry context based on data content
      const industryContext = getIndustryContext(dataString, currentSituation);
      let industryContextString = '';
      
      if (industryContext) {
        console.log('Detected industry context:', Object.keys(audacyIndustryContext).find(key => audacyIndustryContext[key] === industryContext));
        
        // Format industry context for prompt
        industryContextString = `
**Industry-Specific Context:**
${industryContext.contextDetails}

**Audacy Industry Tips:**
${industryContext.specificTips.map(tip => `- ${tip}`).join('\n')}
`;
      }

      // Construct prompt from template and replace placeholders
      finalPrompt = promptTemplate
        .replace('{{fileName}}', fileName)
        .replace('{{dataString}}', dataString)
        .replace('{{tacticsString}}', tacticsString)
        .replace('{{kpisString}}', kpisString)
        .replace('{{currentSituation}}', currentSituation || 'Not provided')
        .replace('{{desiredOutcome}}', desiredOutcome || 'Not provided');
        
      // Add industry context if detected
      if (industryContextString) {
        // Add industry context before the Output Structure Requirements section
        const outputSectionMarker = "**Output Structure Requirements:**";
        if (finalPrompt.includes(outputSectionMarker)) {
          finalPrompt = finalPrompt.replace(
            outputSectionMarker,
            `${industryContextString}\n\n${outputSectionMarker}`
          );
        } else {
          // Append to the end if marker not found
          finalPrompt += `\n\n${industryContextString}`;
        }
      }
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
