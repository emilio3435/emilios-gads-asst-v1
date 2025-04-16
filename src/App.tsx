import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown
import remarkGfm from 'remark-gfm'; // Import the GFM plugin
import './App.css';
import audacyLogo from './assets/audacy-logo.png';

function App() {
  const [selectedTactics, setSelectedTactics] = useState<string[]>([]);
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

    const formData = new FormData();
    formData.append('file', file);
    formData.append('tactics', JSON.stringify(selectedTactics));
    formData.append('kpis', JSON.stringify(selectedKPIs));
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
      <select
        className="tactics-list rounded-element" // Removed rounded-element class
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

      {/* --- Added 'required' attribute --- */}
      <select
        className="kpi-list rounded-element" // Removed rounded-element class
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

      <button className='rounded-element' onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? 'Analyzing...' : 'Analyze'} {/* Show loading state */}
      </button>

      {/* Display Error Messages */}
      {error && <div className="error-message">{error}</div>}

      {/* Display Analysis Results */}
      {isLoading && <div className="loading-indicator">Loading analysis...</div>}
      {analysisResult && !isLoading && (
        <div className="analysis-result-container">
          <h2>Analysis Results:</h2>
          <div className="analysis-result">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {analysisResult}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
