;import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';
import audacyLogo from './assets/audacy-logo.png';

// Main App component
function App() {
  // State for form inputs
  const [selectedTactics, setSelectedTactics] = useState<string[]>([]);
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [currentSituation, setCurrentSituation] = useState<string>('');
  const [desiredOutcome, setDesiredOutcome] = useState<string>('');

  // State for analysis results and view control
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [promptSent, setPromptSent] = useState<string | null>(null); // Store the prompt sent
  const [modelName, setModelName] = useState<string | null>(null); // Store the model name
  const [showResults, setShowResults] = useState<boolean>(false); // Control view

  // State for loading and errors
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAnalysisResult(null);
    setError(null);
    if (event.target.files && event.target.files.length > 0) {
      const selectedFile = event.target.files[0];
      // Basic validation for file type (can be enhanced)
      if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx')) {
          setFile(selectedFile);
          setFileName(selectedFile.name);
          setError(null); // Clear error if valid file is selected
      } else {
          setFile(null);
          setFileName(null);
          setError('Unsupported file type. Please upload CSV or XLSX.');
      }
    } else {
      setFile(null);
      setFileName(null);
    }
  };


  const handleTacticChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTactics([event.target.value]);
  };

  const handleKPIChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedKPIs([event.target.value]);
  };

  const handleSituationChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentSituation(event.target.value);
  };

  const handleOutcomeChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDesiredOutcome(event.target.value);
  };

  const handleSubmit = async () => {
    setError(null);
    setAnalysisResult(null);
    setPromptSent(null);
    setModelName(null);
    setShowResults(false); // Hide results initially

    const currentTactic = (document.querySelector('.tactics-list') as HTMLSelectElement)?.value;
    const currentKPI = (document.querySelector('.kpi-list') as HTMLSelectElement)?.value;

    if (!file || !currentTactic || !currentKPI) {
      const missing = [];
      if (!file) missing.push("file");
      if (!currentTactic) missing.push("tactic");
      if (!currentKPI) missing.push("KPI");
      const errorMessage = `Please select a ${missing.join(', ')}.`;
      setError(errorMessage);
      return;
    }
    
    // Double-check file type before sending
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
        setError('Invalid file type selected. Please choose a CSV or XLSX file.');
        return;
    }


    const formData = new FormData();
    formData.append('file', file);
    formData.append('tactics', JSON.stringify(selectedTactics));
    formData.append('kpis', JSON.stringify(selectedKPIs));
    formData.append('currentSituation', currentSituation);
    formData.append('desiredOutcome', desiredOutcome);

    setIsLoading(true);

    try {
      // Ensure the server path is correct (using relative path for proxy)
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.details || errorData.error || errorDetails;
        } catch (e) { /* Ignore if response body is not JSON */ }
        throw new Error(errorDetails);
      }

      const data = await response.json();

      // Store results and switch view
      setAnalysisResult(typeof data.analysis === 'string' ? data.analysis : JSON.stringify(data.analysis));
      setPromptSent(data.prompt); // Store the prompt that was sent
      setModelName(data.modelName); // Store the model name used
      setShowResults(true); // Show the results view

    } catch (error: any) { // Explicitly type error
      console.error('Error during analysis:', error);
      setError(error.message || 'An unexpected error occurred.');
      setShowResults(false); // Ensure results view is hidden on error
    } finally {
      setIsLoading(false);
    }
  };

  // Function to go back to the form
  const handleBackToForm = () => {
    setShowResults(false);
    // Optionally clear results/form fields
    // setAnalysisResult(null);
    // setPromptSent(null);
    // setModelName(null);
    // setFile(null);
    // setFileName(null);
    // etc.
  };

  // Render the Analysis Results View
  if (showResults) {
    return (
      <div className="App"> {/* Reuse App class for overall styling */}
        <div className="back-button-container">
            <button onClick={handleBackToForm} className="back-button">
              Back to Form
            </button>
        </div>
        <div className="analysis-page-container">
          <div className="left-pane">
            <div className="prompt-display">
              <h4>Prompt Sent to LLM:</h4>
              <pre>{promptSent || 'Prompt not available.'}</pre>
            </div>
            <div className="model-name-display">
              <h4>Model Used:</h4>
              <p>{modelName || 'N/A'}</p>
            </div>
          </div>
          <div className="right-pane">
            <div className="results-display">
              {/* Render analysis result - Use ReactMarkdown if it's Markdown */}
              {analysisResult ? (
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
              ) : (
                <p>No analysis result available.</p>
              )}
              {/* If expecting HTML, use:
              {analysisResult ? (
                 <div dangerouslySetInnerHTML={{ __html: analysisResult }} />
              ) : (
                <p>No analysis result available.</p>
              )}
              */}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render the Form View (default)
  return (
    <div className="App">
      <img src={audacyLogo} alt="Audacy Logo" className="audacy-logo" />
      <h1>Marketing Assistant</h1>

      {/* File Input */}
      <input
        type="file"
        id="fileInput"
        accept=".csv, .xlsx"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <label htmlFor="fileInput" className="choose-file-button rounded-element">
        Choose File
      </label>
      {fileName && <p className="file-name"><span>Selected File:</span> {fileName}</p>}
      {!fileName && file === null && <p className="file-name">Please select a CSV or XLSX file.</p>} {/* Prompt if no file */}
      <br />

      {/* Tactics Select */}
      <div className='select-container'>
        <select
          className="tactics-list"
          value={selectedTactics[0] || ''}
          onChange={handleTacticChange}
          required
        >
          <option value="" disabled>Select Tactic</option>
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

      {/* KPI Select */}
      <div className='select-container'>
        <select
          className="kpi-list"
          value={selectedKPIs[0] || ''}
          onChange={handleKPIChange}
          required
        >
          <option value="" disabled>Select KPI</option>
          <option value="CTR">CTR</option>
          <option value="CPA">CPA</option>
          <option value="ROAS">ROAS</option>
          <option value="CPL">CPL</option>
        </select>
      </div>

      {/* Text Areas */}
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

      {/* Submit Button */}
      <button className='rounded-element' onClick={handleSubmit} disabled={isLoading || !file}>
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>

      {/* Display Error Messages */}
      {error && <div className="error-message">{error}</div>}

      {/* Loading Indicator */}
      {isLoading && <div className="loading-indicator">Loading analysis...</div>}
    </div>
  );
}

export default App; // Export the main App component directly
