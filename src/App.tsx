import React, { useState, useEffect, useRef } from 'react';
import htmlToRtf from 'html-to-rtf';
import Papa from 'papaparse';
import DOMPurify from 'dompurify';
import audacyLogo from './assets/audacy_logo_horiz_color_rgb.png';
import './App.css';

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
    const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
    const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
    const [helpQuestion, setHelpQuestion] = useState<string>('');
    const [helpResponse, setHelpResponse] = useState<string | null>(null);
    const [isHelpLoading, setIsHelpLoading] = useState<boolean>(false);
    const [showKpiRecommendation, setShowKpiRecommendation] = useState<boolean>(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const helpInputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setIsExportMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Focus on help input when modal opens
    useEffect(() => {
        if (showHelpModal && helpInputRef.current) {
            setTimeout(() => {
                helpInputRef.current?.focus();
            }, 100);
        }
    }, [showHelpModal]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setAnalysisResult(null);
        setError(null);
        if (event.target.files && event.target.files.length > 0) {
            const selectedFile = event.target.files[0];
            if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.pdf')) {
                setFileName(selectedFile.name);
                setError(null);
            } else {
                setFile(null);
                setFileName(null);
                setError('Unsupported file type. Please upload CSV, XLSX, or PDF.');
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
            return recommendations[tactic].join(', ');
        }
        return '';
    };

    const handleTacticChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedTactics(event.target.value);
        // Show KPI recommendation popup if we have recommendations for this tactic
        if (event.target.value && recommendations[event.target.value]) {
            setShowKpiRecommendation(true);
            // Auto-hide the recommendation after 15 seconds
            setTimeout(() => {
                setShowKpiRecommendation(false);
            }, 15000);
        }
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

        setIsHelpLoading(true);
        setHelpResponse(null);

        try {
            // Prepare data for the help request
            const helpData = {
                originalPrompt: promptSent,
                originalAnalysis: rawAnalysisResult,
                question: helpQuestion,
                tactic: selectedTactics,
                kpi: selectedKPIs,
                fileName: fileName,
                currentSituation: currentSituation,
                desiredOutcome: desiredOutcome
            };

            // Send the help request to the server
            const response = await fetch('/api/get-help', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(helpData)
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
            setHelpResponse(sanitizedHtml);
        } catch (error: any) {
            console.error('Error getting help:', error);
            setHelpResponse(`<p class="error-message">Error: ${error.message || 'An unexpected error occurred.'}</p>`);
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

    const handleExportToGmail = () => {
        if (analysisResult && rawAnalysisResult) {
            try {
                // Create a well-formatted email body with campaign info and analysis
                let emailContent = `Campaign Analysis: ${selectedTactics} - ${selectedKPIs}\n\n`;
                
                // Add campaign information
                emailContent += `CAMPAIGN INFORMATION:\n`;
                emailContent += `Tactic: ${selectedTactics}\n`;
                emailContent += `KPI: ${selectedKPIs}\n`;
                if (fileName) emailContent += `File: ${fileName}\n`;
                if (currentSituation) emailContent += `Current Situation: ${currentSituation}\n`;
                if (desiredOutcome) emailContent += `Desired Outcome: ${desiredOutcome}\n\n`;
                
                // Add the raw analysis text without HTML tags
                emailContent += `ANALYSIS RESULTS:\n\n${rawAnalysisResult}\n\n`;
                
                // Add attribution
                if (modelName) {
                    emailContent += `\nAnalysis powered by ${modelName}`;
                }
                
                // Add campaign date
                const today = new Date();
                emailContent += `\nAnalysis Date: ${today.toLocaleDateString()}`;
                
                // Check if content is too long for most email clients (typically ~100KB limit)
                // Use a more conservative 50KB limit to be safe
                if (emailContent.length > 50000) {
                    // Truncate the content and add a note about using RTF export for full content
                    const truncatedContent = emailContent.substring(0, 49000) + 
                        "\n\n[NOTE: This analysis has been truncated due to email size limitations. " +
                        "For the complete analysis, please use the 'Export to RTF' option.]";
                    emailContent = truncatedContent;
                }
                
                // Encode the subject and body for the mailto URL
                const subject = encodeURIComponent(`Campaign Analysis: ${selectedTactics} - ${selectedKPIs}`);
                const body = encodeURIComponent(emailContent);
                
                // Open the default email client with the pre-filled email
                window.location.href = `mailto:?subject=${subject}&body=${body}`;
            } catch (error) {
                console.error('Error formatting email content:', error);
                alert('An error occurred while preparing the email. Please try again.');
            }
        } else {
            alert("No analysis result available to export.");
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
                                table += `<td style="color: #333 !important;">${displayValue}</td>`;
                            });
                            table += '</tr>';
                        });
                        table += '</tbody>';
                    }
                    
                    table += '</table></div>';
                    
                    // Add inline CSS for table styling with more explicit color rules
                    tableContainer = '<style>' +
                        '.csv-table-container { overflow-x: auto; margin: 10px 0; max-height: 400px; overflow-y: auto; color: #333; }' +
                        '.csv-data-table { width: 100%; border-collapse: collapse; color: #333; }' +
                        '.csv-data-table th, .csv-data-table td { border: 1px solid #ddd; padding: 8px; text-align: left; color: #333 !important; }' +
                        '.csv-data-table td { color: #333 !important; } ' + 
                        '.csv-data-table thead { position: sticky; top: 0; background-color: #f2f2f2; }' +
                        '.csv-data-table th { background-color: #f2f2f2; font-weight: bold; color: #333 !important; }' +
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
                        table += `<th style="color: #333 !important;">${header}</th>`;
                    });
                    table += '</tr></thead>';
                    
                    // Create table body
                    table += '<tbody>';
                    parsedData.data.forEach((row: any) => {
                        table += '<tr>';
                        Object.values(row).forEach((value: any) => {
                            // Handle null or undefined values
                            const displayValue = value === null || value === undefined ? '' : value;
                            table += `<td style="color: #333 !important;">${displayValue}</td>`;
                        });
                        table += '</tr>';
                    });
                    table += '</tbody></table></div>';
                    
                    // Add inline CSS for table styling with more explicit color rules
                    tableContainer = '<style>' +
                        '.csv-table-container { overflow-x: auto; margin: 10px 0; max-height: 400px; overflow-y: auto; color: #333; }' +
                        '.csv-data-table { width: 100%; border-collapse: collapse; color: #333; }' +
                        '.csv-data-table th, .csv-data-table td { border: 1px solid #ddd; padding: 8px; text-align: left; color: #333 !important; }' +
                        '.csv-data-table td { color: #333 !important; } ' + 
                        '.csv-data-table thead { position: sticky; top: 0; background-color: #f2f2f2; }' +
                        '.csv-data-table th { background-color: #f2f2f2; font-weight: bold; color: #333 !important; }' +
                        '.csv-data-table tr:nth-child(even) { background-color: #f9f9f9; }' +
                        '.csv-data-table tr:hover { background-color: #f0f0f0; }' +
                        '</style>' + tableContainer;
                    
                    return prompt.replace(csvDataMatch[0], `<div style="color: #333; font-weight: bold;">INPUT DATA:</div>\n${tableContainer}`);
                }
            } catch (e) {
                console.error('Error parsing CSV data:', e);
            }
        }
        return prompt;
    };

    const handleSubmit = async () => {
        setError(null);
        setAnalysisResult(null);
        setPromptSent(null);
        setModelName(null);
        setShowResults(false);

        if (!file) {
            setError('Please upload a file for analysis.');
            return;
        }

        if (!selectedTactics) {
            setError('Please select a tactic.');
            return;
        }

        if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.pdf')) {
            setError('Invalid file type selected. Please choose a CSV, XLSX, or PDF file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('tactics', JSON.stringify(selectedTactics));
        formData.append('kpis', JSON.stringify(selectedKPIs));
        formData.append('currentSituation', currentSituation);
        formData.append('desiredOutcome', desiredOutcome);
        formData.append('targetCPA', JSON.stringify(targetCPA));
        formData.append('targetROAS', JSON.stringify(targetROAS));

        setIsLoading(true);

        try {
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
            const sanitizedHtml = DOMPurify.sanitize(data.html);
            setAnalysisResult(sanitizedHtml);
            setRawAnalysisResult(data.raw);
            setPromptSent(data.prompt);
            setModelName(data.modelName);
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

    if (showResults) {
        return (
            <div className="App">
                <div className="back-button-container">
                    <button onClick={handleBackToForm} className="back-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back to Form
                    </button>
                </div>
                <div className="analysis-page-container">
                    <div className="results-display">
                        <div className="prompt-display-box">
                            <div className="campaign-info">
                                <div className="info-item">
                                    <span className="info-label">Tactic:</span>
                                    <span className="info-value">{selectedTactics}</span>
                                </div>
                                <div className="info-item">
                                    <span className="info-label">KPI:</span>
                                    <span className="info-value">{selectedKPIs}</span>
                                </div>
                                {fileName && (
                                    <div className="info-item">
                                        <span className="info-label">File:</span>
                                        <span className="info-value">{fileName}</span>
                                    </div>
                                )}
                            </div>
                            {(currentSituation || desiredOutcome) && (
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
                            )}
                        </div>
                        
                        {/* Analysis results */}
                        {analysisResult ? (
                            <div dangerouslySetInnerHTML={{ __html: analysisResult }} />
                        ) : (
                            <div className="no-results">
                                <p>No analysis result available.</p>
                            </div>
                        )}
                        
                        {/* Model attribution */}
                        {modelName && (
                            <div className="model-attribution">
                                <p>Analysis by <strong>{modelName}</strong></p>
                            </div>
                        )}
                    </div>
                    
                    <div className="input-section">
                        <button
                            className="show-input-button"
                            onClick={() => setShowPrompt(true)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            Show Input Data
                        </button>
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
                        <div className="export-container">
                            <button className="export-button" onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                Download
                            </button>
                            {isExportMenuOpen && (
                                <div className="export-menu" ref={exportMenuRef}>
                                    <button onClick={() => { handleExportToRtf(); setIsExportMenuOpen(false); }}>
                                        Export to RTF
                                    </button>
                                    <button onClick={() => { handleExportToGmail(); setIsExportMenuOpen(false); }}>
                                        Export to Email
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Prompt Modal (no changes needed) */}
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
                                <h2>Ask for Additional Help</h2>
                                <button onClick={() => setShowHelpModal(false)} className="close-button">Close</button>
                                
                                <div className="help-form">
                                    <p className="help-instructions">
                                        Ask a specific question about the analysis or request additional information based on the data.
                                    </p>
                                    
                                    <textarea
                                        ref={helpInputRef}
                                        className="help-textarea"
                                        value={helpQuestion}
                                        onChange={handleHelpQuestionChange}
                                        onKeyDown={handleHelpKeyDown}
                                        placeholder="Example: Can you explain more about the CTR metrics? What other KPIs should I focus on? How should I implement the first recommendation?"
                                        rows={4}
                                    />
                                    
                                    <div className="help-button-container">
                                        <button 
                                            className="submit-help-button"
                                            onClick={handleGetHelp}
                                            disabled={isHelpLoading}
                                        >
                                            {isHelpLoading ? 'Loading...' : 'Submit Question'}
                                        </button>
                                        
                                        {helpResponse && (
                                            <button 
                                                className="clear-help-button"
                                                onClick={() => {
                                                    setHelpResponse(null);
                                                    setHelpQuestion('');
                                                    helpInputRef.current?.focus();
                                                }}
                                            >
                                                Clear & Ask New Question
                                            </button>
                                        )}
                                    </div>
                                    
                                    <p className="keyboard-tip">
                                        Pro tip: Press <strong>Ctrl+Enter</strong> to submit your question quickly.
                                    </p>
                                </div>
                                
                                {isHelpLoading && (
                                    <div className="help-loading">
                                        <div className="spinner"></div>
                                        <p>Processing your question...</p>
                                    </div>
                                )}
                                
                                {helpResponse && (
                                    <div className="help-response">
                                        <h3>Response:</h3>
                                        <div 
                                            className="help-response-content"
                                            dangerouslySetInnerHTML={{ __html: helpResponse }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="App">
            <img src={audacyLogo} alt="Audacy Logo" className="audacy-logo" />
            <h1>Marketing Assistant</h1>
            <input
                type="file"
                id="fileInput"
                accept=".csv, .xlsx, .pdf"
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
            {fileName === null && file === null && <p className="file-name">Please select a CSV, XLSX, or PDF file.</p>}
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
            {selectedTactics && getRecommendationMessage(selectedTactics) && showKpiRecommendation && (
                <div className="kpi-recommendation-popup">
                    <div className="kpi-recommendation-content">
                        <div className="kpi-recommendation-header">
                            <span>Recommended KPIs</span>
                            <button 
                                className="kpi-recommendation-close"
                                onClick={() => setShowKpiRecommendation(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="kpi-recommendation-body">
                            {getRecommendationMessage(selectedTactics)}
                        </div>
                    </div>
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