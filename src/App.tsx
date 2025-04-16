import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'; // Import necessary components
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';
import audacyLogo from './assets/audacy-logo.png';

// New component to display prompt details and analysis
function AnalysisDetails() {
  const location = useLocation();
  const { prompt, modelName, analysisResult, finalPrompt } = location.state || {}; // Destructure finalPrompt

  return (
    <div className="analysis-details-container">
      <Link to="/" className="back-button">Back to Form</Link> {/* Link to go back */}
      <h2>Analysis Details</h2>
        <h3>Original Prompt:</h3>
        <pre className="prompt-text">{prompt}</pre> {/* Display original prompt */}
      <h3>Complete Prompt Sent to LLM:</h3>
      <pre className="prompt-text">{finalPrompt}</pre> {/* Display the final prompt */}
      <h3>Model Used:</h3>
      <p>{modelName}</p>
      <h3>Analysis Output:</h3>
      <div className="analysis-result">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
      </div>
    </div>
  );
}

// Main App component
function App() {
  const [selectedTactics, setSelectedTactics] = useState<string[]>([]);
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSituation, setCurrentSituation] = useState<string>('');
  const [desiredOutcome, setDesiredOutcome] = useState<string>('');
    const [prompt, setPrompt] = useState<string | null>(null); // new state
    const [modelName, setModelName] = useState<string | null>(null); // new state
    const [finalPrompt, setFinalPrompt] = useState<string | null>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAnalysisResult(null); // Clear previous results
    setError(null); // Clear previous errors
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
      setFileName(event.target.files[0].name); // Update file name state
    } else {
      setFile(null);
      setFileName(null); // Clear file name if no file selected
    }
  };

  const handleTacticChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    // For single select dropdown
    setSelectedTactics([event.target.value]);
  };

  const handleKPIChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
     // For single select dropdown
    setSelectedKPIs([event.target.value]);
  };

  // --- New handler functions for text areas ---
  const handleSituationChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentSituation(event.target.value);
  };

  const handleOutcomeChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDesiredOutcome(event.target.value);
  };
  // -------------------------------------------

   const handleSubmit = async () => {
    console.log("handleSubmit called");
    setError(null); // Clear previous errors
    setAnalysisResult(null); // Clear previous results

    // Use the current value from the select elements for validation
    const currentTactic = (document.querySelector('.tactics-list') as HTMLSelectElement)?.value;
    const currentKPI = (document.querySelector('.kpi-list') as HTMLSelectElement)?.value;


    if (!file || !currentTactic || !currentKPI) {
      const missing = [];
      if (!file) missing.push("file");
      if (!currentTactic) missing.push("tactic");
      if (!currentKPI) missing.push("KPI");
      const errorMessage = `Please select a ${missing.join(', ')}.`;
      console.error(errorMessage);
      setError(errorMessage); // Show error message in UI
      return;
    }

    console.log("file:", file);
    console.log("selectedTactics:", selectedTactics);
    console.log("selectedKPIs:", selectedKPIs);
    // --- Include text area values in the log ---
    console.log("currentSituation:", currentSituation);
    console.log("desiredOutcome:", desiredOutcome);
    // -----------------------------------------

    const formData = new FormData();
    formData.append('file', file);
    formData.append('tactics', JSON.stringify(selectedTactics));
    formData.append('kpis', JSON.stringify(selectedKPIs));
    // --- Append text area values to FormData ---
    formData.append('currentSituation', currentSituation);
    formData.append('desiredOutcome', desiredOutcome);
    // ------------------------------------------
    // Note: You can't easily log FormData directly in the console
    console.log("formData prepared, sending...");

    setIsLoading(true); // Start loading indicator

    try {
      // --- Fetch URL Changed Here ---
      const response = await fetch('/api/analyze', { // Using relative path for Vite proxy
        method: 'POST',
        body: formData,
      });
      console.log("response:", response);

      if (!response.ok) {
        // Try to get error message from backend response body
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.details || errorData.error || errorDetails;
        } catch (e) {
          // Could not parse JSON error response
        }
        throw new Error(errorDetails);
      }

      const data = await response.json();
      console.log("data:", data);
      // Make sure data.analysis is a string before setting
      setAnalysisResult(typeof data.analysis === 'string' ? data.analysis : JSON.stringify(data.analysis));
            // --- Store prompt and model name in state ---
      setPrompt(data.prompt); // Assuming your backend sends the prompt back
      setModelName(data.modelName); // Assuming your backend sends the model name back
      setFinalPrompt(data.finalPrompt)
      // --------------------------------------------
      } catch (error) {
      console.error('Error during analysis:', error);
      setError(error.message || 'An unexpected error occurred.'); // Show error in UI
    } finally {
      setIsLoading(false); // Stop loading indicator
    }
  };

  return (
    <div className="App">
      <img src={audacyLogo} alt="Audacy Logo" className="audacy-logo" /> {/* Audacy logo */}
      <h1>Marketing Assistant</h1> {/* This will now be purple */}
      <input
        type="file"
        id="fileInput"
        accept=".csv, .xlsx" // Limit to CSV and XLSX
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <label htmlFor="fileInput" className="choose-file-button rounded-element">
        Choose File
      </label>
      {fileName && <p className="file-name">Selected File: {fileName}</p>} {/* Show file name if selected */}
      <br />

      {/* --- Added 'required' attribute --- */}
      <div className='select-container'>
      <select
        className="tactics-list" // Removed rounded-element class
        value={selectedTactics[0] || ''} // Control component for single select
        onChange={handleTacticChange}
        required // Make selection mandatory
      >
        <option value="" disabled>Select Tactic</option> {/* Default/disabled option */}
        {/* Tactic options */}
        <option value="SEM">SEM</option>
        <option value="SEO">SEO</option>
        <option value="Display Ads">Display Ads</option>
        <option value="Video Display Ads">Video Display Ads</option>
        <option value="YouTube">YouTube</option>
        <option value="OTT">OTT</option>
        <option value="Social Ads">Social Ads</option>
        <option value="Email eDirect">Email eDirect</option>
        <option value="Amazon DSP">Amazon DSP</option>
      </select>
      </div>

      {/* --- Added 'required' attribute --- */}
      <div className='select-container'>
      <select
        className="kpi-list" // Removed rounded-element class
        value={selectedKPIs[0] || ''} // Control component for single select
        onChange={handleKPIChange}
        required // Make selection mandatory
      >
        <option value="" disabled>Select KPI</option> {/* Default/disabled option */}
         {/* KPI options */}
        <option value="CTR">CTR</option>
        <option value="CPA">CPA</option>
        <option value="ROAS">ROAS</option>
        <option value="CPL">CPL</option>
      </select>
      </div>

      {/* --- New Text Areas --- */}
      <div className="text-area-container">
        <label htmlFor="currentSituation">Current Situation:</label>
        <textarea
          id="currentSituation"
          className="text-area"
          value={currentSituation}
          onChange={handleSituationChange}
          placeholder="Describe your current marketing situation..."
        />
      </div>
      <div className="text-area-container">
        <label htmlFor="desiredOutcome">Desired Outcome:</label>
        <textarea
          id="desiredOutcome"
          className="text-area"
          value={desiredOutcome}
          onChange={handleOutcomeChange}
          placeholder="Describe your desired outcome..."
        />
      </div>
      {/* ---------------------- */}

      <button className='rounded-element' onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? 'Analyzing...' : 'Analyze'} {/* Show loading state */}
      </button>
      {analysisResult &&   <Link
        to="/analysis"
        className="rounded-element"
        state={{ prompt, modelName, analysisResult, finalPrompt }}
      >
        View Analysis
      </Link>}
      {/* Display Error Messages */}
      {error && <div className="error-message">{error}</div>}

      {/* Display Analysis Results */}
      {isLoading && <div className="loading-indicator">Loading analysis...</div>}
    </div>
  );
}

// Main App Wrapper with Router
function AppWrapper() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/analysis" element={<AnalysisDetails />} />
      </Routes>
    </Router>
  );
}

export default AppWrapper;
