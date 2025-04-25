import React, { useState, useEffect, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import audacyLogo from './assets/audacy-logo.png';
import audacyLogoHoriz from './assets/audacy_logo_horiz_color_rgb.png';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";

// Add type declaration for dataLayer on window
declare global {
    interface Window {
        dataLayer: any[];
    }
}

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

// Define an interface for basic user info from token
interface UserInfo {
    name?: string;
    email?: string;
    picture?: string;
    sub?: string; // Google User ID
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

// --- Define API Base URL ---
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const analysisApiUrl = import.meta.env.VITE_ANALYSIS_API_URL || apiBaseUrl;

const HistoryActionMenu = ({ 
  isOpen, 
  onClose, 
  onView, 
  onChat, 
  onDelete,
  isMobile
}: {
  isOpen: boolean;
  onClose: () => void;
  onView: () => void;
  onChat: () => void;
  onDelete: () => void;
  isMobile: boolean;
}) => {
  if (isMobile) {
    return (
      <>
        <div 
          className={`action-menu-overlay ${isOpen ? 'visible' : ''}`}
          onClick={onClose}
        />
        <div className={`action-menu-dropdown ${isOpen ? 'visible' : ''}`}>
          <div className="action-menu-header">Actions</div>
          <button className="action-menu-item" onClick={onView}>
            <span className="material-icons">visibility</span>
            View
          </button>
          <button className="action-menu-item" onClick={onChat}>
            <span className="material-icons">chat</span>
            Chat
          </button>
          <button className="action-menu-item delete" onClick={onDelete}>
            <span className="material-icons">delete</span>
            Delete
          </button>
        </div>
      </>
    );
  }
  
  // Desktop dropdown (unchanged)
  return (
    <div className={`action-menu ${isOpen ? 'open' : ''}`}>
      <button onClick={onView} className="action-item">
        <span className="material-icons">visibility</span>
        View
      </button>
      <button onClick={onChat} className="action-item">
        <span className="material-icons">chat</span>
        Chat
      </button>
      <button onClick={onDelete} className="action-item delete">
        <span className="material-icons">delete</span>
        Delete
      </button>
    </div>
  );
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
    const [viewingChatHistory, setViewingChatHistory] = useState<Array<{type: string, content: string, timestamp: any}>>([]); 
    const [originalFileContent, setOriginalFileContent] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 5; // Show 5 history items per page
    const [activeView, setActiveView] = useState<'new' | 'history'>('new');
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [idToken, setIdToken] = useState<string | null>(null);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const helpInputRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [showKpiMismatchWarning, setShowKpiMismatchWarning] = useState<boolean>(false);
    const [userProfile, setUserProfile] = useState({
        name: '',
        email: '',
        picture: ''
    });
    
    // --- State for input field errors ---
    const [tacticError, setTacticError] = useState<boolean>(false);
    const [kpiError, setKpiError] = useState<boolean>(false);
    const [fileError, setFileError] = useState<boolean>(false);
    // Add more if needed (e.g., clientNameError)
    const [clientNameError, setClientNameError] = useState<boolean>(false);
    const [currentChatEntryId, setCurrentChatEntryId] = useState<string | null>(null);

    // --- Pagination Calculations ---
    const totalPages = Math.ceil(analysisHistory.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedHistory = analysisHistory.slice(startIndex, endIndex);
    // --- End Pagination Calculations ---

    // Add this function to check token expiration - memoized with useCallback
    const isTokenExpired = useCallback((token: string): boolean => {
        try {
            const decoded: any = jwtDecode(token);
            const currentTime = Date.now() / 1000;
            
            // Add a 5-minute buffer to ensure we refresh before expiration
            return decoded.exp < currentTime + 300;
        } catch (error) {
            console.error('Error checking token expiration:', error);
            return true; // If we can't decode the token, consider it expired
        }
    }, []); // Empty dependency array to prevent recreating this function

    // --- Helper function to translate technical errors ---
    const translateErrorMessage = (rawError: string): string => {
        console.log("Translating error:", rawError);
        // Check for specific technical substrings and map them

        // --- Client-side validation errors ---
        if (rawError === "Missing Tactic Selection") {
            return "Please select a Tactic before analyzing.";
        }
        if (rawError === "Missing KPI Selection") {
            return "Please select a KPI before analyzing.";
        }
        if (rawError === "Missing File Upload") {
            return "Please upload a data file before analyzing.";
        }
        if (rawError === "Missing Client Name") {
            return "Please enter a client or advertiser name.";
        }
        // --- End Client-side ---

        if (rawError.includes('token count exceeded') || rawError.includes('input data is too large')) {
            return "Analysis Failed: Input data is too large. Try shortening the 'Situation & Goals' description or use a smaller data file.";
        }
        if (rawError.includes('HTTP error! status: 413') || rawError.includes('Payload Too Large')) {
            return "Analysis Failed: The uploaded file is too large. Please use a smaller file.";
        }
        if (rawError.includes('Unsupported file type') || rawError.includes('Invalid file format')) {
            return "Analysis Failed: Unsupported file type. Please upload a CSV, XLSX, or PDF file.";
        }
        if (rawError.includes('HTTP error! status: 5')) { // Catch 5xx server errors
            return "Analysis Failed: An unexpected problem occurred on the server. Please try again later.";
        }
        if (rawError.includes('HTTP error! status: 400') || rawError.includes('Bad Request')) {
            return "Analysis Failed: There was an issue with the data sent. Please check your selections and file.";
        }
        if (rawError.includes('Failed to fetch')) { // Generic network error
             return "Analysis Failed: Could not connect to the analysis service. Please check your internet connection and try again.";
        }
        
        // Add more specific mappings as needed
        
        // Fallback for unknown errors
        console.warn("Unknown error type received:", rawError); 
        return `Analysis Failed: An unexpected error occurred. (${rawError})`; // Include raw error for debugging
    };

    // --- Define fetchHistory function HERE (before useEffect that uses it) ---
    const fetchHistory = useCallback(async (token: string | null) => {
        if (!token) {
             console.warn('fetchHistory called without a token.');
             setError('Cannot fetch history: Not logged in.');
             setAnalysisHistory([]); 
            return;
        }
        
        // Check if token is expired before making the API call
        if (isTokenExpired(token)) {
            console.log('Token expired before fetching history. Logging out...');
            localStorage.removeItem('idToken');
            localStorage.removeItem('userInfo');
            setIsLoggedIn(false);
            setIdToken(null);
            setUserInfo(null);
            setAnalysisHistory([]);
            setError('Your session has expired. Please log in again.');
            return;
        }
        
        console.log("Attempting to fetch history from backend...");
        setIsLoading(true); 
        setError(null);
        
        try {
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`${apiBaseUrl}/api/history`, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId); // Clear timeout on successful response
            
            if (!response.ok) {
                let errorMsg = `Failed to fetch history: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) { /* Ignore */ }
                
                // Handle authentication errors by logging out
                if (response.status === 401 || response.status === 403) {
                    console.log('Authentication error. Logging out:', errorMsg);
                    // Clear stored credentials
                    localStorage.removeItem('idToken');
                    localStorage.removeItem('userInfo');
                    setIsLoggedIn(false);
                    setIdToken(null);
                    setUserInfo(null);
                    setAnalysisHistory([]);
                    setError('Your session has expired. Please log in again.');
                    return;
                }
                
                throw new Error(errorMsg);
            }
            
            const result = await response.json();
            
            if (result && Array.isArray(result.data)) {
                console.log('History fetched successfully:', result.data);
                
                // Log the actual Firestore IDs for debugging
                console.log('Firestore document IDs:', result.data.map((entry: any) => entry.id));
                
                // Add debug logs for helpConversation
                console.log('Checking helpConversation in entries:', 
                    result.data.map((entry: any) => ({
                    id: entry.id,
                    hasHelpConversation: entry.results && 
                                        entry.results.helpConversation && 
                                        Array.isArray(entry.results.helpConversation),
                    helpConversationLength: entry.results && 
                                        entry.results.helpConversation && 
                                        Array.isArray(entry.results.helpConversation) ? 
                                        entry.results.helpConversation.length : 0
                    }))
                );
                
                // Correctly convert Firestore Timestamp object to milliseconds
                const formattedHistory = result.data.map((entry: any) => {
                    // Ensure entry.results exists and has helpConversation
                    if (!entry.results) {
                        entry.results = {};
                    }
                    
                    if (!entry.results.helpConversation) {
                        entry.results.helpConversation = [];
                    }
                    
                    // Check if timestamp exists and has the expected structure
                    const timestampInMillis = entry.timestamp && typeof entry.timestamp === 'object' && entry.timestamp._seconds
                        ? entry.timestamp._seconds * 1000 + Math.floor((entry.timestamp._nanoseconds || 0) / 1000000)
                        : entry.timestamp; // Fallback if it's already a number or invalid
                    
                    // Log individual entry ID for debugging
                    console.log(`Entry ID from Firestore: ${entry.id}`);
                    
                    return {
                        ...entry,
                        timestamp: timestampInMillis, // Replace the object with the millisecond number
                    };
                });
                setAnalysisHistory(formattedHistory);
            } else {
                console.warn('Received unexpected data format when fetching history:', result);
                setAnalysisHistory([]);
            }
            
        } catch (error: any) {
            console.error('Failed to fetch history:', error);
            
            if (error.name === 'AbortError') {
                setError('Failed to load history: Request timed out. Please try again.');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                setError('Failed to load history: Network error. Check your connection and try again.');
            } else {
                setError(error.message || 'Failed to load history.');
            }
            
            setAnalysisHistory([]);
        } finally {
            setIsLoading(false);
        }
    }, [apiBaseUrl, isTokenExpired]); // Include all dependencies

    // --- useEffect hooks ---
    // Focus on help input
    useEffect(() => {
        if (showHelpModal && helpInputRef.current) {
            setTimeout(() => {
                helpInputRef.current?.focus();
            }, 100);
        }
    }, [showHelpModal]);

    // Scroll chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [helpConversation]);

    // Load/Save help conversation
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

    useEffect(() => {
        if (helpConversation.length > 0) {
            sessionStorage.setItem('helpConversation', JSON.stringify(helpConversation));
        }
    }, [helpConversation]);

    // Load login state and initial history on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('idToken');
        const storedUserInfo = localStorage.getItem('userInfo');
        
        if (storedToken && storedUserInfo) {
            try {
                // Check if token is expired
                if (isTokenExpired(storedToken)) {
                    console.log('Stored token is expired. Logging out...');
                    localStorage.removeItem('idToken');
                    localStorage.removeItem('userInfo');
                    setIsLoggedIn(false);
                    setIdToken(null);
                    setUserInfo(null);
                    setAnalysisHistory([]);
                    return;
                }
                
                const parsedUserInfo: UserInfo = JSON.parse(storedUserInfo);
                console.log('Found valid token and user info, setting login state.');
                setIdToken(storedToken);
                setUserInfo(parsedUserInfo); // Set user info state
                setIsLoggedIn(true);
                // Fetch history for the loaded user
                fetchHistory(storedToken); // Now fetchHistory is defined
            } catch (error) {
                 console.error('Error parsing stored user info:', error);
                 localStorage.removeItem('idToken');
                 localStorage.removeItem('userInfo');
                 setIsLoggedIn(false);
                 setIdToken(null);
                 setUserInfo(null);
                 setAnalysisHistory([]);
            }
        } else {
            console.log('No token or user info found.');
             setIsLoggedIn(false);
             setIdToken(null);
             setUserInfo(null);
             setAnalysisHistory([]);
        }
    }, [fetchHistory]); // ONLY depend on fetchHistory

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        // Clear previous results when file changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        setError(null);
        setFileError(false); // Clear specific file error on change
        
        if (event.target.files && event.target.files.length > 0) {
            const selectedFile = event.target.files[0];
            if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.pdf')) {
                setFileName(selectedFile.name);
                setError(null);
                // --- Data Layer Push ---
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({
                    'event': 'file_upload_success',
                    'event_category': 'Form Interaction',
                    'event_action': 'Upload File',
                    'event_label': selectedFile.name
                });
            } else {
                setFile(null);
                setFileName(null);
                setError('Unsupported file type. Please upload CSV, XLSX, or PDF.');
                // --- Data Layer Push for Error ---
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({
                    'event': 'file_upload_error',
                    'event_category': 'Form Interaction',
                    'event_action': 'Upload File Error',
                    'event_label': 'Unsupported file type'
                });
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
        const newTactic = event.target.value;
        setSelectedTactics(newTactic);
        // Clear previous results when tactic changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        setShowKpiMismatchWarning(false); // Hide warning when tactic changes
        setError(null); // Clear general error
        setTacticError(false); // Clear specific tactic error on change

        // Show KPI recommendation popup if we have recommendations for this tactic
        if (newTactic && recommendations[newTactic]) {
            setShowKpiRecommendation(true);
            // Auto-hide the recommendation after 15 seconds
            setTimeout(() => {
                setShowKpiRecommendation(false);
            }, 15000);
        } else {
            setShowKpiRecommendation(false); // Hide if no recommendations
        }
        // --- Data Layer Push ---
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'select_tactic',
            'event_category': 'Form Interaction',
            'event_action': 'Select Tactic',
            'event_label': newTactic // Use newTactic here
        });
    };

    const handleKPIChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newKpi = event.target.value;
        setSelectedKPIs(newKpi);
        // Clear previous results when KPI changes
        setAnalysisResult(null);
        setRawAnalysisResult(null);
        setPromptSent(null);
        setError(null); // Clear general error
        setKpiError(false); // Clear specific KPI error on change

        // Check for mismatch
        if (selectedTactics && newKpi) {
            const recommended = recommendations[selectedTactics];
            if (recommended && !recommended.includes(newKpi)) {
                setShowKpiMismatchWarning(true); // Show warning
            } else {
                setShowKpiMismatchWarning(false); // Hide warning if recommended or no recommendations exist
            }
        } else {
            setShowKpiMismatchWarning(false); // Hide if no tactic selected
        }

        // --- Data Layer Push ---
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'select_kpi',
            'event_category': 'Form Interaction',
            'event_action': 'Select KPI',
            'event_label': newKpi // Use newKpi here
        });
    };

    const handleClientNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setClientName(event.target.value);
        setError(null); // Clear general error
        setClientNameError(false); // Clear specific client name error on change
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
            const response = await fetch(`${analysisApiUrl}/get-help`, { // Use analysisApiUrl for help endpoint
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
            const updatedConversationWithResponse = [...updatedConversation, newAiMessage];
            setHelpConversation(updatedConversationWithResponse);
            console.log("<<< Updated helpConversation state:", [...updatedConversation, newAiMessage]);
            
            // NEW CODE: Update the current history entry with the latest chat conversation
            if (isLoggedIn && idToken && selectedHistoryEntryId) {
                try {
                    console.log('Updating history entry with new chat message...');
                    console.log('Chat conversation to save:', {
                        entryId: selectedHistoryEntryId,
                        messageCount: updatedConversationWithResponse.length,
                        messageTypes: updatedConversationWithResponse.map(msg => msg.type)
                    });
                    
                    const response = await fetch(`${apiBaseUrl}/api/history/${selectedHistoryEntryId}/chat`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`,
                        },
                        body: JSON.stringify({ 
                            helpConversation: updatedConversationWithResponse 
                        }),
                    });
                    
                    if (!response.ok) {
                        const responseText = await response.text();
                        console.error('Failed to update chat history in Firestore:', response.status, response.statusText);
                        console.error('Response body:', responseText);
                        
                        // If it's an auth error, handle token refresh
                        if (response.status === 401 || response.status === 403) {
                            console.warn('Authentication error while saving chat history. You may need to re-login.');
                        }
                    } else {
                        const result = await response.json();
                        console.log('Chat history successfully updated in Firestore:', result);
                        // Refetch history to update UI
                        try {
                            await fetchHistory(idToken);
                        } catch (fetchError) {
                            console.warn('Failed to refresh history after chat update:', fetchError);
                        }
                    }
                } catch (error) {
                    console.error('Error updating chat history in Firestore:', error);
                    console.log('Continuing with local chat history only');
                }
            } else {
                console.log('Not saving chat history - Either not logged in or no selected history entry.');
                if (!isLoggedIn) console.log('  - Not logged in');
                if (!idToken) console.log('  - No ID token');
                if (!selectedHistoryEntryId) console.log('  - No selected history entry ID');
            }
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
        const model = selection === 'speed' ? 'gemini-2.0-flash' : 'gemini-2.5-pro-preview-03-25';
        setSelectedModelId(model);
        // --- Data Layer Push ---
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'select_model',
            'event_category': 'Advanced Options',
            'event_action': 'Select Model Speed',
            'event_label': selection
        });
    };

    // Handler for the new Output Detail toggle
    const handleOutputDetailChange = (detail: 'brief' | 'detailed') => {
        setOutputDetail(detail);
        // --- Data Layer Push ---
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'select_output_detail',
            'event_category': 'Advanced Options',
            'event_action': 'Select Output Detail',
            'event_label': detail
        });
    };

    // Helper function to truncate large content to prevent request size issues
    const truncateContentIfNeeded = (content: string | null, maxLength = 500000): string | null => {
        if (!content) return null;
        if (content.length <= maxLength) return content;
        
        console.log(`Truncating content from ${content.length} to ${maxLength} characters for history storage`);
        return content.substring(0, maxLength) + '... [Content truncated for storage]';
    };

    // Handle form submission
    const handleSubmit = async () => {
        // --- Client-side Validation First ---
        // Reset all field errors before validating again
        setTacticError(false);
        setKpiError(false);
        setFileError(false);
        setClientNameError(false); // Reset client name error too
        let validationFailed = false; // Flag to prevent multiple errors

        // --- New Client Name Check ---
        if (!clientName.trim()) { // Check if clientName is empty or just whitespace
            setError(translateErrorMessage("Missing Client Name"));
            setClientNameError(true);
            validationFailed = true;
        }

        if (!selectedTactics) {
            // Only set general error if no previous validation failed
            if (!validationFailed) setError(translateErrorMessage("Missing Tactic Selection"));
            setTacticError(true); // Set specific error
            validationFailed = true;
        }
        if (!selectedKPIs) {
            // Only set general error if no previous validation failed
            if (!validationFailed) setError(translateErrorMessage("Missing KPI Selection"));
            setKpiError(true); // Set specific error
            validationFailed = true;
        }
        if (!file) {
            if (!validationFailed) setError(translateErrorMessage("Missing File Upload"));
            setFileError(true); // Set specific error
            validationFailed = true;
        }

        // If any validation failed, stop here
        if (validationFailed) {
            return;
        }
        // --- End Client-side Validation ---

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
        // Type check for file before appending
        if (file) {
            formData.append('file', file);
        } else {
            // This case shouldn't be reached due to validation, but handle defensively
            console.error("handleSubmit called with null file after validation checks.");
            setError("An internal error occurred: File is missing.");
            setIsLoading(false);
            return;
        }
        formData.append('tactics', JSON.stringify(selectedTactics));
        formData.append('kpis', JSON.stringify(selectedKPIs));
        formData.append('currentSituation', currentSituation);
        formData.append('modelId', selectedModelId);
        formData.append('outputDetail', outputDetail);
        formData.append('clientName', clientName);

        // --- Define API Base URL ---
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''; // Use import.meta.env for Vite

        // --- Data Layer Push for Submit Start ---
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'form_submit_start',
            'event_category': 'Form Interaction',
            'event_action': 'Submit Analysis',
            'event_label': fileName || 'N/A',
            'form_data': { // Send relevant form data
                'tactic': selectedTactics,
                'kpi': selectedKPIs,
                'model': selectedModelId,
                'detail': outputDetail,
                'clientNameProvided': !!clientName,
                'situationProvided': !!currentSituation
            }
        });

        try {
            const response = await fetch(`${analysisApiUrl}/analyze`, { // Use analysisApiUrl for the analyze endpoint
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
            
            // Log the raw HTML received BEFORE sanitization
            console.log(">>> RAW HTML from backend:", data.html);

            // Directly sanitize the received HTML, assuming backend sends HTML
            const rawHtmlContent = data.html || ''; 
            const sanitizedHtml = DOMPurify.sanitize(rawHtmlContent);
            // console.log("<<< Sanitized Analysis HTML (assuming backend sent HTML):", sanitizedHtml);

            setAnalysisResult(sanitizedHtml); // Store the sanitized HTML
            setRawAnalysisResult(data.raw);
            setPromptSent(data.prompt);
            setModelName(data.modelName);
            // --- NEW: Store original file content ---
            setOriginalFileContent(data.rawFileContent || null);

            // --- SAVE TO HISTORY (Backend Call) --- 
            if (isLoggedIn && idToken) { // Use idToken from state
                const historyEntryToSave: HistoryEntry = {
                    // Ensure the structure matches what the frontend/backend expects
                    // Note: Backend might generate its own ID and handle timestamp conversion
                    id: `temp-${Date.now()}`, // Temporary ID for optimistic UI update?
                    timestamp: Date.now(), // Use current time
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
                         analysisResult: truncateContentIfNeeded(sanitizedHtml), // Save sanitized HTML
                         rawAnalysisResult: truncateContentIfNeeded(data.raw), 
                         modelName: data.modelName,
                         promptSent: truncateContentIfNeeded(data.prompt),
                         // Initialize with an empty array to allow for future messages
                         helpConversation: []
                    }
                };

                try {
                    console.log('Saving history entry to backend...');
                     
                    // Create a version without the ID field to send to the server
                    // This is important - let Firestore generate the ID
                    const { id, ...historyDataWithoutId } = historyEntryToSave;
                    console.log('Sending history data WITHOUT temporary ID:', historyDataWithoutId);
                    console.log('History data size (approximate):', JSON.stringify(historyDataWithoutId).length, 'bytes');
                     
                    const historyResponse = await fetch(`${apiBaseUrl}/api/history`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`, // Use state idToken
                        },
                        body: JSON.stringify(historyDataWithoutId), // Send data WITHOUT ID field
                    });

                    if (!historyResponse.ok) {
                        let errorMsg = `Failed to save history: ${historyResponse.statusText}`;
                        try {
                            const errorData = await historyResponse.json();
                            errorMsg = errorData.message || errorMsg;
                        } catch (e) { /* Ignore */ }
                         
                        // Handle authentication errors by logging out
                        if (historyResponse.status === 401 || historyResponse.status === 403) {
                            console.log('Authentication error during save history. Logging out:', errorMsg);
                            // Clear stored credentials
                            localStorage.removeItem('idToken');
                            localStorage.removeItem('userInfo');
                            setIsLoggedIn(false);
                            setIdToken(null);
                            setUserInfo(null);
                            setAnalysisHistory([]);
                            setError('Your session has expired. Please log in again, but your analysis results are still available.');
                            return;
                        }
                         
                        // For other errors, just log and continue showing results
                        console.warn(errorMsg);
                        console.log('Continuing with analysis results without saving to history');
                    } else {
                        const historyResult = await historyResponse.json();
                        console.log('History entry saved successfully:', historyResult);

                        // Log the Firestore-generated ID
                        if (historyResult.entryId) {
                            console.log('Server generated document ID:', historyResult.entryId);
                            // Set the selected history entry ID after saving
                            setSelectedHistoryEntryId(historyResult.entryId);
                        } else {
                            console.warn('No document ID returned from server');
                        }

                        // Try to refetch history but don't let failures block showing results
                        try {
                            // IMPORTANT: Always refetch to get the server's real data with proper IDs
                            // This ensures we're using the actual Firestore document IDs 
                            // rather than temporary client-side IDs
                            await fetchHistory(idToken); // Refetch the history list from backend
                            setCurrentPage(1); // Reset to first page
                        } catch (fetchError) {
                            console.warn('Failed to fetch updated history after save:', fetchError);
                        }
                    }
                } catch (historyError: any) {
                    console.error('Error saving history entry:', historyError);
                    // Notify user, but don't block showing analysis results
                    console.log('Continuing with analysis results without saving to history');
                }
            } else {
                console.warn('User not logged in or token missing, history entry not saved to backend.');
                // Optionally inform the user history isn't saved when logged out
            }
            // --- End Save to History ---

            // >>> Clear chat history when a new analysis is successful <<<
            setHelpConversation([]);
            sessionStorage.removeItem('helpConversation');

            setShowResults(true); // Show the results page
            setShowHelpModal(false); // Ensure help modal is closed when showing new results
            setIsViewingHistory(false); // Set to false as this is a fresh analysis

            // --- Data Layer Push for Submit Success ---
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'form_submit_success',
                'event_category': 'Form Interaction',
                'event_action': 'Submit Analysis Success',
                'event_label': fileName || 'N/A',
                'model_used': data.modelName || modelName || 'Unknown' // Use model from response if available
            });
        } catch (error: any) {
            console.error('Error during analysis:', error);
            const rawErrorMessage = error.message || 'An unexpected error occurred.';
            // Translate the error message before setting state
            const userFriendlyError = translateErrorMessage(rawErrorMessage);
            setError(userFriendlyError);
            setShowResults(false);

            // --- Highlight fields based on translated error ---
            // This is basic matching; could be refined
            if (userFriendlyError.includes("file")) {
                setFileError(true);
            }
            // Add more conditions if backend errors can be mapped to specific fields
            // e.g., if (userFriendlyError.includes("tactic")) { setTacticError(true); }

            // --- Data Layer Push for Submit Catch Error ---
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'form_submit_catch_error',
                'event_category': 'Form Interaction',
                'event_action': 'Submit Analysis General Error',
                'event_label': error.message || 'Unknown error'
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackToForm = () => {
        setShowResults(false);
        setIsViewingHistory(false); // Ensure this flag is reset
        setSelectedHistoryEntryId(null); // Reset selected history entry
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

        // --- Data Layer Push ---
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'click_new_inquiry',
            'event_category': 'Navigation',
            'event_action': 'Click New Inquiry Button'
        });
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

            // --- Data Layer Push ---
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'load_history_item',
                'event_category': 'History Interaction',
                'event_action': 'Load History Item',
                'event_label': entry.inputs.fileName || 'N/A',
                'history_details': { // Include history details
                    'tactic': entry.inputs.selectedTactics,
                    'kpi': entry.inputs.selectedKPIs,
                    'clientName': entry.inputs.clientName || 'N/A'
                }
            });
        } else {
            setError('Could not load the selected history entry.');
        }
    };

    // Function to open the chat history modal
    const handleViewChatHistory = (entryId: string) => {
        console.log(`Attempting to view chat history for entry: ${entryId}`);
        setCurrentChatEntryId(entryId); // Track the current entry ID
        
        if (!isLoggedIn || !idToken) {
            console.error('User must be logged in to view chat history');
            alert('You must be logged in to view chat history.');
            return;
        }

        setIsLoading(true);
        setError(null);
        
        // Fetch the specific entry from the backend
        fetch(`${apiBaseUrl}/api/history/${entryId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${idToken}`,
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to fetch chat history: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Fetched chat history entry:', data);
            
            const entry = data.data;
            if (!entry) {
                throw new Error(`Entry with ID ${entryId} not found in server response`);
            }
            
            if (!entry.results) {
                throw new Error(`Entry ${entryId} has no results property`);
            }
            
            // Initialize helpConversation if it doesn't exist
            if (!entry.results.helpConversation) {
                console.log(`Entry ${entryId} has no helpConversation, initializing empty array`);
                entry.results.helpConversation = [];
            }
            
            // Ensure it's an array
            if (!Array.isArray(entry.results.helpConversation)) {
                console.error(`Entry ${entryId} helpConversation is not an array:`, entry.results.helpConversation);
                entry.results.helpConversation = []; // Force it to be an array
            }
            
            // If the conversation is empty, add a test message
            if (entry.results.helpConversation.length === 0 && idToken) {
                console.log('Creating test message in empty conversation');
                
                // Add a test message to the conversation
                fetch(`${apiBaseUrl}/api/history/${entryId}/chat`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${idToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'assistant',
                        content: 'Welcome to chat history! This conversation will be saved and can be viewed anytime you return to this analysis.'
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        console.error('Failed to add test message:', response.status, response.statusText);
                        return;
                    }
                    return response.json();
                })
                .then(msgData => {
                    console.log('Added test message:', msgData);
                    // Add the message to our local state too
                    if (msgData && msgData.chatMessage) {
                        entry.results.helpConversation.push(msgData.chatMessage);
                    }
                    setViewingChatHistory(entry.results.helpConversation);
                })
                .catch(err => {
                    console.error('Error adding test message:', err);
                });
            }
            
            // Show the modal even if empty - can handle empty case in the modal UI
            console.log(`Opening chat history modal for entry ${entryId} with ${entry.results.helpConversation.length} messages`);
            setViewingChatHistory(entry.results.helpConversation);
            setShowChatHistoryModal(true);
            
            // --- Data Layer Push ---
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'view_chat_history',
                'event_category': 'History Interaction',
                'event_action': 'Click View Chat Button',
                'event_label': entryId
            });
        })
        .catch(error => {
            console.error('Error viewing chat history:', error);
            // Check if this is the "entry not found" error
            if (error.message && error.message.includes('404')) {
                setError('This chat history is no longer available. It may have been deleted.');
            } else {
                setError(`Failed to load chat history: ${error.message}`);
            }
        })
        .finally(() => {
            setIsLoading(false);
        });
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

    // <<< ADDED: Function to clear analysis history >>>
    const handleClearHistory = async () => { // Make async
        if (!isLoggedIn || !idToken) { // Check login status and token
             alert('You must be logged in to clear history.');
             return;
        }
        
        if (window.confirm('Are you sure you want to clear all your analysis history? This cannot be undone.')) {
            console.log('Attempting to clear history via backend...');
            setIsLoading(true); // Indicate loading/processing
            setError(null);
            
            try {
                const response = await fetch(`${apiBaseUrl}/api/history`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${idToken}`, // Use state idToken
                    },
                });

                if (!response.ok) {
                    let errorMsg = `Failed to clear history: ${response.statusText}`;
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.message || errorMsg;
                    } catch (e) { /* Ignore */ }
                    
                    // Handle authentication errors by logging out
                    if (response.status === 401 || response.status === 403) {
                        console.log('Authentication error during clear history. Logging out:', errorMsg);
                        // Clear stored credentials
                        localStorage.removeItem('idToken');
                        localStorage.removeItem('userInfo');
                        setIsLoggedIn(false);
                        setIdToken(null);
                        setUserInfo(null);
                        setAnalysisHistory([]);
                        setError('Your session has expired. Please log in again.');
                        return;
                    }
                    
                    throw new Error(errorMsg);
                }
                
                const result = await response.json();
                console.log("History cleared successfully:", result.message);
                
                // Clear local state on successful deletion from backend
                setAnalysisHistory([]); 
                setCurrentPage(1); // Reset pagination
                
                // Optionally provide user feedback beyond console log
                // e.g., set a temporary success message state

                // --- Data Layer Push (Keep if needed) ---
                 window.dataLayer = window.dataLayer || [];
                 window.dataLayer.push({
                     'event': 'clear_history_success', // More specific event?
                     'event_category': 'History Interaction',
                     'event_action': 'Clear History Backend'
                 });

            } catch (error: any) {
                console.error('Error clearing history:', error);
                setError(`Failed to clear history: ${error.message}`);
                 // --- Data Layer Push for Error ---
                 window.dataLayer = window.dataLayer || [];
                 window.dataLayer.push({
                     'event': 'clear_history_error',
                     'event_category': 'History Interaction',
                     'event_action': 'Clear History Backend Error',
                     'event_label': error.message
                 });
            } finally {
                setIsLoading(false);
            }
        }
    };
    // <<< END ADDED FUNCTION >>>

    // Update handleLoginSuccess
    const handleLoginSuccess = (credentialResponse: CredentialResponse) => {
        console.log('Google Login Success:', credentialResponse);
        const token = credentialResponse.credential;
        if (token) {
            try {
                 // Decode the JWT token to get user info
                 const decodedUserInfo: UserInfo = jwtDecode(token);
                 console.log('Decoded User Info:', decodedUserInfo);

                 setIdToken(token);
                 setUserInfo(decodedUserInfo); // Set user info state
                 setIsLoggedIn(true);
                 
                 // Persist token and user info
                 localStorage.setItem('idToken', token);
                 localStorage.setItem('userInfo', JSON.stringify(decodedUserInfo)); 

                 fetchHistory(token); // Fetch history for the newly logged-in user
                 setError(null); // Clear previous errors
                 setActiveView('history'); // Switch to history view upon successful login

             } catch (error) {
                 console.error('Error decoding token or setting state:', error);
                 setError('Login succeeded but failed to process user information.');
                 // Clear partial login state
                 localStorage.removeItem('idToken');
                 localStorage.removeItem('userInfo');
                 setIsLoggedIn(false);
                 setIdToken(null);
                 setUserInfo(null);
             }
        } else {
            console.error('Login Success but no credential received.');
            setError('Login failed: Could not get authentication credential.');
            setIsLoggedIn(false);
            setIdToken(null);
            setUserInfo(null);
            localStorage.removeItem('idToken');
            localStorage.removeItem('userInfo');
        }
    };
    
    // Update handleLogout
    const handleLogout = () => {
         console.log('Logging out...');
         setIsLoggedIn(false);
         setIdToken(null);
         setUserInfo(null); // Clear user info state
         setAnalysisHistory([]); // Clear history from state
         localStorage.removeItem('idToken'); // Remove token from storage
         localStorage.removeItem('userInfo'); // Remove user info from storage
         setActiveView('new'); // Go back to the main form view
         // Optional: Add backend call to invalidate session/token if implemented
         // Optional: Use googleLogout() from @react-oauth/google if needed for cleanup
    };

    // <<< NEW: Function to delete a specific history entry >>>
    const handleDeleteHistoryEntry = async (entryId: string) => {
        if (!isLoggedIn || !idToken) {
            alert('You must be logged in to delete history entries.');
            return;
        }

        // Confirmation dialog
        if (!window.confirm(`Are you sure you want to delete this history entry? This action cannot be undone.`)) {
            return; // User cancelled
        }

        console.log(`Attempting to delete history entry ${entryId} via backend...`);
        setIsLoading(true);
        setError(null);

        // Check if this is a temporary ID (starts with 'temp-')
        // If so, we can't delete it on the server because it doesn't exist there
        if (entryId.startsWith('temp-')) {
            console.warn(`Skipping server delete for temporary ID: ${entryId}`);
            // Just remove it from local state
            setAnalysisHistory(prevHistory => prevHistory.filter(entry => entry.id !== entryId));
            setIsLoading(false);
            // Reset view if needed
            if (selectedHistoryEntryId === entryId) {
                handleNewInquiry();
                setActiveView('history');
            }
            return;
        }

        try {
            // Make absolute URL to be safe
            const response = await fetch(`${apiBaseUrl}/api/history/${entryId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                },
            });

            if (!response.ok) {
                let errorMsg = `Failed to delete history entry: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) { /* Ignore JSON parsing error */ }
                
                // Handle authentication errors by logging out
                if (response.status === 401 || response.status === 403) {
                    console.log('Authentication error during delete entry. Logging out:', errorMsg);
                    // Clear stored credentials
                    localStorage.removeItem('idToken');
                    localStorage.removeItem('userInfo');
                    setIsLoggedIn(false);
                    setIdToken(null);
                    setUserInfo(null);
                    setAnalysisHistory([]);
                    setError('Your session has expired. Please log in again.');
                    return;
                }
                
                throw new Error(errorMsg);
            }

            const result = await response.json();
            console.log("History entry deleted successfully:", result.message);

            // Update local state to remove the deleted entry
            setAnalysisHistory(prevHistory => prevHistory.filter(entry => entry.id !== entryId));

            // If the deleted entry was the one being viewed, reset the view
            if (selectedHistoryEntryId === entryId) {
                 handleNewInquiry(); // Or reset to a neutral state
                 setActiveView('history'); // Stay on history tab
            }

            // Adjust pagination if necessary (e.g., if the last item on a page was deleted)
            if (paginatedHistory.length === 1 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
            } else if (analysisHistory.length % itemsPerPage === 0 && currentPage > totalPages) {
                 // Edge case if deletion makes the last page empty
                 setCurrentPage(Math.max(1, totalPages -1));
            }

            // Optional: User feedback (e.g., temporary success message)

        } catch (error: any) {
            console.error(`Error deleting history entry ${entryId}:`, error);
            setError(`Failed to delete history entry: ${error.message}`);
            // Optional: User feedback for error
        } finally {
            setIsLoading(false);
        }
    };
    // <<< END NEW DELETE FUNCTION >>>

    // --- Add console log here for debugging --- 
    // console.log('User Info State:', userInfo); // Removed for cleanup

    // Function to close the chat history modal
    const handleCloseChatHistoryModal = () => {
        setShowChatHistoryModal(false);
        setCurrentChatEntryId(null);
    };

    // State for loading status in chat
    const [isChatResponseLoading, setIsChatResponseLoading] = useState<boolean>(false);

    // Function to add a user message to the chat history and get AI response
    const handleAddChatMessage = async (entryId: string, message: string) => {
        if (!message.trim() || !isLoggedIn || !idToken) return;
        
        if (!viewingChatHistory) {
            console.error('No chat history being viewed');
            return;
        }
        
        // Add the user message immediately to local state for UI feedback
        const newUserMessage = {
            type: 'user',
            content: message,
            timestamp: new Date()
        };
        
        const updatedChat = [...viewingChatHistory, newUserMessage];
        setViewingChatHistory(updatedChat);
        
        // First, save the user message to the server
        try {
            const response = await fetch(`${apiBaseUrl}/api/history/${entryId}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'user',
                    content: message
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to add message: ${response.status} ${response.statusText}`);
            }
            
            const messageData = await response.json();
            console.log('User message added successfully:', messageData);
            
            // Now get AI response
            setIsChatResponseLoading(true);
            
            // Show typing indicator in the UI
            const typingIndicator = {
                type: 'assistant',
                content: '<p class="typing-indicator">Audacy AI is thinking...</p>',
                timestamp: new Date(),
                isTyping: true
            };
            setViewingChatHistory([...updatedChat, typingIndicator]);
            
            // Get AI response
            const aiResponse = await getAIResponseForChatMessage(entryId, message, updatedChat);
            
            if (aiResponse) {
                // Remove typing indicator and add the real response
                const finalChat = [...updatedChat, aiResponse];
                setViewingChatHistory(finalChat);
                
                // Save AI response to the server
                const aiSaveResponse = await fetch(`${apiBaseUrl}/api/history/${entryId}/chat`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${idToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'assistant',
                        content: aiResponse.content
                    })
                });
                
                if (!aiSaveResponse.ok) {
                    console.error('Failed to save AI response:', aiSaveResponse.status, aiSaveResponse.statusText);
                } else {
                    console.log('AI response saved successfully');
                }
            } else {
                // If AI response failed, remove typing indicator
                setViewingChatHistory(updatedChat);
                console.error('Failed to get AI response');
            }
        } catch (error) {
            console.error('Error in chat message flow:', error);
            // Revert the optimistic update if failed
            setViewingChatHistory(viewingChatHistory);
            alert(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsChatResponseLoading(false);
        }
    };

    // Function to get AI response for chat history messages
    const getAIResponseForChatMessage = async (entryId: string, userMessage: string, currentChatHistory: Array<{type: string, content: string, timestamp: any}>) => {
        if (!entryId || !userMessage.trim() || !isLoggedIn || !idToken) {
            console.error('Missing required data for AI response');
            return null;
        }

        try {
            const entry = analysisHistory.find(h => h.id === entryId);
            if (!entry) {
                console.error(`Cannot find history entry with ID ${entryId}`);
                return null;
            }

            // Create FormData for the AI request
            const formData = new FormData();
            
            // Append context data from the history entry
            formData.append('originalPrompt', entry.results?.promptSent || '');
            formData.append('originalAnalysis', entry.results?.rawAnalysisResult || '');
            formData.append('question', userMessage);
            formData.append('tactic', entry.inputs.selectedTactics || '');
            formData.append('kpi', entry.inputs.selectedKPIs || '');
            formData.append('fileName', entry.inputs.fileName || '');
            formData.append('currentSituation', entry.inputs.currentSituation || '');
            
            // Add the main analysis result if it exists
            if (entry.results?.analysisResult) {
                formData.append('analysisResult', entry.results.analysisResult);
            }
            
            // Add conversation history for context
            formData.append('conversationHistory', JSON.stringify(currentChatHistory));
            
            // Add selected model ID
            formData.append('modelId', entry.inputs.selectedModelId);
            
            // Send request to the AI service
            const response = await fetch(`${analysisApiUrl}/get-help`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`AI request failed with status ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Parse and sanitize the response
            const rawResponseText = data.response || '';
            const parsedHtml = await marked.parse(rawResponseText);
            let sanitizedHtml = DOMPurify.sanitize(parsedHtml);
            sanitizedHtml = cleanMarkdownCodeBlocks(sanitizedHtml);
            
            // Create and return the assistant message
            const assistantMessage = {
                type: 'assistant',
                content: sanitizedHtml,
                timestamp: new Date()
            };
            
            return assistantMessage;
        } catch (error) {
            console.error('Error getting AI response:', error);
            return {
                type: 'assistant',
                content: `<p class="error-message">I'm sorry, I encountered an error while processing your request. Please try again later.</p>`,
                timestamp: new Date()
            };
        }
    };

    // Add to imports
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Update this effect to handle clicking outside the menu more precisely
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Only close if clicking outside both the menu, its items, and its toggle button
            if (
                activeMenuId && 
                !(event.target as Element).closest('.action-menu-dropdown') &&
                !(event.target as Element).closest('.action-menu-item') &&
                !(event.target as Element).closest('.action-menu-button')
            ) {
                setActiveMenuId(null);
            }
        };

        // Add capture phase to ensure we handle this before other event handlers
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [activeMenuId]);

    // Update this function to toggle the menu with better focus handling
    const toggleActionMenu = (entryId: string, event?: React.MouseEvent) => {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        
        // If we're clicking on the same menu, toggle it closed
        if (activeMenuId === entryId) {
            setActiveMenuId(null);
        } else {
            // Otherwise, open the new menu and close any other
            setActiveMenuId(entryId);
        }
    };

    // Add a function to stop propagation for menu items
    const handleMenuItemClick = (callback: () => void, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        setActiveMenuId(null); // Close menu first
        setTimeout(callback, 10); // Then execute the callback with a slight delay
    };

    // Add specialized handlers for specific menu item actions
    const handleViewClick = (entryId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        setActiveMenuId(null);
        setTimeout(() => {
            handleLoadHistory(entryId);
        }, 10);
    };

    const handleChatClick = (entry: HistoryEntry, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        // Ensure helpConversation exists
        if (!entry.results.helpConversation || !Array.isArray(entry.results.helpConversation)) {
            console.log('Creating empty helpConversation array for chat');
            entry.results.helpConversation = [];
        }
        setActiveMenuId(null);
        setTimeout(() => {
            handleViewChatHistory(entry.id);
        }, 10);
    };

    const handleDeleteClick = (entryId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        setActiveMenuId(null);
        setTimeout(() => {
            if (window.confirm('Are you sure you want to delete this analysis? This action cannot be undone.')) {
                handleDeleteHistoryEntry(entryId);
            }
        }, 10);
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
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{analysisResult}</ReactMarkdown>
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
                        <div className="main-action-buttons">
                            <button
                                className="help-button"
                                onClick={() => setShowHelpModal(true)}
                                    // No need for disabled prop now, as it won't render when viewing history
                                    title={"Discuss this Analysis"}
                                >
                                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                    Discuss this Analysis
                            </button>
                            
                            {/* Include the New Analysis button in-flow on mobile */}
                            <button 
                                className="new-inquiry-button mobile-inline" 
                                onClick={handleNewInquiry}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                New Analysis
                            </button>
                        </div>
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
                                                        <div>{message.content}</div> 
                                                    ) : (
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{message.content}</ReactMarkdown>
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
                        className="new-inquiry-button desktop-float" 
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
            {/* Tab Navigation - Login Status Removed */}
            <div className="tab-navigation">
                <button
                    className={`tab-button ${activeView === 'new' ? 'active' : ''}`}
                    onClick={() => {
                        setActiveView('new');
                        // --- Data Layer Push ---
                        window.dataLayer = window.dataLayer || [];
                        window.dataLayer.push({
                            'event': 'select_tab',
                            'event_category': 'Navigation',
                            'event_action': 'Select Tab',
                            'event_label': 'New Analysis'
                        });
                    }}
                >
                    New Analysis
                </button>
                <button
                    className={`tab-button ${activeView === 'history' ? 'active' : ''}`}
                    onClick={() => {
                        setActiveView('history');
                         // ... data layer push ...
                    }}
                    title={isLoggedIn ? "View your analysis history" : "Login to view history"}
                >
                    History {isLoggedIn && analysisHistory.length > 0 ? `(${analysisHistory.length})` : ''} 
                </button>
                {/* Login Status Container Moved Out */}
            </div>

            {/* Tab Content Area */}
            <div className="tab-content">
                {/* === Render New Analysis Form === */}
                {activeView === 'new' && (
                    <div className="card assistant-card">
                        {/* === Assistant Card Header === */}
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
                        {/* === End Header === */}

                        <h1>Audacy Assistant</h1>
                        <div className="app-instructions">
                            <p className="instructions-title">Get Your AI-Powered Analysis:</p>
                            <span className="instruction-step">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                <strong>Upload:</strong> Add the campaign data file (CSV, XLSX, PDF).
                            </span>
                            <span className="instruction-step">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <strong>Select:</strong> Choose the main Tactic and KPI to focus on.
                            </span>
                            <span className="instruction-step">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                <strong>Describe:</strong> Briefly outline the client's situation and goals (this helps tailor the insights!).
                            </span>
                            <p className="instructions-footer">Click "Analyze" for actionable insights designed for AEs.</p>
                        </div>

                        {/* Client Name Input - MOVED HERE */}
                        <div className="input-container full-width">
                            <label htmlFor="clientName">Client / Advertiser Name:</label>
                <input
                                type="text"
                                id="clientName"
                                value={clientName}
                                onChange={handleClientNameChange} // Ensure handler is connected
                                placeholder="Enter client or advertiser name"
                                // Add conditional error class
                                className={`text-input ${clientNameError ? 'input-error' : ''}`}
                                title="Enter the name of the client or advertiser for this analysis."
                            />
            </div>

                        {/* Form Grid (Tactics/KPIs) - MOVED HERE */}
            <div className="form-grid">
                <div className="form-column">
                    <div className="select-container">
                        <label htmlFor="tactics-list">Select Tactic:</label>
                        <select
                            id="tactics-list"
                            // Add conditional error class
                            className={`tactics-list ${tacticError ? 'input-error' : ''}`}
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
                            // Add conditional error class
                            className={`kpi-list ${kpiError ? 'input-error' : ''}`}
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
                                {/* KPI recommendation popup */}
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

            {/* ADD KPI MISMATCH WARNING HERE */}
            {showKpiMismatchWarning && (
                <div className="kpi-mismatch-warning">
                    <span className="warning-icon">⚠️</span>
                    <span>
                        Heads up: <strong>{selectedKPIs}</strong> isn't a commonly recommended KPI for the <strong>{selectedTactics}</strong> tactic. Consider using one of these: {getRecommendationMessage(selectedTactics) || 'N/A'}.
                    </span>
                    <button
                        className="close-warning-button"
                        onClick={() => setShowKpiMismatchWarning(false)}
                        title="Dismiss warning"
                    >
                        &times;
                    </button>
                </div>
            )}

                        {/* Situation Textarea - MOVED HERE */}
            <div className="text-area-container">
                <label htmlFor="currentSituation">Current Situation & Goals:</label>
                <textarea
                    id="currentSituation"
                    className="text-area"
                    value={currentSituation}
                    onChange={handleSituationChange}
                                placeholder="Describe your current marketing situation and goals... (Optional)"
                    rows={3}
                                title="Briefly describe the client's current situation, challenges, or the context for this analysis."
                />
            </div>

                        {/* File Upload Section - MOVED HERE */}
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
                                // Add conditional error class
                                className={`choose-file-button ${fileError ? 'input-error' : ''}`}
                                title="Upload campaign performance data (CSV, XLSX, or PDF)."
                            >
                                Choose File
                    </label>

                            {/* Container for file name and remove button */}
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

                        {/* Advanced Options Trigger - MOVED HERE */}
                        <div className="advanced-options-trigger-area">
                            <button
                                className="advanced-options-button"
                                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                title="Show/hide advanced options"
                            >
                                {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
            </button>
                        </div>

                        {/* Advanced Options Content - MOVED HERE */}
                        {showAdvancedOptions && (
                            <div className="advanced-toggles-container revealed">
                                <h4 className="advanced-options-heading">Advanced Options</h4>
                                {/* Analysis Speed Toggle */}
                                <div className="model-selector-simple speed-toggle">
                                    <span className="model-selector-label">Analysis Speed:</span>
                                    <div className="model-button-group">
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
                            </div>
                        )}

                        {/* Analyze Button / Spinner / Error - MOVED HERE */}
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
            {/* Replace simple error display with alert box */}
            {error && (
                <div className="error-alert" role="alert">
                    <div className="error-alert-content"> 
                        {/* <span className="error-icon" aria-hidden="true">!</span> */}{/* Icon Removed */}
                        {/* Separate title and message */} 
                        <div className="error-text-content">
                            <strong className="error-title">Analysis Failed:</strong> 
                            {/* Extract message after the title prefix if possible */}
                            <span>{error.replace(/^Analysis Failed: /i, '')}</span>
                        </div>
                    </div>
                    <button 
                        className="error-alert-close" 
                        onClick={() => setError(null)} // Add onClick to clear error
                        aria-label="Close error message"
                    >
                        &times; {/* Use HTML entity for 'x' */}
                    </button>
                </div>
            )}
            
                    </div> /* End assistant-card for 'new' view */
                )}

                {/* === Render History View === */}
                {activeView === 'history' && (
                  <div className="card history-card">
                      {/* NEW WRAPPER DIV */}
                      <div className="history-header-area">
                          <h2>Analysis History</h2>
                          {!isLoggedIn ? (
                            null // Don't show controls if not logged in
                          ) : (
                              <div className="history-controls">
                                  {analysisHistory.length > 0 ? (
                                    <button
                                      className="clear-history-link-button" // Renamed class
                                      onClick={handleClearHistory}
                                      title="Clear all analysis history"
                                    >
                                      {/* SVG Icon */}
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                      </svg>
                                      Clear History {/* Put text on one line after SVG */}
                                    </button>
                                  ) : (
                                     null // Don't show the 'no history' message here
                                  )}
                              </div>
                          )}
                      </div> {/* END of history-header-area */}

                      {/* Render Login Prompt or History List */}
                      {!isLoggedIn ? (
                          <div className="login-prompt">
                              {/* ... Login prompt content ... Keep original */}
                               <p>Please log in with Google to access your saved history.</p>
                              <GoogleLogin
                                onSuccess={handleLoginSuccess}
                                onError={() => {
                                  console.error('Google Login Failed');
                                  setError('Google login failed. Please try again.');
                                  setIsLoggedIn(false); // Ensure logged out state on error
                                  setIdToken(null);
                                  setUserInfo(null);
                                }}
                                // Add other props like theme, size, shape as needed
                              />
                              {error && <div className="error-message login-error">{error}</div>} {/* Display login errors */}
                          </div>
                      ) : (
                          <>
                              {/* Render 'No history' message here if needed and controls didn't render button */} 
                              {analysisHistory.length === 0 && (
                                  <p className="no-history-message">No analysis history available.</p>
                              )}

                              {/* History list ul */}
                              {analysisHistory.length > 0 && (
                                  <ul className="history-list">
                                      {paginatedHistory.map(entry => (
                                          <li key={entry.id} className={`history-item ${activeMenuId === entry.id ? 'has-active-menu' : ''}`}>
                                              <div className="history-entry">
                                                  <div className="history-entry-header">
                                                      <div className="history-entry-info">
                                                          <h3 className="history-entry-title">
                                                              {entry.inputs.clientName || 'Unnamed Analysis'}
                                                          </h3>
                                                          <div className="history-entry-meta">
                                                              <span className="history-date">
                                                                  {formatHistoryTimestamp(entry.timestamp)}
                                                              </span>
                                                              <span className="history-tactic">
                                                                  {entry.inputs.selectedTactics}
                                                              </span>
                                                              <span className="history-kpi">
                                                                  {entry.inputs.selectedKPIs}
                                                              </span>
                                                          </div>
                                                          {entry.inputs.fileName && (
                                                              <div className="history-file-name">
                                                                  {entry.inputs.fileName}
                                                              </div>
                                                          )}
                                                      </div>
                                                      
                                                      {/* Button now uses a function to ensure it correctly gets/loses focus */}
                                                      <button 
                                                          ref={activeMenuId === entry.id ? buttonRef : null}
                                                          className={`action-menu-button ${activeMenuId === entry.id ? 'active' : ''}`}
                                                          aria-label="Show actions menu"
                                                          onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleActionMenu(entry.id);
                                                          }}
                                                      >
                                                          &hellip;
                                                      </button>
                                                      
                                                      {/* Separate handling for desktop and mobile menus */}
                                                      {/* Desktop dropdown - always in DOM, visibility controlled by CSS */}
                                                      <div 
                                                          ref={activeMenuId === entry.id ? menuRef : null}
                                                          className={`action-menu-dropdown desktop-menu ${activeMenuId === entry.id ? 'visible' : ''}`}
                                                          onClick={(e) => e.stopPropagation()}
                                                      >
                                                          <button 
                                                              className="action-menu-item"
                                                              onClick={(e) => handleViewClick(entry.id, e)}
                                                          >
                                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                                  <circle cx="12" cy="12" r="3"></circle>
                                                              </svg>
                                                              View
                                                          </button>
                                                          <button 
                                                              className="action-menu-item"
                                                              onClick={(e) => handleChatClick(entry, e)}>
                                                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                                                  </svg>
                                                                  Chat
                                                              </button>
                                                          <button 
                                                              className="action-menu-item delete"
                                                              onClick={(e) => handleDeleteClick(entry.id, e)}
                                                          >
                                                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                  <polyline points="3 6 5 6 21 6"></polyline>
                                                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                                              </svg>
                                                              Delete
                                                          </button>
                                                      </div>
                                                      
                                                      {/* Mobile overlay and action menu - conditionally rendered */}
                                                      {activeMenuId === entry.id && (
                                                          <div className="mobile-menu-container">
                                                              <div 
                                                                  className="action-menu-overlay visible" 
                                                                  onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setActiveMenuId(null);
                                                                  }}
                                                              ></div>
                                                              <div 
                                                                  className="action-menu-dropdown mobile-menu visible"
                                                                  onClick={(e) => e.stopPropagation()}
                                                              >
                                                                  <div className="action-menu-header">Actions</div>
                                                                  <button 
                                                                      className="action-menu-item"
                                                                      onClick={(e) => handleViewClick(entry.id, e)}
                                                                  >
                                                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                                          <circle cx="12" cy="12" r="3"></circle>
                                                                      </svg>
                                                                      View
                                                                  </button>
                                                                  <button 
                                                                      className="action-menu-item"
                                                                      onClick={(e) => handleChatClick(entry, e)}>
                                                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                                                      </svg>
                                                                      Chat
                                                                  </button>
                                                                  <button 
                                                                      className="action-menu-item delete"
                                                                      onClick={(e) => handleDeleteHistoryEntry(entry.id)}
                                                                  >
                                                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                          <polyline points="3 6 5 6 21 6"></polyline>
                                                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                                          <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                          <line x1="14" y1="11" x2="14" y2="17"></line>
                                                                      </svg>
                                                                      Delete
                                                                  </button>
                                                              </div>
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          </li>
                                      ))}
                                  </ul>
                              )}

                              {/* Pagination Controls */} 
                              {analysisHistory.length > 0 && totalPages > 1 && (
                                  <div className="pagination-controls">
                                      <button 
                                          className="pagination-button"
                                          onClick={() => setCurrentPage(1)}
                                          disabled={currentPage === 1}
                                      >
                                          &laquo; First
                                      </button>
                                      <button 
                                          className="pagination-button"
                                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                          disabled={currentPage === 1}
                                      >
                                          &lsaquo; Prev
                                      </button>
                                      <span className="pagination-info">
                                          Page {currentPage} of {totalPages}
                                      </span>
                                      <button 
                                          className="pagination-button"
                                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                          disabled={currentPage === totalPages}
                                      >
                                          Next &rsaquo;
                                      </button>
                                      <button 
                                          className="pagination-button"
                                          onClick={() => setCurrentPage(totalPages)}
                                          disabled={currentPage === totalPages}
                                      >
                                          Last &raquo;
                                      </button>
                                  </div>
                              )}
                          </>
                      )}
                  </div>
                )}
            </div> {/* End tab-content */}

            {/* === Login Status Container Moved Here === */}
            <div className="login-status-container">
              {isLoggedIn && userInfo ? (
                  // Use a fragment to group elements
                  <>
                     {/* User profile picture */}
                     {userInfo.picture && (
                        <img 
                            src={userInfo.picture} 
                            alt={userInfo.name || userInfo.email || 'User profile picture'} 
                            className="user-profile-picture"
                        />
                     )}
                     {/* Placeholder for Google Logo - Will refine styling */}
                     {/* We could use an actual SVG or font icon here if available */}
                     {/* <span className="google-logo-placeholder">G</span> */} {/* Removed again */}
                     
                     {/* User name/email */}
                     <span className="user-info" title={userInfo.email}>
                          Logged in as {userInfo.name || userInfo.email}
                     </span>
                     
                     {/* Logout button */}
                     <button onClick={handleLogout} className="logout-button" title="Logout">
                         Logout
                     </button>
                  </>
              ) : (
                   // Display nothing here if not logged in, the button inside the History tab card handles it
                   null
              )}
            </div>
            {/* === End Moved Login Status Container === */}

            {/* This is the chat history modal */}
            {showChatHistoryModal && viewingChatHistory && (
              <div className="chat-history-modal-backdrop">
                <div className="chat-history-modal">
                  <div className="chat-history-modal-header">
                    <h2>Chat History</h2>
                    <button 
                      className="modal-close-button" 
                      onClick={handleCloseChatHistoryModal}
                      title="Close chat history"
                    >
                      <span className="material-icons">close</span>
                    </button>
                  </div>
                  <div className="chat-history-container">
                    {viewingChatHistory.length > 0 ? (
                      <div className="chat-messages">
                        {viewingChatHistory.map((message, index) => (
                          <div key={index} className={`chat-message ${message.type}`}>
                            <div className="message-content-wrapper">
                              <div className="message-header">
                                <strong>{message.type === 'user' ? 'You' : 'Assistant'}</strong>
                                <span className="message-time">
                                  {typeof message.timestamp === 'object' && message.timestamp instanceof Date 
                                    ? formatHistoryTimestamp(message.timestamp.getTime())
                                    : formatHistoryTimestamp(message.timestamp)}
                                </span>
                              </div>
                              <div className="message-content">
                                {message.type === 'user' ? (
                                  <p>{message.content}</p>
                                ) : (
                                  <ReactMarkdown>{message.content}</ReactMarkdown>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-history">
                        <p>No chat messages available for this analysis.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
    );
}

export default App;