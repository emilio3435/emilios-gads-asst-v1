import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import audacyLogo from './assets/audacy-logo.png';
import audacyLogoHoriz from './assets/audacy_logo_horiz_color_rgb.png';

// Define the structure for a history entry
interface HistoryEntry {
  id: string; // Unique ID, maybe timestamp based
  timestamp: number;
  inputs: {
    clientName: string;
    selectedTactics: string;
    selectedKPIs: string;
    fileName: string | null;
    currentSituation: string;
    selectedModelId: string;
    outputDetail: 'brief' | 'detailed';
  };
  results: {
    analysisResult: string | null; // Store the processed HTML result
    rawAnalysisResult: string | null; // Optionally store raw too
    modelName: string | null;
    promptSent: string | null; // The prompt that was constructed
    helpConversation: Array<{type: string, content: string, timestamp: Date}>; // Add field for chat history
  };
}

// Helper function for basic syntax highlighting
const formatPromptForDisplay = (prompt: string | null): string => {
    if (!prompt) return '';

    let formatted = prompt;

    // Escape HTML characters to prevent XSS if not careful later
    formatted = formatted
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Highlight comments (// ...)
    formatted = formatted.replace(/(\/\/.*)/g, '<span class="prompt-comment">$1</span>');

    // Highlight placeholders ({{...}})
    formatted = formatted.replace(/(\{\{.*?\}\})/g, '<span class="prompt-placeholder">$1</span>');
    
    // Highlight delimiters
    formatted = formatted.replace(/(---HTML_ANALYSIS_START---|---HTML_ANALYSIS_END---)/g, '<span class="prompt-delimiter">$1</span>');

    // Highlight backticks
    formatted = formatted.replace(/(`)/g, '<span class="prompt-backtick">$1</span>');

    // Highlight keywords (simple example, add more as needed)
    // Use word boundaries (\b) to avoid matching parts of words
    const keywords = ['const', 'let', 'if', 'else', 'for', 'async', 'await', 'function', 'return'];
    keywords.forEach(keyword => {
        const regex = new RegExp(`(\\b${keyword}\\b)`, 'g');
        formatted = formatted.replace(regex, '<span class="prompt-keyword">$1</span>');
    });

    // Basic string highlighting (content within backticks) - This is tricky and might not be perfect
    // It might incorrectly highlight things if backticks are nested or escaped
    // formatted = formatted.replace(/`([^`]*)`/g, '`<span class="prompt-string">$1</span>`');
    // Simpler: Just color the backticks themselves (done above)

    return formatted; 
};

function App() {
    const [selectedTactics, setSelectedTactics] = useState<string>('');
    const [selectedKPIs, setSelectedKPIs] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [currentSituation, setCurrentSituation] = useState<string>('');
    const [clientName, setClientName] = useState<string>('');
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [rawAnalysisResult, setRawAnalysisResult] = useState<string | null>(null);
    const [promptSent, setPromptSent] = useState<string | null>(null);
    const [modelName, setModelName] = useState<string | null>(null);
    const [showPrompt, setShowPrompt] = useState<boolean>(false);
    const [showResults, setShowResults] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
    const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
    const [helpQuestion, setHelpQuestion] = useState<string>('');
    const [isHelpLoading, setIsHelpLoading] = useState<boolean>(false);
    const [showKpiRecommendation, setShowKpiRecommendation] = useState<boolean>(false);
    const [helpContextFile, setHelpContextFile] = useState<File | null>(null);
    const [helpContextFileName, setHelpContextFileName] = useState<string | null>(null);
    const [helpConversation, setHelpConversation] = useState<Array<{type: string, content: string, timestamp: Date}>>([]);
    const [selectedModelId, setSelectedModelId] = useState<string>('gemini-2.0-flash');
    const [outputDetail, setOutputDetail] = useState<'brief' | 'detailed'>('brief');
    const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
    const [analysisHistory, setAnalysisHistory] = useState<HistoryEntry[]>([]);
    const [isViewingHistory, setIsViewingHistory] = useState<boolean>(false);
    const [selectedHistoryEntryId, setSelectedHistoryEntryId] = useState<string | null>(null);
    const [showChatHistoryModal, setShowChatHistoryModal] = useState<boolean>(false);
    const [viewingChatHistory, setViewingChatHistory] = useState<Array<{type: string, content: string, timestamp: Date}>>([]);
    const [originalFileContent, setOriginalFileContent] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 5; // Show 5 history items per page
    const helpInputRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // --- Pagination Calculations ---
    const totalPages = Math.ceil(analysisHistory.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedHistory = analysisHistory.slice(startIndex, endIndex);
    // --- End Pagination Calculations ---

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

    // Load analysis history from localStorage on mount
    useEffect(() => {
        const savedHistory = localStorage.getItem('analysisHistory');
        if (savedHistory) {
            try {
                const parsedHistory: HistoryEntry[] = JSON.parse(savedHistory);
                // Optionally sort history, newest first
                parsedHistory.sort((a, b) => b.timestamp - a.timestamp);
                setAnalysisHistory(parsedHistory);
            } catch (e) {
                console.error('Error loading analysis history from localStorage:', e);
                localStorage.removeItem('analysisHistory'); // Clear corrupted data
            }
        }
    }, []);

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
        'SEM': ['ROAS', 'CPA', 'Conversions', 'Conversion Rate', 'CTR'],
        'SEO': ['Conversions', 'Conversion Rate', 'Clicks', 'CTR'],
        'Display Ads': ['Impressions', 'Clicks', 'CTR'],
        'Video Display Ads': ['Impressions', 'Clicks', 'CTR'],
        'YouTube': ['Impressions', 'Clicks', 'CTR'],
        'OTT': ['Impressions'],
        'Social Ads': ['Impressions', 'Clicks', 'CTR', 'Conversions'],
        'Email eDirect': ['CTR', 'Conversion Rate', 'Conversions'],
        'Amazon DSP': ['ROAS', 'Conversions', 'CPA'],
        'Podcasting': ['Impressions'],
        'Streaming Audio': ['Impressions', 'Clicks', 'CTR']
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

    const handleClientNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setClientName(event.target.value);
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

        // --- Define API Base URL ---
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''; // Use import.meta.env for Vite

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
            // Add the main analysis result if it exists
            if (analysisResult) {
                formData.append('analysisResult', analysisResult);
            }
            
            // Add conversation history to help provide context - always include it
            formData.append('conversationHistory', JSON.stringify(updatedConversation)); // Sends the *updated* history
            
            // Add selected model ID to use the same model as the analysis
            formData.append('modelId', selectedModelId);
            
            // Append the context file if it exists
            if (helpContextFile) {
                formData.append('contextFile', helpContextFile);
            }

            // --- NEW: Append original file content if available ---
            if (originalFileContent) {
                formData.append('originalFileContent', originalFileContent);
            }

            // Send the help request to the server
            const response = await fetch(`${apiBaseUrl}/get-help`, { // CORRECTED ENDPOINT
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

    // Handler for the new Output Detail toggle
    const handleOutputDetailChange = (detail: 'brief' | 'detailed') => {
        setOutputDetail(detail);
    };

    const handleSubmit = async () => {
        if (!file || !selectedTactics || !selectedKPIs) {
            alert('Please select a tactic, KPI, and upload a file.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null); // Clear previous results
        setRawAnalysisResult(null);
        setPromptSent(null);
        setModelName(null);
        setShowResults(false);
        setIsViewingHistory(false); // Reset viewing history flag
        setSelectedHistoryEntryId(null); // Reset selected history entry

        const formData = new FormData();
        formData.append('file', file);
        formData.append('tactics', JSON.stringify(selectedTactics));
        formData.append('kpis', JSON.stringify(selectedKPIs));
        formData.append('currentSituation', currentSituation);
        formData.append('modelId', selectedModelId);
        formData.append('outputDetail', outputDetail);
        formData.append('clientName', clientName);

        // --- Define API Base URL ---
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''; // Use import.meta.env for Vite

        try {
            const response = await fetch(`${apiBaseUrl}/analyze`, { // Remove /api prefix
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
            // --- NEW: Store original file content ---
            setOriginalFileContent(data.rawFileContent || null);

            // --- Add to History ---
            const newHistoryEntry: HistoryEntry = {
                id: `analysis-${Date.now()}`,
                timestamp: Date.now(),
                inputs: {
                    clientName,
                    selectedTactics,
                    selectedKPIs,
                    fileName,
                    currentSituation,
                    selectedModelId,
                    outputDetail,
                },
                results: {
                    analysisResult: sanitizedHtml, // Save the sanitized HTML
                    rawAnalysisResult: data.raw,
                    modelName: data.modelName,
                    promptSent: data.prompt,
                    helpConversation: [...helpConversation] // Save a copy of the current chat
                }
            };
            
            // Update state and localStorage
            setAnalysisHistory(prevHistory => {
                const updatedHistory = [newHistoryEntry, ...prevHistory];
                const HISTORY_LIMIT = 20; // Keep limit logic if desired
                if (updatedHistory.length > HISTORY_LIMIT) {
                    updatedHistory.length = HISTORY_LIMIT; // Truncate the array
                }
                localStorage.setItem('analysisHistory', JSON.stringify(updatedHistory));
                setCurrentPage(1); // <<< Reset to first page on new entry
                return updatedHistory;
            });
            // --- End Add to History ---

            // >>> Clear chat history when a new analysis is successful <<<
            setHelpConversation([]);
            sessionStorage.removeItem('helpConversation');

            setShowResults(true); // Show the results page
            setShowHelpModal(false); // Ensure help modal is closed when showing new results
            setIsViewingHistory(false); // Set to false as this is a fresh analysis
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
        setIsViewingHistory(false); // Ensure this flag is reset
        setSelectedHistoryEntryId(null); // Reset selected history entry ID
        // Do NOT clear the form fields here if we want them retained
    };

    const handleViewAnalysis = () => {
        setShowResults(true);
    };

    // Function to handle starting a new inquiry
    const handleNewInquiry = () => {
        // Reset form fields
        setSelectedTactics('');
        setSelectedKPIs('');
        setFile(null);
        setFileName(null);
        setCurrentSituation('');
        setClientName('');
        // Reset results & status
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        setModelName(null);
        setError(null);
        setShowResults(false);
        setIsLoading(false);
        setIsViewingHistory(false); // Reset viewing history flag
        setSelectedHistoryEntryId(null); // Reset selected history entry

        // >>> Clear chat history and related state <<<
        setHelpConversation([]);
        sessionStorage.removeItem('helpConversation');
        setHelpQuestion(''); // Clear any lingering question text
        setHelpContextFile(null); // Clear help context file
        setHelpContextFileName(null);
        // --- NEW: Clear original file content ---
        setOriginalFileContent(null);
        // --- NEW: Reset pagination ---
        setCurrentPage(1);

        // Reset advanced options (optional, based on desired behavior)
        // setSelectedModelId('gemini-2.0-flash'); 
        // setOutputDetail('brief');
        // setShowAdvancedOptions(false);
        
        // Scroll to top (optional)
        window.scrollTo(0, 0);
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

    const handleEditInputs = () => {
        setShowResults(false); // Go back to form view, state is preserved
    };

    // Function to load a previous analysis from history
    const handleLoadHistory = (entryId: string) => {
        const entry = analysisHistory.find(h => h.id === entryId);
        if (entry) {
            // Load data from history into state
            setClientName(entry.inputs.clientName || '');
            setSelectedTactics(entry.inputs.selectedTactics || '');
            setSelectedKPIs(entry.inputs.selectedKPIs || '');
            setFileName(entry.inputs.fileName || null);
            setFile(null); // Can't restore the actual file object
            setCurrentSituation(entry.inputs.currentSituation || '');
            setSelectedModelId(entry.inputs.selectedModelId || 'gemini-2.0-flash');
            setOutputDetail(entry.inputs.outputDetail || 'brief');

            // Load results
            setAnalysisResult(entry.results.analysisResult || null);
            setRawAnalysisResult(entry.results.rawAnalysisResult || null);
            setPromptSent(entry.results.promptSent || null);
            setModelName(entry.results.modelName || null);
            // --- NEW: Load original file content from history (IF we decide to save it) ---
            // For now, we are NOT saving it to history, so clear it when loading history.
            setOriginalFileContent(null);

            // Set flags and show results
            setError(null);
            setIsLoading(false);
            setShowResults(true);
            setIsViewingHistory(true); // Set viewing history flag
            setSelectedHistoryEntryId(entryId); // Set the selected entry ID

            // Scroll to top (optional, good UX)
            window.scrollTo(0, 0);
        } else {
            setError('Could not load the selected history entry.');
        }
    };

    // Function to open the chat history modal
    const handleViewChatHistory = (entryId: string) => {
        const entry = analysisHistory.find(h => h.id === entryId);
        // Ensure helpConversation exists and is an array before accessing length
        if (entry && Array.isArray(entry.results.helpConversation) && entry.results.helpConversation.length > 0) {
            setViewingChatHistory(entry.results.helpConversation);
            setShowChatHistoryModal(true);
        } else {
            // Provide feedback if no history is found or if it's unexpectedly not an array
            alert('No chat history found for this analysis.');
        }
    };

    // Helper function to format timestamp for history display
    const formatHistoryTimestamp = (timestamp: number): string => {
        const now = new Date();
        const historyDate = new Date(timestamp);
        const diffTime = now.getTime() - historyDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }; // Format time

        if (diffDays < 1 && now.getDate() === historyDate.getDate()) {
            // Today
            return `Today, ${historyDate.toLocaleTimeString(undefined, timeOptions)}`;
        } else if (diffDays < 2 && now.getDate() - historyDate.getDate() === 1) {
            // Yesterday
            return `Yesterday, ${historyDate.toLocaleTimeString(undefined, timeOptions)}`;
        } else {
            // Older - just date
            const dateOptions: Intl.DateTimeFormatOptions = { year: '2-digit', month: 'numeric', day: 'numeric' };
            return historyDate.toLocaleDateString(undefined, dateOptions);
        }
    };

    if (showResults) {
        return (
            <div className="App">
                {/* <div className="back-button-container"> */} {/* Old header hidden via CSS */}
                    {/* Logo remains, styled via CSS */}
                    {/* <img src={audacyLogoHoriz} alt="Audacy Logo" className="results-header-logo" /> */}
                    {/* Navigation info removed */}
                {/* </div> */}
                <div className="analysis-page-container">
                    {/* New Standalone Logo & Back Button */} 
                    <img src={audacyLogoHoriz} alt="Audacy Logo" className="results-header-logo" />
                    <button onClick={handleBackToForm} className="page-back-button" title="Back to Input Form">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline> 
                        </svg>
                         Back
                    </button>
                    
                    <div className="results-display">
                        <div className="prompt-display-box">
                            <div className="campaign-info">
                                {/* Row 1 */} 
                                <div className="info-row">
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
                                {/* Row 2 */} 
                                <div className="info-row">
                                    {/* Model Selection Display */}
                                    <div className="info-item">
                                        <span className="info-label">Model:</span>
                                        <span className="info-value">
                                            {selectedModelId === 'gemini-2.5-pro-preview-03-25' ? 'Better' : 'Faster'}
                                        </span>
                                    </div>
                                    {/* Output Detail Display */}
                                    <div className="info-item">
                                        <span className="info-label">Detail:</span>
                                        <span className="info-value">
                                            {outputDetail === 'detailed' ? 'Detailed' : 'Brief'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* Add Current Situation/Goals below campaign info if it exists */}
                            {currentSituation && (
                                <div className="campaign-context">
                                    <div className="context-item">
                                        <span className="context-label">Current Situation & Goals:</span>
                                        <p className="context-value">{currentSituation}</p>
                                    </div>
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
                        {/* Review Inputs Button (Removed) */}
                         {/* <button className="edit-inputs-button" onClick={handleEditInputs}>
                             Review Inputs
                         </button> */}

                        {/* Discuss this Analysis Button (Conditionally Render) */}
                        { !isViewingHistory && (
                            <button
                                className="help-button"
                                onClick={() => setShowHelpModal(true)}
                                // No need for disabled prop now, as it won't render when viewing history
                                title={"Discuss this Analysis"}
                            >
                               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                Discuss this Analysis
                            </button>
                        )}

                    </div>
                    
                    {/* Prompt Modal */}
                    {showPrompt && (
                        <div className="prompt-modal-overlay" onClick={() => setShowPrompt(false)}>
                            <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
                               {/* Optional Header */}
                               <div className="modal-header">
                                 <h2>Prompt Sent to LLM</h2>
                                 <button onClick={() => setShowPrompt(false)} className="close-button" title="Close">&times;</button>
                               </div>
                               {/* Content Area */}
                                <div className="prompt-content">
                                    {promptSent ? (
                                        <pre className="formatted-prompt" dangerouslySetInnerHTML={{ __html: formatPromptForDisplay(promptSent) }} />
                                    ) : (
                                        <p>Prompt not available.</p>
                                    )}
                                </div>
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
                                                    {formatHistoryTimestamp(message.timestamp.getTime())}
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
                {/* Add floating New Inquiry Button here, only when showing results */}
                {showResults && (
                    <button 
                        className="new-inquiry-button" 
                        onClick={handleNewInquiry}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        New Analysis
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="App">
            {/* Assistant Card */}
            <div className="card assistant-card">
                <div className="app-header">
                    <img src={audacyLogo} alt="Audacy Logo" className="audacy-logo" />
                    <div className="header-controls-container">
                        <div className="model-selector-simple detail-toggle">
                            <span className="model-selector-label">Output Detail:</span>
                            <button 
                                className={`model-button ${outputDetail === 'brief' ? 'active' : ''}`}
                                onClick={() => handleOutputDetailChange('brief')}
                                title="Brief Output: Focuses on essential findings and recommendations."
                            >
                                Brief
                            </button>
                            <button 
                                className={`model-button ${outputDetail === 'detailed' ? 'active' : ''}`}
                                onClick={() => handleOutputDetailChange('detailed')}
                                title="Detailed Output: Provides comprehensive explanations and context."
                            >
                                Detailed
                            </button>
                        </div>
                    </div>
                </div>

                <h1>Marketing Assistant</h1>
                <p className="app-instructions">
                    Upload your campaign data (CSV, XLSX, or PDF), select the relevant Tactic and KPI, and describe the client's situation and goals. 
                    The AI will analyze the data and provide actionable insights tailored for Audacy AEs.
                </p>
                
                {/* Client Name Input - Add this section */}
                <div className="input-container full-width">
                    <label htmlFor="clientName">Client / Advertiser Name:</label>
                    <input
                        type="text"
                        id="clientName"
                        value={clientName}
                        onChange={handleClientNameChange} // Ensure handler is connected
                        placeholder="Enter client or advertiser name"
                        className="text-input"
                        title="Enter the name of the client or advertiser for this analysis."
                    />
                </div>
                
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
                        {/* Re-add the KPI recommendation popup */}
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

                    {/* Container for file name and remove button, shown only when a file is selected */}
                    {file && fileName && (
                        <div className="file-info-container">
                            <p className="file-name" title={fileName}>
                                {fileName}
                            </p>
                            <button 
                                className="remove-file-button icon-style" 
                                onClick={() => { setFile(null); setFileName(null); }}
                                title="Remove file"
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {/* Message shown when no file is selected */}
                    {!file && !fileName && (
                        <p className="file-name prompt-text">Please select a CSV, XLSX, or PDF file.</p>
                    )}
                </div>

                {/* --- Advanced Options Button (Stays Here) --- */}
                <div className="advanced-options-trigger-area">
                    <button 
                        className="advanced-options-button"
                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                        title="Show/hide advanced options"
                    >
                        {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
                    </button>
                </div>
                {/* --- End Advanced Options Button --- */}

                {/* --- Advanced Options revealed content (Now only Speed) --- */}
                {showAdvancedOptions && (
                    <div className="advanced-toggles-container revealed">
                        <h4 className="advanced-options-heading">Advanced Options</h4>
                        {/* Analysis Speed Toggle */}
                        <div className="model-selector-simple speed-toggle">
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
                        {/* Output Detail Toggle - Removed from here */}
                     </div>
                )}
                {/* --- End Advanced Options revealed content --- */}

                {/* Removed the wrapping div, button/spinner/error are now direct children of .assistant-card */}
                {/* Conditionally render the Analyze button OR the loading indicator */} 
                {!isLoading ? (
                    <button
                        className="rounded-element submit-button"
                        onClick={handleSubmit}
                        disabled={!file || !selectedTactics || !selectedKPIs} 
                        title="Submit the data and inputs to generate the AI analysis."
                    >
                        Analyze
                    </button>
                ) : (
                    <div className="spinner-container"> 
                        <div className="spinner"></div>
                        <p>Analyzing your data, please wait...</p>
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}
            </div> {/* End Assistant Card */}

            {/* History Card - Conditionally render the card itself */}
            {analysisHistory.length > 0 && (
                <div className="card history-card">
                    <div className="history-section">
                        <h2>Analysis History</h2>
                        <button 
                            className="clear-history-button"
                            onClick={() => {
                                if (window.confirm('Are you sure you want to clear all analysis history?')) {
                                    setAnalysisHistory([]);
                                    localStorage.removeItem('analysisHistory');
                                }
                            }}
                        >
                            Clear History
                        </button>
                        <ul className="history-list">
                            {paginatedHistory.map((entry) => {
                                const clientNameText = entry.inputs.clientName || 'N/A';
                                const isClientNA = clientNameText === 'N/A';
                                return (
                                    <li 
                                        key={entry.id} 
                                        className={`history-item ${selectedHistoryEntryId === entry.id ? 'selected' : ''}`}
                                        onClick={() => handleLoadHistory(entry.id)} // Attach onClick here
                                        title="Click to view this analysis"
                                    >
                                        {/* Left Aligned Info Block */}
                                        <div className="history-item-info">
                                            {/* Client Name */}
                                            <span className={`history-client-name ${isClientNA ? 'client-na' : ''}`}>
                                                {clientNameText}
                                            </span>
                                            {/* Tactic / KPI / Filename */}
                                            <span className="history-details">
                                                {entry.inputs.selectedTactics} / {entry.inputs.selectedKPIs}
                                                {entry.inputs.fileName && 
                                                    <span className="history-filename"> ({entry.inputs.fileName})</span>
                                                }
                                            </span>
                                            {/* Timestamp - MOVED HERE */}
                                            <span className="history-timestamp">
                                                {formatHistoryTimestamp(entry.timestamp)}
                                            </span>
                                        </div>

                                        {/* Right Aligned Actions Block (Only View Chat Button) */}
                                        <div className="history-item-actions">
                                            {/* Render View Chat button, disable if no chat history */}
                                            <button 
                                                className="view-chat-button button-small" 
                                                onClick={(e) => { e.stopPropagation(); handleViewChatHistory(entry.id); }} // KEEP stopPropagation
                                                disabled={!entry.results.helpConversation || !Array.isArray(entry.results.helpConversation) || entry.results.helpConversation.length === 0}
                                                title={(!entry.results.helpConversation || !Array.isArray(entry.results.helpConversation) || entry.results.helpConversation.length === 0) ? "No chat history available" : "View associated chat history"}
                                            >
                                                View Chat
                                            </button>
                                            {/* Timestamp REMOVED from here */}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                        {/* --- Add Pagination Controls --- */}
                        {totalPages > 1 && (
                            <div className="pagination-controls">
                                {/* Previous Button (Optional, for better UX) */} 
                                <button 
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="pagination-arrow"
                                    title="Previous Page"
                                >
                                    &lt;
                                </button>

                                {/* Page Numbers */} 
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </button>
                                ))}

                                {/* Next Button (Optional) */} 
                                <button 
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="pagination-arrow"
                                    title="Next Page"
                                >
                                    &gt;
                                </button>
                            </div>
                        )}
                        {/* --- End Pagination Controls --- */}
                    </div>
                </div> /* End History Card */
            )}
            {/* --- End Analysis History Section --- */}

            {/* --- Chat History Review Modal --- */}
            {showChatHistoryModal && (
                <div className="prompt-modal-backdrop">
                    <div className="prompt-modal chat-history-modal"> 
                        <div className="modal-header">
                            <h2>Chat History Review</h2>
                            <button onClick={() => setShowChatHistoryModal(false)} className="close-button" title="Close Chat Review">&times;</button>
                        </div>
                        
                        {/* Conversation Display Area */}
                        <div className="help-conversation modal-chat-display"> {/* Add specific class for styling */} 
                            {viewingChatHistory.map((message, index) => (
                                <div key={index} className={`conversation-message ${message.type === 'user' ? 'user-message-container' : 'assistant-message-container'}`}>
                                    <div className={message.type === 'user' ? 'user-query' : 'assistant-response'}>
                                        {/* Ensure content exists before rendering */}
                                        <div dangerouslySetInnerHTML={{ __html: message.content || '' }} /> 
                                    </div>
                                    <div className="message-time">
                                        {/* Ensure timestamp exists and is valid before formatting */}
                                        {message.timestamp ? formatHistoryTimestamp(new Date(message.timestamp).getTime()) : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {/* --- End Chat History Review Modal --- */}

        </div>
    );
}

export default App;