# EmilioAI: Digital Campaign Analysis Tool

A powerful web application for analyzing digital marketing campaign data, providing data-driven insights and recommendations based on selected tactics and KPIs.

## Overview

EmilioAI is designed to replicate the expertise of a Digital Sales Manager. It analyzes digital marketing campaign data, providing clear insights and actionable recommendations. The tool supports various digital tactics (SEM, SEO, Display Ads, etc.) and KPIs (ROAS, CPA, CTR, etc.).

## Features

- **Campaign Data Analysis**: Upload campaign data in CSV or XLSX format for in-depth analysis
- **Tactic-Specific Insights**: Get insights tailored to specific digital marketing tactics
- **KPI-Focused Recommendations**: Receive recommendations aligned with your selected KPIs  
- **Interactive UI**: User-friendly interface with easy-to-understand results
- **Export Options**: Export analysis as RTF or directly to Gmail
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React with TypeScript, HTML, CSS
- **Backend**: Node.js with Express
- **AI Integration**: Google Gemini AI for intelligent data analysis
- **File Parsing**: CSV and XLSX file processing
- **Export Functionality**: HTML to RTF conversion

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository
   ```
   git clone https://github.com/emilio3435/emilios-gads-asst-v1.git
   cd emilios-gads-asst-v1
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the project root with your Google Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   GEMINI_MODEL_NAME=gemini-1.5-pro-latest
   ```
   You can get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   
   Available models:
   - `gemini-1.5-pro-latest` (Default - Better analysis quality, more detailed responses)
   - `gemini-1.5-flash-latest` (Faster responses, good for most analyses)
   - `gemini-1.0-pro` (Previous generation model)
   - `gemini-1.0-ultra` (Previous generation most capable model)

4. Start the development server
   ```
   npm run dev
   ```

5. Access the application at [http://localhost:5173](http://localhost:5173)

## Usage

1. Upload your campaign data file (CSV or XLSX)
2. Select the digital tactic (SEM, SEO, Display, etc.)
3. Choose the KPI you want to focus on
4. Optionally provide current situation and desired outcome
5. Click "Analyze" to generate insights
6. View the results and export as needed

## Customizing the AI Prompt

The AI prompt template is stored in `src/backend/prompt_template.txt`. You can modify this file to adjust how the AI interprets and analyzes your data.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Google Gemini AI for powering the analysis engine
- React team for the frontend framework
- Express team for the backend framework
