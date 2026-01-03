import React, { useState, useRef, useEffect } from 'react';
import { UseCase } from '../../types';
import { chatWithAI, chatWithAIStream, StreamCallbacks, StreamHandle, getProviderStatus, ProviderStatus } from '../../services/aiChatService';
import { useDomain, useDomainTerminology } from '../../context/DomainContext';
import { useAuth } from '../../context/AuthContext';
import { useMsalAuth } from '../../context/DynamicMsalAuthContext';
import { useVoiceChat } from '../../hooks/useVoiceChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeExternalLinks from 'rehype-external-links';
import { FaTrash, FaMicrophone, FaMicrophoneSlash, FaDownload, FaFilePowerpoint, FaFileExcel, FaFileWord, FaFileAlt, FaFileCode, FaStop, FaPaperclip } from 'react-icons/fa';
import { Sparkles, Book, Check, AlertTriangle, X as XIcon } from 'lucide-react';
import { SkillsBrowser } from '../SkillsBrowser';
import { parseArtifactsFromResponse, downloadArtifact, getArtifactTypeName, ArtifactReference } from '../../services/artifactService';
import { attachmentAPI } from '../../services/apiService';
import './ChatAssistant.css';

// Progress step for timeline display
interface ProgressStep {
  id: string;
  message: string;
  status: 'in_progress' | 'completed';
  timestamp: number;
  duration?: number; // Duration in ms when completed
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  scratchpad?: any;
  metadata?: {
    iterations: number;
    execution_time_ms: number;
  };
  artifacts?: ArtifactReference[];
  progressSteps?: ProgressStep[]; // Persisted progress steps for timeline
  thinkingContent?: string; // Claude's reasoning for this response
}

// Helper to get icon for artifact type
const getArtifactIcon = (type: string) => {
  switch (type) {
    case 'presentation':
      return <FaFilePowerpoint />;
    case 'spreadsheet':
      return <FaFileExcel />;
    case 'document':
      return <FaFileWord />;
    case 'json':
      return <FaFileCode />;
    default:
      return <FaFileAlt />;
  }
};

// Artifact Download Button Component
const ArtifactDownloadButton: React.FC<{ artifact: ArtifactReference }> = ({ artifact }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadArtifact(artifact.id, artifact.fileName);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      className="artifact-download-btn"
      onClick={handleDownload}
      disabled={isDownloading}
      title={`Download ${artifact.title}`}
    >
      {getArtifactIcon(artifact.type)}
      <span className="artifact-info">
        <span className="artifact-title">{artifact.title}</span>
        <span className="artifact-type">{getArtifactTypeName(artifact.type)}</span>
      </span>
      <FaDownload className={isDownloading ? 'downloading' : ''} />
    </button>
  );
};

interface ChatAssistantProps {
  useCases: UseCase[];
  isOpen: boolean;
  onClose: () => void;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ useCases, isOpen, onClose }) => {
  const MESSAGE_LIMIT = 20; // Maximum messages before prompting to reset
  const { activeDomain } = useDomain();
  const { initiativeSingular, initiativePlural } = useDomainTerminology();

  // Use both auth contexts and pick the right one (same logic as App.tsx)
  const { isAdmin: traditionalAdmin, user: traditionalUser } = useAuth();
  const { isAdmin: msalAdmin, user: msalUser, msalConfigured, isAuthenticated: msalAuth } = useMsalAuth();

  // Prefer MSAL auth if configured and authenticated, otherwise fall back to traditional
  const isAdmin = msalConfigured && msalAuth ? msalAdmin : traditionalAdmin;
  const user = msalConfigured && msalAuth ? msalUser : traditionalUser;

  // Create dynamic welcome message based on time and context
  const getDomainWelcomeMessage = (): string => {
    // Get user name from localStorage or window
    let userName = '';
    try {
      const userProfile = localStorage.getItem('userProfile');
      if (userProfile) {
        const user = JSON.parse(userProfile);
        // Extract first name from display name or email
        if (user.displayName) {
          userName = user.displayName.split(' ')[0];
        } else if (user.name) {
          userName = user.name.split(' ')[0];
        }
      }
    } catch (e) {
      // Fallback to window if localStorage fails
      const windowUser = (window as any).__APP_USER__;
      if (windowUser?.displayName) {
        userName = windowUser.displayName.split(' ')[0];
      } else if (windowUser?.name) {
        userName = windowUser.name.split(' ')[0];
      }
    }

    // Get current time in local timezone
    const now = new Date();
    const hour = now.getHours();

    // Generate time-based greeting (Good morning, Good afternoon, or Good evening)
    let timeGreeting = '';
    if (hour >= 5 && hour < 12) {
      timeGreeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else {
      timeGreeting = 'Good evening';
    }

    // Add name if available
    const greeting = userName ? `${timeGreeting}, ${userName}!` : `${timeGreeting}!`;

    // Add follow-up - variations of "how can I help"
    const followUps = [
      'How can I help you?',
      'How may I assist you?',
      'What can I help you with?',
      'How can I assist you today?'
    ];

    // Pick a random follow-up
    const followUp = followUps[Math.floor(Math.random() * followUps.length)];

    return `${greeting} ${followUp}`;
  };

  const initialMessage: Message = {
    id: '1',
    text: getDomainWelcomeMessage(),
    isUser: false,
    timestamp: new Date()
  };

  // Load messages from localStorage or use initial message
  const loadMessages = (): Message[] => {
    const saved = localStorage.getItem('aiChatHistory');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert timestamp strings back to Date objects
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      } catch (e) {
        return [initialMessage];
      }
    }
    return [initialMessage];
  };

  const [messages, setMessages] = useState<Message[]>(loadMessages());
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamHandle, setCurrentStreamHandle] = useState<StreamHandle | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const voiceMessagesEndRef = useRef<HTMLDivElement>(null);
  const voiceMessagesContainerRef = useRef<HTMLDivElement>(null);
  const [isPushToTalkPressed, setIsPushToTalkPressed] = useState(false);

  // Streaming progress state - accumulates steps for timeline display
  const [streamingProgress, setStreamingProgress] = useState<{
    isStreaming: boolean;
    steps: ProgressStep[];
    startTime: number | null;
  }>({
    isStreaming: false,
    steps: [],
    startTime: null
  });
  
  // Ref to track steps across async operations (avoids stale closure issue)
  const progressStepsRef = useRef<ProgressStep[]>([]);
  const streamStartTimeRef = useRef<number | null>(null);
  
  // Thinking content state - shows Claude's reasoning in real-time
  const [thinkingContent, setThinkingContent] = useState<string>('');
  const thinkingContentRef = useRef<string>(''); // Ref to avoid stale closure
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const progressStepsScrollRef = useRef<HTMLDivElement>(null);

  // Timer state for elapsed time display
  const [elapsedTime, setElapsedTime] = useState(0);

  // Provider configuration state - determines streaming vs non-streaming based on role
  const [providerConfig, setProviderConfig] = useState<ProviderStatus | null>(null);

  // Fetch provider config on mount
  useEffect(() => {
    const fetchProviderConfig = async () => {
      const config = await getProviderStatus();
      if (config) {
        setProviderConfig(config);
        console.log('Provider config loaded:', config);
        console.log('Admin provider:', config.roleProviders?.admin);
        console.log('Consumer provider:', config.roleProviders?.consumer);
      }
    };
    fetchProviderConfig();
  }, []);

  // Determine if we should use streaming based on role and provider config
  const shouldUseStreaming = (): boolean => {
    // Check multiple sources for admin status to handle race conditions
    // 1. isAdmin from useAuth hook
    // 2. user?.role from useAuth hook
    // 3. localStorage userProfile (fallback for timing issues)
    let userIsAdmin = isAdmin || user?.role === 'admin';

    // Fallback: check localStorage if auth state not yet loaded
    if (!userIsAdmin) {
      try {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile) {
          const profile = JSON.parse(storedProfile);
          userIsAdmin = profile.role === 'admin';
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    console.log('shouldUseStreaming: isAdmin=', isAdmin, 'user?.role=', user?.role, 'userIsAdmin=', userIsAdmin);

    // Admins ALWAYS use streaming - this is the expected behavior
    // The streaming endpoint uses Claude Agent SDK and validates admin access server-side
    if (userIsAdmin) {
      console.log('shouldUseStreaming: Admin user - using streaming');
      return true;
    }

    // For non-admins, check provider config if available
    if (providerConfig?.roleProviders) {
      const useStream = providerConfig.roleProviders.consumer === 'claude';
      console.log('shouldUseStreaming: Consumer with config - streaming:', useStream);
      return useStream;
    }

    // Default: consumers don't stream (use Compass)
    console.log('shouldUseStreaming: Consumer default - no streaming');
    return false;
  };

  // Timer effect - updates every second while streaming
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (streamingProgress.isStreaming && streamingProgress.startTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - streamingProgress.startTime!) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [streamingProgress.isStreaming, streamingProgress.startTime]);

  // Auto-scroll thinking content smoothly to bottom when new content arrives
  useEffect(() => {
    if (thinkingScrollRef.current && thinkingContent) {
      thinkingScrollRef.current.scrollTo({
        top: thinkingScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [thinkingContent]);

  // Auto-scroll progress steps to bottom when new steps are added
  useEffect(() => {
    if (progressStepsScrollRef.current && streamingProgress.steps.length > 0) {
      progressStepsScrollRef.current.scrollTo({
        top: progressStepsScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [streamingProgress.steps]);

  // Format elapsed time as "X minutes and X seconds" or "X seconds"
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) {
      return `${secs} second${secs !== 1 ? 's' : ''}`;
    }
    return `${mins} minute${mins !== 1 ? 's' : ''} and ${secs} second${secs !== 1 ? 's' : ''}`;
  };

  // Format elapsed time compactly for header "Worked for Xm Xs"
  const formatElapsedTimeCompact = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) {
      return `${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  // Session ID for Claude Agent SDK multi-turn memory
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(() => {
    const saved = localStorage.getItem('claudeSessionId');
    return saved || null;
  });

  // Skills state
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [isSkillsBrowserOpen, setIsSkillsBrowserOpen] = useState(false);

  // Load active skills from localStorage
  useEffect(() => {
    const savedSkills = localStorage.getItem('activeSkills');
    if (savedSkills) {
      try {
        setActiveSkills(JSON.parse(savedSkills));
      } catch (e) {
        console.error('Failed to load active skills:', e);
      }
    }
  }, []);

  // Save active skills to localStorage
  useEffect(() => {
    localStorage.setItem('activeSkills', JSON.stringify(activeSkills));
  }, [activeSkills]);

  const handleSkillToggle = (skillName: string, isActive: boolean) => {
    setActiveSkills(prev =>
      isActive
        ? [...prev, skillName]
        : prev.filter(s => s !== skillName)
    );
  };

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    id: number;
    filename: string;
    file_size: number;
    mime_type: string;
  }>>([]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear the input so the same file can be re-selected
    e.target.value = '';

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await attachmentAPI.uploadChatFile(file, claudeSessionId || undefined);

      if (result.success) {
        // Add to pending attachments bar instead of messages
        setPendingAttachments(prev => [...prev, {
          id: result.attachment.id,
          filename: result.attachment.filename,
          file_size: result.attachment.file_size,
          mime_type: result.attachment.mime_type
        }]);
      }
    } catch (error: any) {
      console.error('File upload failed:', error);
      setUploadError(error.response?.data?.error || 'Failed to upload file');
      // Clear error after 5 seconds
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      setIsUploading(false);
    }
  };

  // Remove a pending attachment (also deletes from Azure)
  const handleRemoveAttachment = async (id: number) => {
    // Remove from UI immediately
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
    // Delete from Azure in background
    try {
      await attachmentAPI.deleteChatFile(id);
    } catch (err) {
      console.error('Failed to delete attachment from storage:', err);
    }
  };

  // Get file icon based on mime type
  const getFileIcon = (mimeType: string): string => {
    if (mimeType?.includes('word') || mimeType?.includes('document')) return 'W';
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return 'X';
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return 'P';
    if (mimeType?.includes('pdf')) return 'PDF';
    if (mimeType?.includes('image')) return 'IMG';
    return 'F';
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Voice chat integration
  const {
    isConnecting: isVoiceConnecting,
    isConnected: isVoiceConnected,
    conversation: voiceConversation,
    error: voiceError,
    startVoiceChat,
    stopVoiceChat,
    setPushToTalkActive
  } = useVoiceChat(useCases);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    // Small delay to ensure DOM is updated
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  }, [messages]);

  // Prevent body scroll when chat is open
  useEffect(() => {
    if (isOpen) {
      // Store current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }

    // Cleanup on unmount
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('aiChatHistory', JSON.stringify(messages));
  }, [messages]);

  // Update welcome message when domain changes
  useEffect(() => {
    if (messages.length > 0 && !messages[0].isUser) {
      const newWelcomeMessage = getDomainWelcomeMessage();
      // Only update if the message has changed
      if (messages[0].text !== newWelcomeMessage) {
        setMessages(prevMessages => [
          {
            ...prevMessages[0],
            text: newWelcomeMessage
          },
          ...prevMessages.slice(1)
        ]);
      }
    }
  }, [activeDomain]);

  // Do NOT merge voice conversation messages into text chat
  // This prevents the last voice message from persisting in the text modal after exit
  useEffect(() => {
    // intentionally no-op
  }, [voiceConversation]);

  // Track if we were in voice mode (to detect exit from voice mode)
  const wasVoiceConnectedRef = useRef(false);
  
  // Handle voice mode transitions (only clear/restore on actual transitions)
  useEffect(() => {
    if (isVoiceConnected && !wasVoiceConnectedRef.current) {
      // Just entered voice mode - don't clear text messages, they'll be hidden
      wasVoiceConnectedRef.current = true;
    } else if (!isVoiceConnected && !isVoiceConnecting && wasVoiceConnectedRef.current) {
      // Just exited voice mode - restore from localStorage
      wasVoiceConnectedRef.current = false;
      const saved = localStorage.getItem('aiChatHistory');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const restoredMessages = parsed.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          setMessages(restoredMessages);
        } catch (e) {
          // If parsing fails, just keep current messages
          console.error('Failed to restore messages from localStorage:', e);
        }
      }
    }
  }, [isVoiceConnected, isVoiceConnecting]);

  // Auto-scroll voice messages and scroll to bottom when opened
  useEffect(() => {
    if (isVoiceConnected) {
      setTimeout(() => {
        if (voiceMessagesContainerRef.current) {
          voiceMessagesContainerRef.current.scrollTop = voiceMessagesContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [voiceConversation, isVoiceConnected]);

  // Spacebar PTT handler
  useEffect(() => {
    if (!isVoiceConnected || !isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isPushToTalkPressed) {
        event.preventDefault();
        setIsPushToTalkPressed(true);
        setPushToTalkActive(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && isPushToTalkPressed) {
        event.preventDefault();
        setIsPushToTalkPressed(false);
        setPushToTalkActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isVoiceConnected, isPushToTalkPressed, isOpen, setPushToTalkActive]);

  const handleReset = () => {
    setMessages([{
      id: Date.now().toString(),
      text: getDomainWelcomeMessage(),
      isUser: false,
      timestamp: new Date()
    }]);
    setInputValue('');
    setIsLoading(false);
    // Clear Claude session ID to start fresh multi-turn conversation
    setClaudeSessionId(null);
    localStorage.removeItem('claudeSessionId');
    console.log('Frontend - Reset chat and cleared session ID');
  };

  // Handle stop request - abort the current streaming operation
  const handleStopRequest = async () => {
    if (!currentStreamHandle || isCancelling) return;

    setIsCancelling(true);
    console.log('Stop button clicked - aborting current request');

    try {
      await currentStreamHandle.abort();
      console.log('Abort request sent successfully');
    } catch (e) {
      console.error('Failed to abort:', e);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // Check if we've reached the message limit
    if (messages.length >= MESSAGE_LIMIT) {
      const limitMessage: Message = {
        id: Date.now().toString(),
        text: `You've reached the ${MESSAGE_LIMIT} message limit for this conversation. Please click the reset button (🗑️) above to start a new chat and continue.`,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, limitMessage]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Convert messages to format expected by chatWithAI
      // IMPORTANT: Use the updated messages array that includes the user message we just added
      const conversationHistory = [...messages, userMessage].map(msg => ({
        text: msg.text,
        isUser: msg.isUser
      }));

      // Provider-based API selection:
      // - If user's provider is 'claude': Use streaming API (Claude with real-time progress)
      // - If user's provider is 'compass': Use non-streaming API
      // Configured via ADMIN_AI_PROVIDER and CONSUMER_AI_PROVIDER env variables

      const useStreaming = shouldUseStreaming();
      const userProvider = providerConfig?.roleProviders?.[isAdmin ? 'admin' : 'consumer'] || 'unknown';
      console.log(`Frontend - Role: ${isAdmin ? 'admin' : 'consumer'}, Provider: ${userProvider}, Streaming: ${useStreaming}`);

      if (useStreaming) {
        // STREAMING PATH: Claude with real-time progress
        console.log('STREAM Frontend - Using streaming API (Claude)');
        console.log('STREAM Frontend - Session ID:', claudeSessionId || 'new session');

        // Start streaming progress display with empty steps array and start time
        const startTime = Date.now();
        progressStepsRef.current = []; // Reset ref
        streamStartTimeRef.current = startTime;
        setStreamingProgress({
          isStreaming: true,
          steps: [], // Start empty - first status event will add the first step
          startTime
        });

        // Helper to update both state and ref
        const addProgressStep = (message: string) => {
          const now = Date.now();
          setStreamingProgress(prev => {
            // Mark previous in_progress step as completed with duration
            const updatedSteps = prev.steps.map(step =>
              step.status === 'in_progress'
                ? { ...step, status: 'completed' as const, duration: now - step.timestamp }
                : step
            );
            // Add new step as in_progress
            const newSteps = [...updatedSteps, {
              id: now.toString(),
              message,
              status: 'in_progress' as const,
              timestamp: now
            }];
            // Also update ref for later access
            progressStepsRef.current = newSteps;
            return {
              ...prev,
              steps: newSteps
            };
          });
        };

        // Reset thinking content for new request
        setThinkingContent('');
        thinkingContentRef.current = '';

        // Stream callbacks for real-time progress - accumulates steps for timeline
        const streamCallbacks: StreamCallbacks = {
          onThinking: (message) => {
            console.log('CALLBACK onThinking:', message);
            addProgressStep(message);
          },
          onThinkingContent: (content) => {
            // Claude's actual thinking/reasoning - accumulate it
            console.log('CALLBACK onThinkingContent:', content.substring(0, 50) + '...');
            const newContent = thinkingContentRef.current + (thinkingContentRef.current ? '\n\n' : '') + content;
            thinkingContentRef.current = newContent; // Update ref for later use
            setThinkingContent(newContent); // Update state for UI
          },
          onStatus: (message) => {
            // User-friendly status messages - accumulate in timeline
            // Skip redundant "Starting to process" messages
            if (message.toLowerCase().includes('starting to process')) {
              console.log('CALLBACK onStatus: Skipping redundant message:', message);
              return;
            }
            console.log('CALLBACK onStatus:', message);
            addProgressStep(message);
          },
          onToolCall: (functionName, args, iteration) => {
            // Legacy callback - status events now handle this
            console.log('CALLBACK onToolCall (legacy):', functionName);
          },
          onToolResult: (functionName, success, summary, iteration) => {
            // Legacy callback - status events now handle this
            console.log('CALLBACK onToolResult (legacy):', functionName, success ? 'success' : 'failed');
          },
          onError: (error) => {
            console.error('CALLBACK onError:', error);
            addProgressStep(`Error: ${error}`);
          },
          onSessionStarted: (requestId) => {
            console.log('CALLBACK onSessionStarted:', requestId);
          },
          onInterrupted: (message, partialArtifacts) => {
            console.log('CALLBACK onInterrupted:', message, partialArtifacts?.length || 0, 'artifacts');
            addProgressStep('Processing was stopped.');
          }
        };

        // Use streaming API - get stream handle for abort capability
        const streamHandle = chatWithAIStream(
          inputValue,
          useCases,
          conversationHistory,
          activeDomain?.id,
          { activeSkills, sessionId: claudeSessionId },
          streamCallbacks
        );
        setCurrentStreamHandle(streamHandle);

        let result;
        try {
          result = await streamHandle.promise;
        } finally {
          setCurrentStreamHandle(null);
        }

        // Store the session ID for subsequent requests
        if (result.sessionId) {
          setClaudeSessionId(result.sessionId);
          localStorage.setItem('claudeSessionId', result.sessionId);
          console.log('STREAM Frontend - Stored session ID:', result.sessionId);
        }

        // Parse artifacts from the response
        let artifacts = parseArtifactsFromResponse(result.response);

        // Include recovered artifacts if stream was interrupted but files were created
        if (result.recoveredArtifacts && result.recoveredArtifacts.length > 0) {
          console.log('STREAM Frontend - Including recovered artifacts:', result.recoveredArtifacts.length);
          // Merge recovered artifacts, avoiding duplicates by id
          const existingIds = new Set(artifacts.map(a => a.id));
          const newRecovered = result.recoveredArtifacts.filter(a => !existingIds.has(a.id));
          artifacts = [...artifacts, ...newRecovered];
        }

        // Mark all progress steps as completed for persistence with duration
        // Use ref to get latest steps (avoids stale closure issue)
        const finalTime = Date.now();
        const stepsFromRef = progressStepsRef.current;
        const totalDurationMs = streamStartTimeRef.current ? finalTime - streamStartTimeRef.current : 0;

        const completedSteps = stepsFromRef.map(step => ({
          ...step,
          status: 'completed' as const,
          duration: step.duration || (finalTime - step.timestamp)
        }));

        console.log('STREAM Frontend - Final steps from ref:', stepsFromRef.length, 'Total duration:', totalDurationMs);

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: result.response,
          isUser: false,
          timestamp: new Date(),
          scratchpad: result.scratchpad,
          metadata: {
            iterations: result.metadata?.iterations || 0,
            execution_time_ms: result.metadata?.execution_time_ms || totalDurationMs
          },
          artifacts: artifacts.length > 0 ? artifacts : undefined,
          progressSteps: completedSteps.length > 0 ? completedSteps : undefined,
          thinkingContent: thinkingContentRef.current || undefined // Save thinking content from ref (avoids stale closure)
        };

        console.log('STREAM Frontend - Saving thinking content:', thinkingContentRef.current?.substring(0, 100) + '...');

        setMessages(prev => [...prev, aiMessage]);
        setThinkingContent(''); // Clear for next request
        thinkingContentRef.current = ''; // Clear ref too
      } else {
        // NON-STREAMING PATH: Compass or other non-Claude provider
        console.log('NON-STREAM Frontend - Using non-streaming API (provider:', userProvider, ')');

        const result = await chatWithAI(
          inputValue,
          useCases,
          conversationHistory,
          activeDomain?.id,
          { activeSkills, sessionId: claudeSessionId }
        );

        // Store the session ID for subsequent requests
        if (result.sessionId) {
          setClaudeSessionId(result.sessionId);
          localStorage.setItem('claudeSessionId', result.sessionId);
          console.log('NON-STREAM Frontend - Stored session ID:', result.sessionId);
        }

        // Parse artifacts from the response
        const artifacts = parseArtifactsFromResponse(result.response);

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: result.response,
          isUser: false,
          timestamp: new Date(),
          scratchpad: result.scratchpad,
          metadata: {
            iterations: result.metadata?.iterations || 0,
            execution_time_ms: result.metadata?.execution_time_ms || 0
          },
          artifacts: artifacts.length > 0 ? artifacts : undefined
        };

        console.log('NON-STREAM Frontend - Response received');

        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Error in AI chat:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'I apologize, but I encountered an error processing your request. Please try again.',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Reset streaming progress (both state and refs)
      setStreamingProgress({
        isStreaming: false,
        steps: [],
        startTime: null
      });
      progressStepsRef.current = [];
      streamStartTimeRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="ai-chat-backdrop" />
      <div className="ai-chat-overlay">
        <div className="ai-chat-container">
        <div className="ai-chat-header">
          <div className="ai-chat-title">
            <Sparkles size={16} strokeWidth={1.5} />
            <span>Voyagers AI Assistant</span>
          </div>
          <div className="ai-chat-header-buttons">
            {!isVoiceConnected && !isVoiceConnecting && (
              <button
                className={`ai-chat-skills-btn ${activeSkills.length > 0 ? 'has-active' : ''}`}
                onClick={() => setIsSkillsBrowserOpen(true)}
                title={activeSkills.length > 0 ? `${activeSkills.length} skill(s) active` : 'Browse skills'}
              >
                <Book size={14} />
                {activeSkills.length > 0 && (
                  <span className="skills-count">{activeSkills.length}</span>
                )}
              </button>
            )}
            {(isVoiceConnected || isVoiceConnecting) && (
              <button
                className="ai-chat-voice-exit"
                onClick={() => {
                  stopVoiceChat();
                  setIsPushToTalkPressed(false);
                }}
                title="Exit voice mode"
              >
                Exit Voice
              </button>
            )}
            {!isVoiceConnected && !isVoiceConnecting && (
              <button
                className="ai-chat-reset"
                onClick={handleReset}
                title="Clear chat history"
              >
                <FaTrash />
              </button>
            )}
            <button className="ai-chat-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        
        {/* Only show messages container when NOT in voice mode */}
        {!isVoiceConnected && !isVoiceConnecting && (
          <div className="ai-chat-messages" ref={messagesContainerRef}>
            {messages.map((message) => (
            <div
              key={message.id}
              className={`ai-chat-message ${message.isUser ? 'user' : 'ai'}`}
            >
              {/* Progress Timeline - Show for AI messages with progress steps (collapsed after completion) */}
              {/* This replaces the old Thinking Chain when progressSteps are available */}
              {!message.isUser && message.progressSteps && message.progressSteps.length > 0 && (
                <details className="ai-progress-timeline-completed">
                  <summary className="ai-progress-summary-completed">
                    <Check size={14} className="ai-progress-complete-icon" />
                    <span>Worked for {message.metadata?.execution_time_ms 
                      ? formatElapsedTime(Math.floor(message.metadata.execution_time_ms / 1000))
                      : `${message.progressSteps.length} steps`}</span>
                  </summary>
                  <div className="ai-progress-completed-content">
                    {/* Thinking sub-panel - collapsed by default */}
                    {message.thinkingContent && (
                      <details className="ai-thinking-subpanel">
                        <summary className="ai-thinking-subpanel-toggle">
                          <Sparkles size={10} className="ai-thinking-ticker-icon" />
                          <span>Reasoning</span>
                        </summary>
                        <div className="ai-thinking-subpanel-content">
                          {message.thinkingContent}
                        </div>
                      </details>
                    )}
                    
                    {/* Progress steps */}
                    <div className="ai-progress-steps-completed">
                      {message.progressSteps.map((step) => {
                        const isError = step.message.toLowerCase().startsWith('error');
                        return (
                          <div key={step.id} className={`ai-progress-step ${isError ? 'error' : ''}`}>
                            <span className={`ai-progress-icon ${isError ? 'error' : 'completed'}`}>
                              {isError ? <span>⚠️</span> : <Check size={12} />}
                            </span>
                            <span className="ai-progress-message">{step.message}</span>
                            {step.duration !== undefined && !isError && (
                              <span className="ai-progress-duration">
                                {step.duration >= 1000
                                  ? `${(step.duration / 1000).toFixed(1)}s`
                                  : `${step.duration}ms`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              )}

              {/* Legacy Thinking Chain - Only show if no progressSteps available (for older messages) */}
              {!message.isUser && !message.progressSteps && message.scratchpad && message.scratchpad.actions && message.scratchpad.actions.length > 0 && (
                <details className="ai-thinking-chain">
                  <summary className="ai-thinking-summary">
                    Reasoning steps: {message.scratchpad.actions.length} function calls, {message.metadata?.execution_time_ms}ms
                  </summary>
                  <div className="ai-thinking-content">
                    {message.scratchpad.actions.map((action: any, idx: number) => {
                      const obs = message.scratchpad.observations?.find((o: any) =>
                        o.iteration === action.iteration && o.function_name === action.function_name
                      );
                      const thought = message.scratchpad.thoughts?.find((t: any) => t.iteration === action.iteration);

                      return (
                        <div key={idx} className="ai-thinking-step">
                          <div className="ai-thinking-step-header">
                            <span className="ai-thinking-number">{idx + 1}</span>
                          </div>

                          {/* Show the thought/reasoning if available */}
                          {thought && thought.thought && (
                            <div className="ai-thinking-thought">
                              {thought.thought}
                            </div>
                          )}

                          {/* Show action and result */}
                          <div className="ai-thinking-action-block">
                            <code className="ai-thinking-function">{action.function_name}</code>
                            {obs && obs.success && (
                              <span className="ai-thinking-result">
                                {Array.isArray(obs.result) ? `${obs.result.length} results` : 'Success'}
                              </span>
                            )}
                            {obs && !obs.success && (
                              <span className="ai-thinking-result error">
                                Error: {obs.error}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* Message Content */}
              <div className="ai-chat-message-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize, rehypeExternalLinks]}
                  components={{
                    p: ({ children }) => <div className="md-paragraph">{children}</div>,
                    ul: ({ children }) => <ul className="md-list md-unordered">{children}</ul>,
                    ol: ({ children }) => <ol className="md-list md-ordered">{children}</ol>,
                    li: ({ children }) => <li className="md-list-item">{children}</li>,
                    code: ({ node, inline, className, children, ...props }: any) =>
                      inline ? <code className="md-inline-code">{children}</code> : <code>{children}</code>,
                    pre: ({ children }) => <pre className="md-code-block">{children}</pre>,
                    table: ({ children }) => <div className="md-table-wrapper"><table className="md-table">{children}</table></div>,
                    thead: ({ children }) => <thead className="md-table-head">{children}</thead>,
                    tbody: ({ children }) => <tbody className="md-table-body">{children}</tbody>,
                    tr: ({ children }) => <tr className="md-table-row">{children}</tr>,
                    th: ({ children }) => <th className="md-table-header">{children}</th>,
                    td: ({ children }) => <td className="md-table-cell">{children}</td>,
                  }}
                >
                  {message.text
                    // Aggressive whitespace cleanup to prevent double spacing
                    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
                    .replace(/(\r?\n\s*){3,}/g, '\n\n') // Remove multiple empty lines with whitespace
                    // Clean up artifact JSON from display
                    .replace(/\{"success"\s*:\s*true\s*,\s*"artifact"\s*:\s*\{[^}]+\}[^}]*\}/g, '')
                    .trim()
                  }
                </ReactMarkdown>

                {/* Artifact Download Buttons */}
                {!message.isUser && message.artifacts && message.artifacts.length > 0 && (
                  <div className="artifact-downloads">
                    {message.artifacts.map((artifact) => (
                      <ArtifactDownloadButton key={artifact.id} artifact={artifact} />
                    ))}
                  </div>
                )}
              </div>

              <div className="ai-chat-message-time">
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="ai-chat-message ai">
              <div className="ai-chat-message-content ai-streaming-content">
                {/* Thinking ticker - compact auto-scrolling area at top */}
                {thinkingContent && (
                  <div className="ai-thinking-ticker">
                    <div className="ai-thinking-ticker-header">
                      <Sparkles size={10} className="ai-thinking-ticker-icon" />
                      <span>Thinking</span>
                    </div>
                    <div 
                      className="ai-thinking-ticker-content" 
                      ref={thinkingScrollRef}
                    >
                      {thinkingContent}
                    </div>
                  </div>
                )}
                
                {/* Progress steps below thinking */}
                {streamingProgress.isStreaming && streamingProgress.steps.length > 0 ? (
                  <div className="ai-progress-timeline-live">
                    <div className="ai-progress-header">
                      <span className="ai-progress-timer">Worked for {formatElapsedTimeCompact(elapsedTime)}</span>
                      <span className="ai-progress-counter">{streamingProgress.steps.filter(s => s.status === 'completed').length}/{streamingProgress.steps.length}</span>
                      {currentStreamHandle && (
                        <button
                          className="ai-stop-icon"
                          onClick={handleStopRequest}
                          disabled={isCancelling}
                          title="Stop processing"
                        >
                          <FaStop size={10} />
                        </button>
                      )}
                    </div>
                    <div className="ai-progress-steps" ref={progressStepsScrollRef}>
                      {streamingProgress.steps.map((step) => {
                        const isError = step.message.toLowerCase().startsWith('error');
                        return (
                          <div key={step.id} className={`ai-progress-step ${isError ? 'error' : ''}`}>
                            <span className={`ai-progress-icon ${isError ? 'error' : step.status}`}>
                              {isError ? (
                                <span>⚠️</span>
                              ) : step.status === 'completed' ? (
                                <Check size={12} />
                              ) : (
                                <span className="ai-streaming-dot"></span>
                              )}
                            </span>
                            <span className="ai-progress-message">{step.message}</span>
                            {step.status === 'completed' && step.duration !== undefined && !isError && (
                              <span className="ai-progress-duration">
                                {step.duration >= 1000
                                  ? `${(step.duration / 1000).toFixed(1)}s`
                                  : `${step.duration}ms`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="ai-chat-typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
        )}

        {/* Message limit warning */}
        {!isVoiceConnected && !isVoiceConnecting && messages.length > MESSAGE_LIMIT - 4 && messages.length < MESSAGE_LIMIT && (
          <div className="ai-chat-limit-warning">
            {MESSAGE_LIMIT - messages.length} messages remaining in this conversation
          </div>
        )}
        
        {/* Upload error display */}
        {uploadError && (
          <div className="ai-chat-upload-error">
            {uploadError}
          </div>
        )}

        {/* Pending attachments bar */}
        {pendingAttachments.length > 0 && (
          <div className="ai-chat-attachments-bar">
            {pendingAttachments.map(attachment => (
              <div key={attachment.id} className="ai-chat-attachment-chip">
                <span className="attachment-icon">{getFileIcon(attachment.mime_type)}</span>
                <span className="attachment-name" title={attachment.filename}>
                  {attachment.filename.length > 20
                    ? attachment.filename.substring(0, 17) + '...'
                    : attachment.filename}
                </span>
                <span className="attachment-size">({formatFileSize(attachment.file_size)})</span>
                <button
                  className="attachment-remove"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Show either text input OR voice interface */}
        {!isVoiceConnected && !isVoiceConnecting ? (
          // Text input mode
          <div className="ai-chat-input">
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              accept="*/*"
            />
            <button
              className="ai-chat-voice-toggle"
              onClick={() => startVoiceChat()}
              title="Switch to voice mode"
            >
              <FaMicrophone />
            </button>
            <button
              className={`ai-chat-upload-toggle ${isUploading ? 'uploading' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isLoading}
              title="Upload a file"
            >
              <FaPaperclip />
            </button>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={pendingAttachments.length > 0 ? "Add a message about these files..." : "Ask a question..."}
              className="ai-chat-textarea"
              rows={2}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="ai-chat-send-button"
            >
              Send
            </button>
          </div>
        ) : (
          // Voice mode interface
          <>
            {/* Voice messages container - same structure as text chat */}
            <div className="ai-chat-messages" ref={voiceMessagesContainerRef}>
              {isVoiceConnecting ? (
                <div className="ai-chat-voice-connecting">
                  <div className="spinner"></div>
                  <p>Connecting to voice service...</p>
                </div>
              ) : (
                <>
                  {voiceConversation.map((msg, idx) => (
                    <div key={idx} className={`ai-chat-message ${msg.type === 'user' ? 'user' : 'ai'}`}>
                      <div className="ai-chat-message-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize, [rehypeExternalLinks, { target: '_blank' }]]}
                          components={{
                            p: ({ children }) => <div className="md-paragraph">{children}</div>,
                            ul: ({ children }) => <ul className="md-list md-unordered">{children}</ul>,
                            ol: ({ children }) => <ol className="md-list md-ordered">{children}</ol>,
                            li: ({ children }) => <li className="md-list-item">{children}</li>,
                            table: ({ children }) => <div className="md-table-wrapper"><table className="md-table">{children}</table></div>,
                            thead: ({ children }) => <thead className="md-table-head">{children}</thead>,
                            tbody: ({ children }) => <tbody className="md-table-body">{children}</tbody>,
                            tr: ({ children }) => <tr className="md-table-row">{children}</tr>,
                            th: ({ children }) => <th className="md-table-header">{children}</th>,
                            td: ({ children }) => <td className="md-table-cell">{children}</td>,
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      <div className="ai-chat-message-time">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                  <div ref={voiceMessagesEndRef} />
                </>
              )}
            </div>

            {/* PTT Input Area - same structure as text input */}
            {!isVoiceConnecting && (
              <div className="ai-chat-input">
                <div className="ai-chat-ptt-area">
                  <div
                    className={`ai-chat-ptt-button-large ${isPushToTalkPressed ? 'active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsPushToTalkPressed(true);
                      setPushToTalkActive(true);
                    }}
                    onMouseUp={() => {
                      setIsPushToTalkPressed(false);
                      setPushToTalkActive(false);
                    }}
                    onMouseLeave={() => {
                      if (isPushToTalkPressed) {
                        setIsPushToTalkPressed(false);
                        setPushToTalkActive(false);
                      }
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setIsPushToTalkPressed(true);
                      setPushToTalkActive(true);
                    }}
                    onTouchEnd={() => {
                      setIsPushToTalkPressed(false);
                      setPushToTalkActive(false);
                    }}
                  >
                    <FaMicrophone size={24} />
                  </div>
                  <p className="ai-chat-ptt-instruction">
                    {isPushToTalkPressed ? 'Release to send' : 'Hold SPACEBAR or click to talk'}
                  </p>
                </div>

                {voiceError && (
                  <div className="ai-chat-voice-error">
                    {voiceError}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* Skills Browser Modal */}
    <SkillsBrowser
      activeSkills={activeSkills}
      onSkillToggle={handleSkillToggle}
      isOpen={isSkillsBrowserOpen}
      onClose={() => setIsSkillsBrowserOpen(false)}
    />
    </>
  );
};

export default ChatAssistant;