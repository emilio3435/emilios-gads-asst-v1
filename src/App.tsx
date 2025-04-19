import React, { useState, useEffect, useRef } from 'react';
import htmlToRtf from 'html-to-rtf';
import Papa from 'papaparse';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import audacyLogo from './assets/audacy-logo.png';
import audacyLogoHoriz from './assets/audacy_logo_horiz_color_rgb.png';
import './App.css';

function App() {
    const [selectedTactics, setSelectedTactics] = useState<string>('');
    const [selectedKPIs, setSelectedKPIs] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [currentSituation, setCurrentSituation] = useState<string>('');
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
    const [isHelpLoading, setIsHelpLoading] = useState<boolean>(false);
    const [showKpiRecommendation, setShowKpiRecommendation] = useState<boolean>(false);
    const [helpContextFile, setHelpContextFile] = useState<File | null>(null);
    const [helpContextFileName, setHelpContextFileName] = useState<string | null>(null);
    const [helpConversation, setHelpConversation] = useState<Array<{type: string, content: string, timestamp: Date}>>([]);
    const [selectedModelId, setSelectedModelId] = useState<string>('gemini-2.5-pro-preview-03-25');
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

    // Scroll to bottom of chat when conversation updates
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [helpConversation]);

    // Load conversation history from sessionStorage when component mounts
    useEffect(() => {
        const savedConversation = sessionStorage.getItem('helpConversation');
        if (savedConversation) {
            try {
                // Parse the conversation and convert string timestamps back to Date objects
                const parsedConversation = JSON.parse(savedConversation, (key, value) => {
                    if (key === 'timestamp' && typeof value === 'string') {
                        return new Date(value);
                    }
                    return value;
                });
                setHelpConversation(parsedConversation);
            } catch (e) {
                console.error('Error loading conversation from sessionStorage:', e);
            }
        }
    }, []);

    // Save conversation history to sessionStorage whenever it changes
    useEffect(() => {
        if (helpConversation.length > 0) {
            sessionStorage.setItem('helpConversation', JSON.stringify(helpConversation));
        }
    }, [helpConversation]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        // Clear previous results when file changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
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

    const handleHelpContextFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const selectedFile = event.target.files[0];
            if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.pdf')) {
                setHelpContextFileName(selectedFile.name);
                setHelpContextFile(selectedFile);
            } else {
                setHelpContextFile(null);
                setHelpContextFileName(null);
                alert('Unsupported file type. Please upload CSV, XLSX, or PDF.');
            }
        } else {
            setHelpContextFile(null);
            setHelpContextFileName(null);
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
        // Clear previous results when tactic changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        
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
        // Clear previous results when KPI changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
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
        
        // Add user question to conversation immediately
        const newUserMessage = {
            type: 'user',
            content: helpQuestion,
            timestamp: new Date()
        };
        
        // Update conversation with the new message
        const updatedConversation = [...helpConversation, newUserMessage];
        setHelpConversation(updatedConversation);

        try {
            // Create FormData to support file uploads
            const formData = new FormData();
            
            // Append all the data fields
            formData.append('originalPrompt', promptSent || '');
            formData.append('originalAnalysis', rawAnalysisResult || '');
            formData.append('question', helpQuestion);
            formData.append('tactic', selectedTactics || '');
            formData.append('kpi', selectedKPIs || '');
            formData.append('fileName', fileName || '');
            formData.append('currentSituation', currentSituation || '');
            
            // Add conversation history to help provide context - always include it
            formData.append('conversationHistory', JSON.stringify(updatedConversation));
            
            // Add selected model ID to use the same model as the analysis
            formData.append('modelId', selectedModelId);
            
            // Append the context file if it exists
            if (helpContextFile) {
                formData.append('contextFile', helpContextFile);
            }

            // Send the help request to the server
            const response = await fetch('/api/get-help', {
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
            console.log("<<< Received data from /get-help:", data);

            // 1. Get the raw response text
            const rawResponseText = data.response || '';
            
            // 2. Parse Markdown to HTML
            const parsedHtml = await marked.parse(rawResponseText);
            console.log("<<< Parsed HTML from Markdown:", parsedHtml);

            // 3. Sanitize the *parsed* HTML 
            let sanitizedHtml = DOMPurify.sanitize(parsedHtml);
            // console.log("<<< Sanitized HTML:", sanitizedHtml); // Keep this log if helpful

            // 4. Clean any potential leftover markdown block fences (optional, might not be needed)
            sanitizedHtml = cleanMarkdownCodeBlocks(sanitizedHtml);
            console.log("<<< Final Sanitized HTML:", sanitizedHtml);
            
            // Add AI response to conversation
            const newAiMessage = {
                type: 'assistant',
                content: sanitizedHtml,
                timestamp: new Date()
            };
            console.log("<<< New AI message object:", newAiMessage);
            
            // Update conversation with the AI response
            setHelpConversation([...updatedConversation, newAiMessage]);
            console.log("<<< Updated helpConversation state:", [...updatedConversation, newAiMessage]);
        } catch (error: any) {
            console.error('Error getting help:', error);
            const errorMessage = `<p class="error-message">Error: ${error.message || 'An unexpected error occurred.'}</p>`;
            const cleanedErrorMessage = cleanMarkdownCodeBlocks(errorMessage);
            
            // Add error message to conversation
            const newErrorMessage = {
                type: 'assistant',
                content: cleanedErrorMessage,
                timestamp: new Date()
            };
            
            setHelpConversation([...updatedConversation, newErrorMessage]);
        } finally {
            setIsHelpLoading(false);
            setHelpQuestion(''); // Clear the question input for the next question
            // Don't clear the help context file after submission
            // setHelpContextFile(null);
            // setHelpContextFileName(null);
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

        // Regex to find the JSON data block specifically under 'Data Content:'
        const dataBlockRegex = /(?:\*\*Data Content:\*\*\s*`{3}json\s*)([\s\S]*?)\s*`{3}/;
        const dataMatch = prompt.match(dataBlockRegex);

        if (dataMatch && dataMatch[1]) {
            const jsonDataString = dataMatch[1].trim();
            try {
                // Parse the JSON data
                const jsonData = JSON.parse(jsonDataString);

                // Check if it's an array of objects (suitable for a table)
                if (Array.isArray(jsonData) && jsonData.length > 0 && typeof jsonData[0] === 'object') {
                    // Create a scrollable container for the table
                    let tableContainer = '<div class="csv-table-container">';
                    let table = '<table class="csv-data-table">';

                    // Create header row
                    const headers = Object.keys(jsonData[0]);
                    table += '<thead><tr>';
                    headers.forEach(header => {
                        table += `<th>${header}</th>`;
                    });
                    table += '</tr></thead>';

                    // Create table body
                    table += '<tbody>';
                    jsonData.forEach((row: any) => {
                        table += '<tr>';
                        headers.forEach(header => {
                            const value = row[header];
                            // Handle null or undefined values
                            const displayValue = value === null || value === undefined ? '' : value;
                            table += `<td>${displayValue}</td>`; // Removed inline style for cleaner CSS
                        });
                        table += '</tr>';
                    });
                    table += '</tbody></table></div>';

                    // Replace the entire ```json ... ``` block with the table
                    // We need to match the whole block including the backticks and 'json' label
                    const fullBlockRegex = /(`{3}json\s*[\s\S]*?\s*`{3})/;
                    return prompt.replace(fullBlockRegex, tableContainer);
                }
            } catch (e) {
                console.error('Error parsing JSON data within prompt:', e);
                // If parsing fails, return the original prompt without modification
                return prompt;
            }
        }

        // If no JSON data block is found or parsing fails, return original prompt
        return prompt;
    };

    // Simplified Model Selection Handler
    const handleModelSelection = (selection: 'quality' | 'speed') => {
        if (selection === 'quality') {
            setSelectedModelId('gemini-2.5-pro-preview-03-25');
        } else {
            setSelectedModelId('gemini-2.0-flash');
        }
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

        const formData = new FormData();
        formData.append('file', file);
        formData.append('tactics', JSON.stringify(selectedTactics));
        formData.append('kpis', JSON.stringify(selectedKPIs));
        formData.append('currentSituation', currentSituation);
        formData.append('targetCPA', JSON.stringify(targetCPA));
        formData.append('targetROAS', JSON.stringify(targetROAS));
        formData.append('modelId', selectedModelId);

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
            
            // Directly sanitize the received HTML, assuming backend sends HTML
            const rawHtmlContent = data.html || ''; 
            const sanitizedHtml = DOMPurify.sanitize(rawHtmlContent);
            console.log("<<< Sanitized Analysis HTML (assuming backend sent HTML):", sanitizedHtml);

            setAnalysisResult(sanitizedHtml); // Store the sanitized HTML
            setRawAnalysisResult(data.raw); 
            setPromptSent(data.prompt);
            setModelName(data.modelName);
            setShowResults(true); // Show the results page
            setShowHelpModal(false); // Ensure help modal is closed when showing new results
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

    const handleViewAnalysis = () => {
        setShowResults(true);
    };

    // Add this helper function near the top of your file, before the App component
    const cleanMarkdownCodeBlocks = (content: string): string => {
        // Remove ```html and ``` markdown code block delimiters
        let cleaned = content.replace(/```html/g, '');
        cleaned = cleaned.replace(/```/g, '');
        
        // Remove excessive whitespace/newlines at the beginning
        cleaned = cleaned.replace(/^\s+/, '');
        
        return cleaned;
    };

    if (showResults) {
        return (
            <div className="App">
                <div className="back-button-container">
                    <button onClick={handleBackToForm} className="back-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back to Input Form
                    </button>
                    <div className="navigation-info">
                        <span className="nav-step">Input</span>
                        <span className="nav-arrow">→</span>
                        <span className="nav-step active">Analysis</span>
                    </div>
                    <img src={audacyLogoHoriz} alt="Audacy Logo" className="results-header-logo" />
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
                                <p>Analysis by <strong>{modelName}</strong>
                                  <span 
                                    className="show-input-icon" 
                                    title="Show input data & prompt sent to AI" 
                                    onClick={() => setShowPrompt(true)}
                                  >
                                    ?
                                  </span>
                                </p>
                            </div>
                        )}
                    </div>
                    
                    <div className="input-section">
                        {/* Re-added Download button (exports to RTF) */}
                        <button className="export-button" onClick={handleExportToRtf}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download
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
                    </div>
                    
                    {/* Prompt Modal (no changes needed) */}
                    {showPrompt && (
                        <div className="prompt-modal-overlay">
                            <div className="prompt-modal prompt-content">
                                <h2>Prompt Sent to LLM:</h2>
                                <button onClick={() => setShowPrompt(false)} className="close-button">&times;</button>
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
                        <div className="prompt-modal-backdrop">
                            <div className="prompt-modal help-modal">
                                <div className="modal-header">
                                    <h2>Chat with Audacy AI</h2>
                                    <div className="modal-header-buttons">
                                        <button onClick={() => {/* Minimize logic placeholder */}} className="minimize-button" title="Minimize Chat">{/* Minimize Icon */}</button>
                                        <button onClick={() => setShowHelpModal(false)} className="close-button" title="Close Chat">&times;</button>
                                    </div>
                                </div>
                                
                                {/* Conversation History */}
                                {helpConversation.length > 0 && (
                                    <div className="help-conversation" ref={chatContainerRef}>
                                        <div className="conversation-controls">
                                            <button 
                                                className="new-chat-button"
                                                onClick={() => {
                                                    setHelpConversation([]);
                                                    sessionStorage.removeItem('helpConversation');
                                                }}
                                            >
                                                Start New Chat
                                            </button>
                                            <span className="conversation-info">
                                                {helpConversation.length > 0 && 
                                                    sessionStorage.getItem('helpConversation') ? 
                                                    '(Includes messages from current session)' : ''}
                                            </span>
                                        </div>
                                        {helpConversation.map((message, index) => (
                                            <div key={index} className={`conversation-message ${message.type === 'user' ? 'user-message-container' : 'assistant-message-container'}`}>
                                                <div className={message.type === 'user' ? 'user-query' : 'assistant-response'}>
                                                    {message.type === 'user' ? (
                                                        <div dangerouslySetInnerHTML={{ __html: message.content }} /> 
                                                    ) : (
                                                        <div dangerouslySetInnerHTML={{ __html: message.content }} />
                                                    )}
                                                </div>
                                                <div className="message-time">
                                                    {message.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="help-form">
                                    {helpConversation.length === 0 && (
                                        <p className="help-instructions">
                                            Ask a specific question about the analysis or request additional information based on the data.
                                        </p>
                                    )}
                                    
                                    {/* Keep input hidden, label will trigger it */}
                                    <input
                                        type="file"
                                        id="helpContextFile"
                                        accept=".csv, .xlsx, .pdf"
                                        onChange={handleHelpContextFileChange}
                                        style={{ display: 'none' }}
                                    />
                                    
                                    <textarea
                                        ref={helpInputRef}
                                        className="help-textarea"
                                        value={helpQuestion}
                                        onChange={handleHelpQuestionChange}
                                        onKeyDown={handleHelpKeyDown}
                                        placeholder={helpConversation.length > 0 ? "Ask a follow-up question..." : "Example: Can you explain more about the CTR metrics? What other KPIs should I focus on?"}
                                        rows={3}
                                    />
                                    
                                    <div className="help-controls-container">
                                        <div className="help-button-container">
                                            <button 
                                                className="submit-help-button"
                                                onClick={handleGetHelp}
                                                disabled={isHelpLoading || !helpQuestion.trim()}
                                            >
                                                {isHelpLoading ? 'Loading...' : 'Send'}
                                            </button>
                                            
                                            {helpConversation.length > 0 && (
                                                <button 
                                                    className="clear-help-button"
                                                    onClick={() => {
                                                        setHelpConversation([]);
                                                        setHelpQuestion('');
                                                        helpInputRef.current?.focus();
                                                        sessionStorage.removeItem('helpConversation');
                                                    }}
                                                >
                                                    Clear Conversation
                                                </button>
                                            )}
                                        </div>

                                        {/* File upload trigger moved here */} 
                                        <div className="file-upload-area">
                                            <label htmlFor="helpContextFile" className="upload-file-icon-button" title="Upload context file (optional)">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                                            </label>
                                            {helpContextFileName && (
                                                <div className="uploaded-file-info">
                                                    <span className="uploaded-file-name" title={helpContextFileName}>{helpContextFileName}</span>
                                                    <button 
                                                        className="context-file-remove icon-style"
                                                        onClick={() => { setHelpContextFile(null); setHelpContextFileName(null); }}
                                                        title="Remove uploaded file"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <p className="keyboard-tip">
                                        Pro tip: Press <strong>Ctrl+Enter</strong> to send your question quickly.
                                    </p>
                                </div>
                                
                                {isHelpLoading && (
                                    <div className="help-loading">
                                        <div className="spinner"></div>
                                        <p>Processing your question...</p>
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
            <div className="app-header">
                <img src={audacyLogo} alt="Audacy Logo" className="audacy-logo" />
                <div className="model-selector-simple">
                    <span className="model-selector-label">Analysis Speed:</span>
                    <button 
                        className={`model-button ${selectedModelId === 'gemini-2.0-flash' ? 'active' : ''}`}
                        onClick={() => handleModelSelection('speed')}
                        title="Faster Analysis: Uses Gemini 2.0 Flash for quicker, more concise results."
                    >
                        Faster
                    </button>
                    <button 
                        className={`model-button ${selectedModelId === 'gemini-2.5-pro-preview-03-25' ? 'active' : ''}`}
                        onClick={() => handleModelSelection('quality')}
                        title="Better Quality Analysis: Uses Gemini 2.5 Pro for slower, more detailed results."
                    >
                        Better Quality
                    </button>
                </div>
            </div>

            <h1>Marketing Assistant</h1>
            <p className="app-instructions">
                Upload your campaign data (CSV, XLSX, or PDF), select the relevant Tactic and KPI, and describe the client's situation and goals. 
                The AI will analyze the data and provide actionable insights tailored for Audacy AEs.
            </p>
            
            <div className="form-grid">
                <div className="form-column">
                    <div className="select-container">
                        <label htmlFor="tactics-list">Select Tactic:</label>
                        <select
                            id="tactics-list"
                            className="tactics-list"
                            value={selectedTactics}
                            onChange={handleTacticChange}
                            required
                            title="Select the primary marketing tactic used in the campaign data."
                        >
                            <option value="" disabled>Select Tactic</option>
                            <option value="Amazon DSP">Amazon DSP</option>
                            <option value="Display Ads">Display Ads</option>
                            <option value="Email eDirect">Email eDirect</option>
                            <option value="OTT">OTT</option>
                            <option value="Podcasting">Podcasting</option>
                            <option value="SEM">SEM</option>
                            <option value="SEO">SEO</option>
                            <option value="Social Ads">Social Ads</option>
                            <option value="Streaming Audio">Streaming Audio</option>
                            <option value="Video Display Ads">Video Display Ads</option>
                            <option value="YouTube">YouTube</option>
                        </select>
                    </div>
                </div>

                <div className="form-column">
                    <div className="select-container">
                        <label htmlFor="kpi-list">Select KPI:</label>
                        <select
                            id="kpi-list"
                            className="kpi-list"
                            value={selectedKPIs}
                            onChange={handleKPIChange}
                            required
                            title="Select the main Key Performance Indicator relevant to the campaign goals."
                        >
                            <option value="" disabled>Select KPI</option>
                            {/* Alphabetized List */}
                            <option value="Clicks">Clicks</option>
                            <option value="Conversion Rate">Conversion Rate</option>
                            <option value="Conversions">Conversions</option>
                            <option value="CPA">CPA</option>
                            <option value="CPC">CPC</option>
                            <option value="CTR">CTR</option>
                            <option value="Impressions">Impressions</option>
                            <option value="ROAS">ROAS</option>
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
                </div>
            </div>

            <div className="text-area-container">
                <label htmlFor="currentSituation">Current Situation & Goals:</label>
                <textarea
                    id="currentSituation"
                    className="text-area"
                    value={currentSituation}
                    onChange={handleSituationChange}
                    placeholder="Describe your current marketing situation and goals..."
                    rows={3}
                    title="Briefly describe the client's current situation, challenges, or the context for this analysis."
                />
            </div>
            
            {/* Moved file upload section below Current Situation & Goals */}
            <div className="file-upload-section">
                <input
                    type="file"
                    id="fileInput"
                    accept=".csv, .xlsx, .pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
                <label 
                    htmlFor="fileInput" 
                    className="choose-file-button"
                    title="Upload campaign performance data (CSV, XLSX, or PDF)."
                >
                    Choose File
                </label>
                {fileName && <p className="file-name"><span>Selected File:</span> {fileName}</p>}
                {file && (
                    <button className="remove-file-button" onClick={() => { setFile(null); setFileName(null); }}>
                        Remove File
                    </button>
                )}
                {fileName === null && file === null && <p className="file-name">Please select a CSV, XLSX, or PDF file.</p>}
            </div>

            <button 
                className="rounded-element submit-button" 
                onClick={handleSubmit} 
                disabled={isLoading}
                title="Submit the data and inputs to generate the AI analysis."
            >
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
            
            {/* Add View Analysis button when analysis result exists */}
            {analysisResult && !showResults && (
                <div className="input-to-analysis-navigation">
                    <div className="navigation-info">
                        <span className="nav-step active">Input</span>
                        <span className="nav-arrow">→</span>
                        <span className="nav-step">Analysis</span>
                    </div>
                    <button className="rounded-element view-analysis-button" onClick={handleViewAnalysis}>
                        View Analysis
                    </button>
                </div>
            )}
        </div>
    );
}

export default App;