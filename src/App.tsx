import React, { useState, useEffect, useRef } from 'react';
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

function App() {
    const [selectedTactics, setSelectedTactics] = useState<string>('');
    const [selectedKPIs, setSelectedKPIs] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [currentSituation, setCurrentSituation] = useState<string>('');
    const [desiredOutcome, setDesiredOutcome] = useState<string>('');
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [rawAnalysisResult, setRawAnalysisResult] = useState<string | null>(null);
    const [promptSent, setPromptSent] = useState<string | null>(null);
    const [modelName, setModelName] = useState<string | null>(null);
    const [showPrompt, setShowPrompt] = useState<boolean>(false);
    const [showResults, setShowResults] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [targetCPA, setTargetCPA] = useState<number | null>(null);
    const [targetROAS, setTargetROAS] = useState<number | null>(null);
    const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
    const [helpQuestion, setHelpQuestion] = useState<string>('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isHelpLoading, setIsHelpLoading] = useState<boolean>(false);
    // Removed unused helpResponse state
    
    // Add state for chart and table data
    const [chartData, setChartData] = useState<ChartData | null>(null);
    const [tableData, setTableData] = useState<TableData | null>(null);
    
    const helpInputRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Focus on help input when modal opens
    useEffect(() => {
        if (showHelpModal && helpInputRef.current) {
            setTimeout(() => {
                helpInputRef.current?.focus();
            }, 100);
        }
    }, [showHelpModal]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        // Reset all results when file changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        setModelName(null);
        setChartData(null);
        setTableData(null);
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

    const handleHelpQuestionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setHelpQuestion(event.target.value);
    };

    const handleHelpKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit question when pressing Ctrl+Enter
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

        // Add the user's question to the chat history
        const newUserMessage: ChatMessage = {
            type: 'user',
            content: helpQuestion,
            timestamp: new Date()
        };
        
        const updatedChatHistory = [...chatHistory, newUserMessage];
        setChatHistory(updatedChatHistory);
        setIsHelpLoading(true);

        try {
            const response = await fetch('/api/get-help', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: helpQuestion,
                    originalPrompt: promptSent,
                    originalAnalysis: rawAnalysisResult,
                    fileName: fileName,
                    tactic: selectedTactics,
                    kpi: selectedKPIs,
                    currentSituation: currentSituation,
                    desiredOutcome: desiredOutcome,
                    conversationHistory: chatHistory // Send conversation history to the API
                })
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
            const sanitizedHtml = DOMPurify.sanitize(data.html || data.response);
            
            // Add the AI's response to the chat history
            const newAssistantMessage: ChatMessage = {
                type: 'assistant',
                content: sanitizedHtml,
                timestamp: new Date()
            };
            
            setChatHistory([...updatedChatHistory, newAssistantMessage]);
            
            // Clear the input field for the next question
            setHelpQuestion('');
            
            // Scroll to the bottom of the chat container
            setTimeout(() => {
                if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                }
            }, 100);
        } catch (error: any) {
            console.error('Error getting help:', error);
            const errorMessage = `<p class="error-message">Error: ${error.message || 'An unexpected error occurred.'}</p>`;
            
            // Add the error message to the chat history
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
            const rtf = await htmlToRtf.convertHtmlToRtf(analysisResult);
            const blob = new Blob([rtf], { type: 'application/rtf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'analysis.rtf';
            link.click();
        }
    };

    const formatCsvDataAsTable = (prompt: string | null) => {
        if (!prompt) return "";
        
        // Look for data sections in INPUT DATA or Campaign Data
        const dataMatch = prompt.match(/(?:INPUT DATA:|Campaign Data:)(?:[\s\S]*?)(?:File Name:|Selected Tactic:|Campaign Data:)([\s\S]*?)(?=\n\n|$)/);
        
        if (dataMatch && dataMatch[1]) {
            // Extract just the data part
            const dataSection = dataMatch[1].trim();
            
            // Check if it contains data in a format we can parse
            const jsonMatches = dataSection.match(/\[\s*{[\s\S]*}\s*\]/);
            
            if (jsonMatches) {
                try {
                    // Try to parse the JSON data
                    const jsonData = JSON.parse(jsonMatches[0]);
                    
                    // Create a scrollable container for the table
                    let tableContainer = '<div class="csv-table-container">';
                    let table = '<table class="csv-data-table">';
                    
                    // Create header row if data exists and has properties
                    if (jsonData.length > 0) {
                        table += '<thead><tr>';
                        Object.keys(jsonData[0]).forEach(header => {
                            table += `<th>${header}</th>`;
                        });
                        table += '</tr></thead>';
                        
                        // Create table body
                        table += '<tbody>';
                        jsonData.forEach((row: any) => {
                            table += '<tr>';
                            Object.values(row).forEach((value: any) => {
                                // Handle null or undefined values
                                const displayValue = value === null || value === undefined ? '' : value;
                                table += `<td>${displayValue}</td>`;
                            });
                            table += '</tr>';
                        });
                        table += '</tbody>';
                    }
                    
                    table += '</table></div>';
                    
                    // Add inline CSS for table styling
                    tableContainer = '<style>' +
                        '.csv-table-container { overflow-x: auto; margin: 10px 0; max-height: 400px; overflow-y: auto; }' +
                        '.csv-data-table { width: 100%; border-collapse: collapse; }' +
                        '.csv-data-table th, .csv-data-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }' +
                        '.csv-data-table thead { position: sticky; top: 0; background-color: #f2f2f2; }' +
                        '.csv-data-table th { background-color: #f2f2f2; font-weight: bold; }' +
                        '.csv-data-table tr:nth-child(even) { background-color: #f9f9f9; }' +
                        '.csv-data-table tr:hover { background-color: #f0f0f0; }' +
                        '</style>' + tableContainer;
                    
                    // Replace the JSON data with the formatted table
                    return prompt.replace(jsonMatches[0], tableContainer);
                } catch (e) {
                    console.error('Error parsing JSON data:', e);
                    return prompt;
                }
            }
        }
        
        // Fall back to the original CSV parsing logic if JSON parsing fails
        const csvDataMatch = prompt.match(/(?:INPUT DATA:|Campaign Data:)([\s\S]*?)(?=\n\n(?:[A-Z]|$)|$)/);
        if (csvDataMatch) {
            const csvData = csvDataMatch[1].trim();
            try {
                const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true });
                if (parsedData.data.length > 0 && Object.keys(parsedData.data[0]).length > 1) {
                    // Create a scrollable container for the table
                    let tableContainer = '<div class="csv-table-container">';
                    let table = '<table class="csv-data-table">';
                    
                    // Create header row
                    table += '<thead><tr>';
                    Object.keys(parsedData.data[0]).forEach(header => {
                        table += `<th>${header}</th>`;
                    });
                    table += '</tr></thead>';
                    
                    // Create table body
                    table += '<tbody>';
                    parsedData.data.forEach((row: any) => {
                        table += '<tr>';
                        Object.values(row).forEach((value: any) => {
                            // Handle null or undefined values
                            const displayValue = value === null || value === undefined ? '' : value;
                            table += `<td>${displayValue}</td>`;
                        });
                        table += '</tr>';
                    });
                    table += '</tbody></table></div>';
                    
                    // Add inline CSS for table styling
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
            } catch (e) {
                console.error('Error parsing CSV data:', e);
            }
        }
        return prompt;
    };

    const handleSubmit = async () => {
        setError(null);
        // Reset all result states
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        setModelName(null);
        setChartData(null);
        setTableData(null);
        setShowResults(false);

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
            
            // Sanitize HTML response
            const sanitizedHtml = DOMPurify.sanitize(data.html);
            
            setAnalysisResult(sanitizedHtml);
            setRawAnalysisResult(data.raw);
            setPromptSent(data.prompt);
            setModelName(data.modelName);
            
            // Set chart and table data
            setChartData(data.chartData || null); 
            setTableData(data.tableData || null);
            
            setShowResults(true);
        } catch (error: any) {
            console.error('Error during analysis:', error);
            setError(error.message || 'An unexpected error occurred.');
            setShowResults(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackToForm = () => {
        setShowResults(false);
    };

    // --- Render Logic --- 
    if (showResults) {
        // Prepare chart data
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
              legend: {
                position: 'top' as const,
              },
              title: {
                display: true,
                text: `${selectedKPIs || 'Key Metric'} Trend Over Time`,
              },
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        };
        
        // Basic Table Rendering (no sorting/filtering yet)
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
                            {tableData.map((row, index) => (
                                <tr key={index}>
                                    {headers.map(header => <td key={`${index}-${header}`}>{row[header]}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        };

        return (
            <div className="App">
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
                <div className="analysis-page-container">
                    <div className="results-display">
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
                        
                        {/* Analysis results */}
                        {analysisResult ? (
                            <div dangerouslySetInnerHTML={{ __html: analysisResult }} />
                        ) : (
                            <div className="no-results">
                                <p>No analysis result available.</p>
                            </div>
                        )}
                        
                        {/* Render Chart if data exists */}
                        {chartData && chartData.labels && chartData.labels.length > 0 && (
                            <div className="chart-container">
                                <Line options={chartOptions} data={lineChartData} />
                            </div>
                        )}
                        
                        {/* Render Table if data exists */}
                        {renderTable()}
                        
                        {/* Model attribution */}
                        {modelName && (
                            <div className="model-attribution">
                                <p>Analysis by <strong>{modelName}</strong></p>
                            </div>
                        )}
                    </div>
                    
                    <div className="input-section">
                        <div className="main-action-buttons">
                            <button
                                className="help-button"
                                onClick={() => setShowHelpModal(true)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                Get Help
                            </button>
                            <button className="export-button" onClick={handleExportToRtf}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                Download
                            </button>
                        </div>
                        <button
                            className="show-input-link"
                            onClick={() => setShowPrompt(true)}
                        >
                            Show Input Data Sent to LLM
                        </button>
                    </div>
                    
                    {/* Prompt Modal (no changes needed here, formatCsvDataAsTable handles its display) */}
                    {showPrompt && (
                        <div className="prompt-modal-overlay">
                            <div className="prompt-modal prompt-content">
                                <h2>Prompt Sent to LLM:</h2>
                                <button onClick={() => setShowPrompt(false)} className="close-button">Close</button>
                                {promptSent ? (
                                    <div className="formatted-prompt">
                                        {promptSent.split('\n\n').map((section, index) => {
                                            // Check if the section contains a header
                                            if (section.includes(':\n')) {
                                                const [header, content] = section.split(':\n');
                                                
                                                // Special handling for data section with CSV format
                                                if (header === "INPUT DATA" || header === "Campaign Data") {
                                                    const table = formatCsvDataAsTable(header + ":\n" + content);
                                                    return (
                                                        <div key={index} className="prompt-section">
                                                            <h3>{header}:</h3>
                                                            <div dangerouslySetInnerHTML={{ __html: table.replace(header + ":\n", "") }} />
                                                        </div>
                                                    );
                                                } 
                                                // Special handling for JSON data
                                                else if (content && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
                                                    try {
                                                        // Try to parse and format JSON
                                                        const jsonData = JSON.parse(content.trim());
                                                        const formattedJson = JSON.stringify(jsonData, null, 2);
                                                        return (
                                                            <div key={index} className="prompt-section">
                                                                <h3>{header}:</h3>
                                                                <pre className="json-content">{formattedJson}</pre>
                                                            </div>
                                                        );
                                                    } catch (e) {
                                                        // If not valid JSON, display as normal text
                                                        return (
                                                            <div key={index} className="prompt-section">
                                                                <h3>{header}:</h3>
                                                                <p className="content-text">{content}</p>
                                                            </div>
                                                        );
                                                    }
                                                } 
                                                // Normal text content
                                                else {
                                                    return (
                                                        <div key={index} className="prompt-section">
                                                            <h3>{header}:</h3>
                                                            <p className="content-text">{content}</p>
                                                        </div>
                                                    );
                                                }
                                            } 
                                            // Section without header
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
                    
                    {/* Help Modal */}
                    {showHelpModal && (
                        <div className="prompt-modal-overlay">
                            <div className="prompt-modal help-modal">
                                <h2>Chat with Marketing Assistant</h2>
                                <button onClick={() => setShowHelpModal(false)} className="close-button">Close</button>
                                
                                <div className="chat-interface">
                                    {/* Display chat history */}
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
                                                <div className="message-header">
                                                    <strong>Assistant</strong>
                                                </div>
                                                <div className="message-content">
                                                    <div className="typing-dots">
                                                        <span></span>
                                                        <span></span>
                                                        <span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Input area for new questions */}
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
                                            <button 
                                                className="send-message-button"
                                                onClick={handleGetHelp}
                                                disabled={isHelpLoading || !helpQuestion.trim()}
                                            >
                                                {isHelpLoading ? 'Sending...' : 'Send'}
                                            </button>
                                            
                                            {chatHistory.length > 0 && (
                                                <button 
                                                    className="clear-chat-button"
                                                    onClick={() => {
                                                        setChatHistory([]);
                                                        setHelpQuestion('');
                                                        helpInputRef.current?.focus();
                                                    }}
                                                >
                                                    Clear Chat
                                                </button>
                                            )}
                                        </div>
                                        <p className="keyboard-tip">
                                            Press <strong>Ctrl+Enter</strong> to send
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- Initial Form Render --- 
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
                {isLoading ? '' : 'Analyze'}
            </button>
            {isLoading && (
                <div className="spinner-container">
                    <div className="spinner"></div>
                    <img src={audacyLogo} alt="Audacy Logo" className="spinner-logo" />
                    <p>Analyzing your data, please wait...</p>
                </div>
            )}
            {error && <div className="error-message">{error}</div>}
            {isLoading && <div className="loading-indicator">Loading analysis...</div>}
        </div>
    );
}

export default App;