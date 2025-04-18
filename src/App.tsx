import React, { useState, useEffect, useRef } from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    useNavigate,
    useLocation,
    Link,
    Navigate
} from 'react-router-dom';
import htmlToRtf from 'html-to-rtf';
import Papa from 'papaparse';
import DOMPurify from 'dompurify';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
  } from 'chart.js';
import { Line } from 'react-chartjs-2';
import audacyLogo from './assets/audacy_logo_horiz_color_rgb.png';
import './App.css';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

// Define a type for chat messages
interface ChatMessage {
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// Define types for the new data
interface ChartData {
    labels?: string[];
    data?: number[];
}

// Simple type for table data (can be more specific later)
interface TableData extends Array<Record<string, any>> {}

// --- Analysis Form Component ---
const AnalysisForm: React.FC<{ onSubmit: (data: any) => void }> = ({ onSubmit }) => {
    const [selectedTactics, setSelectedTactics] = useState<string>('');
    const [selectedKPIs, setSelectedKPIs] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [currentSituation, setCurrentSituation] = useState<string>('');
    const [desiredOutcome, setDesiredOutcome] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [targetCPA, setTargetCPA] = useState<number | null>(null);
    const [targetROAS, setTargetROAS] = useState<number | null>(null);
    const navigate = useNavigate();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        if (event.target.files && event.target.files.length > 0) {
            const selectedFile = event.target.files[0];
            if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx')) {
                setFileName(selectedFile.name);
                setError(null);
            } else {
                setFile(null);
                setFileName(null);
                setError('Unsupported file type. Please upload CSV or XLSX.');
            }
            setFile(selectedFile);
        } else {
            setFile(null);
            setFileName(null);
        }
    };

    const recommendations: { [key: string]: string[] } = {
        'SEM': ['ROAS', 'CPA', 'CTR', 'CPC'],
        'SEO': ['Conversion Rate', 'Impressions', 'Clicks'],
        'Display Ads': ['CTR', 'Impressions', 'Clicks', 'Conversions'],
        'Video Display Ads': ['Impressions', 'Clicks', 'Conversions'],
        'YouTube': ['Impressions', 'Clicks', 'Conversions'],
        'OTT': ['Impressions', 'Conversions'],
        'Social Ads': ['CTR', 'Impressions', 'Clicks', 'Conversions'],
        'Email eDirect': ['CTR', 'Conversion Rate', 'Conversions'],
        'Amazon DSP': ['ROAS', 'Conversions', 'CPA'],
    };

    const getRecommendationMessage = (tactic: string | null) => {
        if (tactic && recommendations[tactic]) {
            return `Recommended KPIs: ${recommendations[tactic].join(', ')}`;
        }
        return '';
    };

    const handleTacticChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedTactics(event.target.value);
    };

    const handleKPIChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedKPIs(event.target.value);
    };

    const handleTargetCPAChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTargetCPA(event.target.value ? parseFloat(event.target.value) : null);
    };

    const handleTargetROASChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTargetROAS(event.target.value ? parseFloat(event.target.value) : null);
    };

    const handleSituationChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCurrentSituation(event.target.value);
    };

    const handleOutcomeChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setDesiredOutcome(event.target.value);
    };

    const handleSubmit = async () => {
        setError(null);

        if (!file) {
            setError('Please upload a file for analysis.');
            return;
        }
        if (!selectedTactics) {
            setError('Please select a tactic.');
            return;
        }
        if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
            setError('Invalid file type selected. Please choose a CSV or XLSX file.');
            return;
        }

        setIsLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('tactics', JSON.stringify(selectedTactics));
            formData.append('kpis', JSON.stringify(selectedKPIs));
            formData.append('currentSituation', currentSituation);
            formData.append('desiredOutcome', desiredOutcome);
            formData.append('targetCPA', JSON.stringify(targetCPA));
            formData.append('targetROAS', JSON.stringify(targetROAS));

            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errorDetails = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error || errorData.details || errorDetails;
                } catch (e) {
                    // Ignore if response body is not JSON
                }
                throw new Error(errorDetails);
            }

            const data = await response.json();
            console.log("Received data from backend:", data);
            
            // Pass data and navigate
            navigate('/results', { 
                state: { 
                    analysisData: data, // Contains html, raw, chartData, tableData, prompt, modelName
                    inputData: { // Also pass necessary input data for display
                        selectedTactics,
                        selectedKPIs,
                        fileName,
                        currentSituation,
                        desiredOutcome
                    }
                }
            });

        } catch (error: any) {
            console.error('Error during analysis:', error);
            setError(error.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="App">
            <img src={audacyLogo} alt="Audacy Logo" className="audacy-logo" />
            <h1>Marketing Assistant</h1>
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
            {file && (
                <button className="remove-file-button rounded-element" onClick={() => { setFile(null); setFileName(null); }}>
                    Remove File
                </button>
            )}
            {fileName === null && file === null && <p className="file-name">Please select a CSV or XLSX file.</p>}
            <br />
            <div className="select-container">
                <label htmlFor="tactics-list">Select Tactic:</label>
                <select
                    id="tactics-list"
                    className="tactics-list"
                    value={selectedTactics}
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
            {selectedTactics && getRecommendationMessage(selectedTactics) && (
                <div className="recommendation-message">
                    {getRecommendationMessage(selectedTactics)}
                </div>
            )}
            <div className="select-container">
                <label htmlFor="kpi-list">Select KPI:</label>
                <select
                    id="kpi-list"
                    className="kpi-list"
                    value={selectedKPIs}
                    onChange={handleKPIChange}
                    required
                >
                    <option value="" disabled>Select KPI</option>
                    <option value="ROAS">ROAS</option>
                    <option value="CPA">CPA</option>
                    <option value="CTR">CTR</option>
                    <option value="CPC">CPC</option>
                    <option value="Conversion Rate">Conversion Rate</option>
                    <option value="Impressions">Impressions</option>
                    <option value="Clicks">Clicks</option>
                    <option value="Conversions">Conversions</option>
                </select>
            </div>
            {selectedKPIs === 'CPA' && (
                <div className="input-container">
                    <label htmlFor="targetCPA">Target CPA:</label>
                    <input
                        type="number"
                        id="targetCPA"
                        value={targetCPA !== null ? targetCPA : ''}
                        onChange={handleTargetCPAChange}
                        placeholder="Enter Target CPA"
                        className="text-input"
                    />
                </div>
            )}
            {selectedKPIs === 'ROAS' && (
                <div className="input-container">
                    <label htmlFor="targetROAS">Target ROAS:</label>
                    <input
                        type="number"
                        id="targetROAS"
                        value={targetROAS !== null ? targetROAS : ''}
                        onChange={handleTargetROASChange}
                        placeholder="Enter Target ROAS"
                        className="text-input"
                    />
                </div>
            )}
            <style>{`
                .recommendation-message {
                    background-color: #FE7333;
                    padding: 10px;
                    border-radius: 5px;
                    margin-top: 5px;
                    color: white;
                    font-weight: bold;
                }
                .remove-file-button {
                    background-color: #dc3545; /* Bootstrap danger color */
                    margin-left: 10px;
                    vertical-align: middle; /* Align with file name text */
                }
                .remove-file-button:hover {
                    background-color: #c82333;
                }
            `}</style>
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
            <button className="rounded-element" onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? 'Analyzing...' : 'Analyze'}
            </button>
            {isLoading && (
                <div className="spinner-container">
                    <div className="spinner"></div>
                    <img src={audacyLogo} alt="Audacy Logo" className="spinner-logo" />
                    {/* Removed the loading text here as it's now on the button */}
                </div>
            )}
            {error && <div className="error-message">{error}</div>}
        </div>
    );
};

// --- Results Page Component ---
const ResultsPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { analysisData, inputData } = location.state || {}; // Get data passed from navigation

    const [showPrompt, setShowPrompt] = useState<boolean>(false);
    const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
    const [helpQuestion, setHelpQuestion] = useState<string>('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isHelpLoading, setIsHelpLoading] = useState<boolean>(false);
    const helpInputRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Destructure received data with fallbacks
    const { 
        html: analysisResult,
        raw: rawAnalysisResult,
        chartData,
        tableData,
        prompt: promptSent,
        modelName 
    } = analysisData || {};
    
    const { 
        selectedTactics, 
        selectedKPIs, 
        fileName, 
        currentSituation, 
        desiredOutcome 
    } = inputData || {};

    // Focus on help input when modal opens
    useEffect(() => {
        if (showHelpModal && helpInputRef.current) {
            setTimeout(() => {
                helpInputRef.current?.focus();
            }, 100);
        }
    }, [showHelpModal]);

    // Scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleBackToForm = () => {
        navigate('/'); // Navigate back to the form
    };

    const handleHelpQuestionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setHelpQuestion(event.target.value);
    };

    const handleHelpKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            handleGetHelp();
        }
    };

    const handleGetHelp = async () => {
        if (!helpQuestion.trim()) {
            alert('Please enter a question to get help.');
            return;
        }
        const newUserMessage: ChatMessage = {
            type: 'user',
            content: helpQuestion,
            timestamp: new Date()
        };
        const updatedChatHistory = [...chatHistory, newUserMessage];
        setChatHistory(updatedChatHistory);
        setIsHelpLoading(true);
        setHelpQuestion(''); // Clear input immediately

        try {
            const response = await fetch('/api/get-help', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: newUserMessage.content,
                    originalPrompt: promptSent,
                    originalAnalysis: rawAnalysisResult,
                    fileName: fileName,
                    tactic: selectedTactics,
                    kpi: selectedKPIs,
                    currentSituation: currentSituation,
                    desiredOutcome: desiredOutcome,
                    conversationHistory: updatedChatHistory // Send updated history
                })
            });
            if (!response.ok) {
                let errorDetails = `HTTP error! status: ${response.status}`;
                try { const errorData = await response.json(); errorDetails = errorData.error || errorData.details || errorDetails; } catch (e) {} 
                throw new Error(errorDetails);
            }
            const data = await response.json();
            const sanitizedHtml = DOMPurify.sanitize(data.html || data.response);
            const newAssistantMessage: ChatMessage = {
                type: 'assistant',
                content: sanitizedHtml,
                timestamp: new Date()
            };
            setChatHistory([...updatedChatHistory, newAssistantMessage]);
        } catch (error: any) {
            console.error('Error getting help:', error);
            const errorMessage = `<p class="error-message">Error: ${error.message || 'An unexpected error occurred.'}</p>`;
            const errorAssistantMessage: ChatMessage = {
                type: 'assistant',
                content: errorMessage,
                timestamp: new Date()
            };
            setChatHistory([...updatedChatHistory, errorAssistantMessage]);
        } finally {
            setIsHelpLoading(false);
        }
    };

    const handleExportToRtf = async () => {
        if (analysisResult) {
            const combinedHtml = `
                <h1>Analysis Results</h1>
                <h2>Inputs</h2>
                <p><strong>Tactic:</strong> ${selectedTactics || 'N/A'}</p>
                <p><strong>KPI:</strong> ${selectedKPIs || 'N/A'}</p>
                <p><strong>File:</strong> ${fileName || 'N/A'}</p>
                ${currentSituation ? `<p><strong>Current Situation:</strong> ${currentSituation}</p>` : ''}
                ${desiredOutcome ? `<p><strong>Desired Outcome:</strong> ${desiredOutcome}</p>` : ''}
                <hr />
                ${analysisResult}
            `;
            const rtf = await htmlToRtf.convertHtmlToRtf(combinedHtml);
            const blob = new Blob([rtf], { type: 'application/rtf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Audacy_Marketing_Analysis_${fileName || 'Report'}.rtf`;
            link.click();
            window.URL.revokeObjectURL(url);
        }
    };

    const formatCsvDataAsTable = (prompt: string | null) => {
        // Keep this function for the prompt modal, as it operates on the raw prompt string
        if (!prompt) return "";
        const dataMatch = prompt.match(/(?:INPUT DATA:|Campaign Data:)(?:[\s\S]*?)(?:File Name:|Selected Tactic:|Campaign Data:)([\s\S]*?)(?=\n\n|$)/);
        if (dataMatch && dataMatch[1]) {
            const dataSection = dataMatch[1].trim();
            const jsonMatches = dataSection.match(/\[\s*{[\s\S]*}\s*\]/);
            if (jsonMatches) {
                try {
                    const jsonData = JSON.parse(jsonMatches[0]);
                    let tableContainer = '<div class="csv-table-container">';
                    let table = '<table class="csv-data-table">';
                    if (jsonData.length > 0) {
                        table += '<thead><tr>';
                        Object.keys(jsonData[0]).forEach(header => { table += `<th>${header}</th>`; });
                        table += '</tr></thead>';
                        table += '<tbody>';
                        jsonData.forEach((row: any) => {
                            table += '<tr>';
                            Object.values(row).forEach((value: any) => {
                                const displayValue = value === null || value === undefined ? '' : value;
                                table += `<td>${displayValue}</td>`;
                            });
                            table += '</tr>';
                        });
                        table += '</tbody>';
                    }
                    table += '</table></div>';
                    tableContainer = '<style>' +
                        '.csv-table-container { overflow-x: auto; margin: 10px 0; max-height: 400px; overflow-y: auto; }' +
                        '.csv-data-table { width: 100%; border-collapse: collapse; }' +
                        '.csv-data-table th, .csv-data-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
                        '.csv-data-table thead { position: sticky; top: 0; background-color: #f2f2f2; }' +
                        '.csv-data-table th { background-color: #f2f2f2; font-weight: bold; }' +
                        '.csv-data-table tr:nth-child(even) { background-color: #f9f9f9; }' +
                        '.csv-data-table tr:hover { background-color: #f0f0f0; }' +
                        '</style>' + tableContainer;
                    return prompt.replace(jsonMatches[0], tableContainer);
                } catch (e) { console.error('Error parsing JSON data in modal:', e); }
            }
        }
        const csvDataMatch = prompt.match(/(?:INPUT DATA:|Campaign Data:)(?:[\s\S]*?)(?=\n\n(?:[A-Z]|$)|$)/);
        if (csvDataMatch) {
             const csvData = csvDataMatch[1].trim();
             try {
                const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true });
                if (parsedData.data.length > 0 && Object.keys(parsedData.data[0]).length > 1) {
                    let tableContainer = '<div class="csv-table-container">';
                    let table = '<table class="csv-data-table">';
                    table += '<thead><tr>';
                    Object.keys(parsedData.data[0]).forEach(header => { table += `<th>${header}</th>`; });
                    table += '</tr></thead>';
                    table += '<tbody>';
                    parsedData.data.forEach((row: any) => {
                        table += '<tr>';
                        Object.values(row).forEach((value: any) => {
                            const displayValue = value === null || value === undefined ? '' : value;
                            table += `<td>${displayValue}</td>`;
                        });
                        table += '</tr>';
                    });
                    table += '</tbody></table></div>';
                    tableContainer = '<style>' +
                        '.csv-table-container { overflow-x: auto; margin: 10px 0; max-height: 400px; overflow-y: auto; }' +
                        '.csv-data-table { width: 100%; border-collapse: collapse; }' +
                        '.csv-data-table th, .csv-data-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
                        '.csv-data-table thead { position: sticky; top: 0; background-color: #f2f2f2; }' +
                        '.csv-data-table th { background-color: #f2f2f2; font-weight: bold; }' +
                        '.csv-data-table tr:nth-child(even) { background-color: #f9f9f9; }' +
                        '.csv-data-table tr:hover { background-color: #f0f0f0; }' +
                        '</style>' + tableContainer;
                    return prompt.replace(csvDataMatch[0], `INPUT DATA:\n${tableContainer}`);
                 }
             } catch (e) { console.error('Error parsing CSV data in modal:', e); }
        }
        return prompt;
    };

    // Prepare chart data if available
    const lineChartData = {
        labels: chartData?.labels || [],
        datasets: [
          {
            label: `${selectedKPIs || 'KPI'} Trend`,
            data: chartData?.data || [],
            borderColor: 'rgb(80, 41, 167)', // Audacy purple
            backgroundColor: 'rgba(80, 41, 167, 0.5)',
            tension: 0.1
          },
        ],
    };
    
    const chartOptions = {
        responsive: true,
        plugins: {
          legend: { position: 'top' as const },
          title: { display: true, text: `${selectedKPIs || 'Key Metric'} Trend Over Time` },
        },
        scales: { y: { beginAtZero: true } }
    };
    
    // Render Table function
    const renderTable = () => {
        if (!tableData || tableData.length === 0) return null;
        const headers = Object.keys(tableData[0]);
        return (
            <div className="data-table-container">
                <h3>Data Table</h3>
                <table>
                    <thead>
                        <tr>
                            {headers.map(header => <th key={header}>{header}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((row: Record<string, any>, index: number) => (
                            <tr key={index}>
                                {headers.map(header => <td key={`${index}-${header}`}>{row[header]}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // If no data was passed (e.g., user navigated directly to /results), redirect to form
    if (!analysisData || !inputData) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="App">
            {/* Header Section */}    
            <div className="back-button-container">
                <button onClick={handleBackToForm} className="back-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Audacy Digital Marketing Asst.
                </button>
                <div className="campaign-info">
                    <div className="info-item">
                        <span className="info-label">TACTIC:</span>
                        <span className="info-value">{selectedTactics}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">KPI:</span>
                        <span className="info-value">{selectedKPIs}</span>
                    </div>
                    {fileName && (
                        <div className="info-item">
                            <span className="info-label">FILE:</span>
                            <span className="info-value">{fileName}</span>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Main Content Area */}  
            <div className="analysis-page-container">
                <div className="results-display">
                    {/* Optional Inputs Display */}  
                    {(currentSituation || desiredOutcome) && (
                        <div className="prompt-display-box">
                            <div className="campaign-context">
                                {currentSituation && (
                                    <div className="context-item">
                                        <span className="context-label">Current Situation:</span>
                                        <p className="context-value">{currentSituation}</p>
                                    </div>
                                )}
                                {desiredOutcome && (
                                    <div className="context-item">
                                        <span className="context-label">Desired Outcome:</span>
                                        <p className="context-value">{desiredOutcome}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* HTML Analysis */}  
                    {analysisResult ? (
                        <div dangerouslySetInnerHTML={{ __html: analysisResult }} />
                    ) : (
                        <div className="no-results">
                            <p>No analysis result available.</p>
                        </div>
                    )}
                    
                    {/* Chart */}  
                    {chartData && chartData.labels && chartData.labels.length > 0 && (
                        <div className="chart-container">
                            <Line options={chartOptions} data={lineChartData} />
                        </div>
                    )}
                    
                    {/* Table */}  
                    {renderTable()}
                    
                    {/* Attribution */}  
                    {modelName && (
                        <div className="model-attribution">
                            <p>Analysis by <strong>{modelName}</strong></p>
                        </div>
                    )}
                </div>
                
                {/* Action Buttons Section */}  
                <div className="input-section">
                    <div className="main-action-buttons">
                        <button className="help-button" onClick={() => setShowHelpModal(true)}>
                            {/* SVG Icon */}
                            Get Help
                        </button>
                        <button className="export-button" onClick={handleExportToRtf}>
                            {/* SVG Icon */}
                            Download
                        </button>
                    </div>
                    <button className="show-input-link" onClick={() => setShowPrompt(true)}>
                        Show Input Data Sent to LLM
                    </button>
                </div>
                
                {/* Modals */}  
                {showPrompt && (
                    <div className="prompt-modal-overlay">
                        <div className="prompt-modal prompt-content">
                            <h2>Prompt Sent to LLM:</h2>
                            <button onClick={() => setShowPrompt(false)} className="close-button">Close</button>
                            {promptSent ? (
                                <div className="formatted-prompt">
                                    {promptSent.split('\n\n').map((section: string, index: number) => {
                                        if (section.includes(':\n')) {
                                            const [header, content] = section.split(':\n');
                                            if (header === "INPUT DATA" || header === "Campaign Data") {
                                                const table = formatCsvDataAsTable(header + ":\n" + content);
                                                return (
                                                    <div key={index} className="prompt-section">
                                                        <h3>{header}:</h3>
                                                        <div dangerouslySetInnerHTML={{ __html: table.replace(header + ":\n", "") }} />
                                                    </div>
                                                );
                                            } 
                                            else if (content && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
                                                try {
                                                    const jsonData = JSON.parse(content.trim());
                                                    const formattedJson = JSON.stringify(jsonData, null, 2);
                                                    return (
                                                        <div key={index} className="prompt-section">
                                                            <h3>{header}:</h3>
                                                            <pre className="json-content">{formattedJson}</pre>
                                                        </div>
                                                    );
                                                } catch (e) {
                                                    return (
                                                        <div key={index} className="prompt-section">
                                                            <h3>{header}:</h3>
                                                            <p className="content-text">{content}</p>
                                                        </div>
                                                    );
                                                }
                                            } 
                                            else {
                                                return (
                                                    <div key={index} className="prompt-section">
                                                        <h3>{header}:</h3>
                                                        <p className="content-text">{content}</p>
                                                    </div>
                                                );
                                            }
                                        } 
                                        else {
                                            return (
                                                <div key={index} className="prompt-section">
                                                    <p className="content-text">{section}</p>
                                                </div>
                                            );
                                        }
                                    })}
                                </div>
                            ) : (
                                <p>Prompt not available.</p>
                            )}
                        </div>
                    </div>
                )}
                {showHelpModal && (
                    <div className="prompt-modal-overlay">
                        <div className="prompt-modal help-modal">
                            <h2>Chat with Marketing Assistant</h2>
                            <button onClick={() => setShowHelpModal(false)} className="close-button">Close</button>
                            <div className="chat-interface">
                                <div className="chat-history-container" ref={chatContainerRef}>
                                    {chatHistory.length === 0 ? (
                                        <div className="empty-chat-message">
                                            <p>Ask a question about the analysis or how to improve your marketing strategy.</p>
                                        </div>
                                    ) : (
                                        chatHistory.map((message, index) => (
                                            <div key={index} className={`chat-message ${message.type}-message`}>
                                                <div className="message-header">
                                                    <strong>{message.type === 'user' ? 'You' : 'Assistant'}</strong>
                                                    <span className="message-time">
                                                        {message.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                </div>
                                                <div 
                                                    className="message-content"
                                                    dangerouslySetInnerHTML={{ __html: message.content }}
                                                />
                                            </div>
                                        ))
                                    )}
                                    {isHelpLoading && (
                                        <div className="assistant-message typing-indicator">
                                            <div className="message-header"><strong>Assistant</strong></div>
                                            <div className="message-content"><div className="typing-dots"><span></span><span></span><span></span></div></div>
                                        </div>
                                    )}
                                </div>
                                <div className="chat-input-container">
                                    <textarea
                                        ref={helpInputRef}
                                        className="chat-input"
                                        value={helpQuestion}
                                        onChange={handleHelpQuestionChange}
                                        onKeyDown={handleHelpKeyDown}
                                        placeholder="Type your question here..."
                                        rows={3}
                                    />
                                    <div className="chat-controls">
                                        <button className="send-message-button" onClick={handleGetHelp} disabled={isHelpLoading || !helpQuestion.trim()}>
                                            {isHelpLoading ? 'Sending...' : 'Send'}
                                        </button>
                                        {chatHistory.length > 0 && (
                                            <button className="clear-chat-button" onClick={() => { setChatHistory([]); setHelpQuestion(''); helpInputRef.current?.focus(); }}>
                                                Clear Chat
                                            </button>
                                        )}
                                    </div>
                                    <p className="keyboard-tip">Press <strong>Ctrl+Enter</strong> to send</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main App Component (Router Setup) ---
function App() {
    return (
        <Routes>
            <Route path="/" element={<AnalysisForm onSubmit={() => {}} />} /> {/* onSubmit prop might not be needed anymore */}
            <Route path="/results" element={<ResultsPage />} />
        </Routes>
    );
}

export default App;