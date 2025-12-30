import { UseCase } from '../types';
import api from './apiService';
import { getCurrentToken, getBaseURL } from './apiService';
import { getRecentArtifacts, ArtifactReference } from './artifactService';

interface ChatMessage {
  text: string;
  isUser: boolean;
}

// Helper to mask API key for logging
const maskApiKey = (token: string | null): string => {
  if (!token) return 'NO_TOKEN';
  if (token.length <= 4) return 'TOKEN_TOO_SHORT';
  return `...${token.slice(-4)}`;
};

interface AIResponse {
  response: string;
  metadata?: {
    iterations: number;
    execution_time_ms: number;
    session_id?: string | null;
  };
  scratchpad?: any;
  skills_used?: string[];
  sessionId?: string | null; // Session ID for multi-turn conversations
  recoveredArtifacts?: ArtifactReference[]; // Artifacts recovered after stream error
}

interface ChatOptions {
  activeSkills?: string[];
  sessionId?: string | null; // Pass session ID to resume conversation
}

// Streaming event types
export interface StreamEvent {
  type: 'thinking' | 'thinking_content' | 'tool_call' | 'tool_result' | 'text' | 'done' | 'error' | 'status' | 'permission_request' | 'session_started' | 'interrupted';
  message?: string;
  content?: string;
  iteration?: number;
  function_name?: string;
  arguments?: any;
  success?: boolean;
  result_summary?: string;
  response?: string;
  scratchpad?: any;
  metadata?: any;
  skills_used?: string[];
  sessionId?: string | null;
  artifacts?: any[];
  // Permission request fields
  action?: string;
  toolName?: string;
  toolArgs?: any;
  requiresConfirmation?: boolean;
  awaitingPermission?: boolean;
  pendingAction?: any;
  // Session/interrupt fields
  requestId?: string;
  partialArtifacts?: any[];
  completedSteps?: string[];
}

// Permission request payload for human-in-the-loop confirmation
export interface PermissionRequest {
  action: string;
  toolName: string;
  toolArgs: any;
  sessionId?: string | null;
}

export interface StreamCallbacks {
  onThinking?: (message: string) => void;
  onThinkingContent?: (content: string) => void; // Claude's actual thinking/reasoning content
  onStatus?: (message: string) => void; // User-friendly ephemeral status messages
  onToolCall?: (functionName: string, args: any, iteration: number) => void;
  onToolResult?: (functionName: string, success: boolean, summary: string, iteration: number) => void;
  onText?: (content: string) => void;
  onDone?: (result: AIResponse) => void;
  onError?: (error: string) => void;
  onPermissionRequest?: (request: PermissionRequest) => void; // Human-in-the-loop permission request
  onSessionStarted?: (requestId: string) => void; // Called when session is assigned a requestId for abort capability
  onInterrupted?: (message: string, partialArtifacts: any[]) => void; // Called when processing is interrupted
}

// Return type for streaming function - includes abort capability
export interface StreamHandle {
  promise: Promise<AIResponse>;
  abort: () => Promise<void>;
}

export const chatWithAI = async (
  userQuery: string,
  useCases: UseCase[],
  conversationHistory: ChatMessage[] = [],
  domainId?: number | null,
  options?: ChatOptions
): Promise<AIResponse> => {
  const requestPayload = {
    userQuery,
    conversationHistory,
    isVoiceMode: false,
    domain_id: domainId,
    activeSkills: options?.activeSkills || [],
    sessionId: options?.sessionId || null // Pass session ID for multi-turn memory
  };

  const endpoint = '/chat/intelligent';
  const fullUrl = `${api.defaults.baseURL}${endpoint}`;
  const token = getCurrentToken();

  console.group('🤖 AI Chat Request');
  console.log('📍 Endpoint:', fullUrl);
  console.log('🔑 API Key (last 4):', maskApiKey(token));
  console.log('📤 Request Payload:', {
    userQuery,
    conversationHistoryLength: conversationHistory.length,
    isVoiceMode: false,
    sessionId: options?.sessionId || 'new session'
  });
  console.log('📝 Full Request:', requestPayload);
  console.groupEnd();

  try {
    // Call the backend intelligent chat API
    const response = await api.post(endpoint, requestPayload);

    console.group('✅ AI Chat Response Success');
    console.log('📍 Endpoint:', fullUrl);
    console.log('✨ Status:', response.status);
    console.log('📥 Raw Response:', response.data);
    console.log('💬 Response Text:', response.data.response);
    console.log('🧠 Scratchpad:', response.data.scratchpad);
    console.log('📊 Metadata:', response.data.metadata);
    console.log('📍 Session ID:', response.data.sessionId || 'none');
    console.groupEnd();

    return {
      response: response.data.response,
      metadata: response.data.metadata,
      scratchpad: response.data.scratchpad,
      skills_used: response.data.skills_used,
      sessionId: response.data.sessionId || null // Return session ID for multi-turn memory
    };

  } catch (error: any) {
    console.group('❌ AI Chat Error');
    console.log('📍 Endpoint:', fullUrl);
    console.log('🔑 API Key (last 4):', maskApiKey(token));
    console.log('⚠️ Error Status:', error.response?.status || 'NO_RESPONSE');
    console.log('⚠️ Status Text:', error.response?.statusText || 'NO_STATUS_TEXT');
    console.log('⚠️ Error Code:', error.code || 'NO_ERROR_CODE');
    console.log('📥 Error Response:', error.response?.data || 'NO_RESPONSE_DATA');
    console.log('💔 Error Message:', error.message);
    console.log('🔍 Full Error Object:', error);
    
    // Log specific error scenarios
    if (error.response?.status === 403) {
      console.error('🚫 403 Forbidden - Check API key permissions and rate limits');
    } else if (error.response?.status === 404) {
      console.error('🔍 404 Not Found - Check endpoint URL:', fullUrl);
    } else if (error.response?.status === 401) {
      console.error('🔐 401 Unauthorized - Token may be expired or invalid');
    } else if (error.response?.status === 429) {
      console.error('⏰ 429 Too Many Requests - Rate limit exceeded');
    }
    
    console.groupEnd();
    
    // Check if it's a network error or API unavailable
    let errorMessage = "I apologize, but I encountered an error processing your request. Please try again.";

    if (error.code === 'NETWORK_ERROR' || error.response?.status >= 500) {
      errorMessage = "I apologize, but the intelligent chat service is currently unavailable. You can still browse our AI initiatives manually through the interface.";
    } else if (error.response?.status === 403) {
      errorMessage = "I apologize, but I don't have permission to access the AI service. Please check with your administrator about API access.";
    } else if (error.response?.status === 404) {
      errorMessage = "I apologize, but the AI chat service endpoint could not be found. Please contact support.";
    } else if (error.response?.status === 429) {
      errorMessage = "I apologize, but we've hit the rate limit for the AI service. Please try again in a few moments.";
    }

    return { response: errorMessage };
  }
};

/**
 * Streaming chat with AI - uses SSE for real-time progress updates
 * Shows tool calls and reasoning as they happen
 */
export const chatWithAIStream = (
  userQuery: string,
  useCases: UseCase[],
  conversationHistory: ChatMessage[] = [],
  domainId?: number | null,
  options?: ChatOptions,
  callbacks?: StreamCallbacks
): StreamHandle => {
  const token = getCurrentToken();
  const baseURL = getBaseURL();

  // Track requestId for abort capability
  let currentRequestId: string | null = null;

  const requestPayload = {
    userQuery,
    conversationHistory,
    domain_id: domainId,
    activeSkills: options?.activeSkills || [],
    sessionId: options?.sessionId || null
  };

  console.group('AI Chat Stream Request');
  console.log('Endpoint:', `${baseURL}/chat/intelligent/stream`);
  console.log('Query:', userQuery);
  console.groupEnd();

  // Abort function that calls the abort endpoint
  const abortSession = async (): Promise<void> => {
    if (currentRequestId) {
      console.log('Aborting session:', currentRequestId);
      try {
        await fetch(`${baseURL}/chat/intelligent/abort`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ requestId: currentRequestId })
        });
        console.log('Abort request sent successfully');
      } catch (e) {
        console.warn('Failed to send abort request:', e);
      }
    }
  };

  const promise = new Promise<AIResponse>((resolve, reject) => {
    // Create AbortController for connection management
    const abortController = new AbortController();
    let lastEventTime = Date.now();
    let visibilityWasHidden = false;
    let connectionHealthy = true;

    // Connection health check - detect if no events received for 60 seconds
    const healthCheckInterval = setInterval(() => {
      const timeSinceLastEvent = Date.now() - lastEventTime;
      if (timeSinceLastEvent > 60000 && connectionHealthy) {
        console.warn('SSE FRONTEND: No events received for 60s, connection may be stale');
        connectionHealthy = false;
        callbacks?.onStatus?.('Connection may be slow, please wait...');
      }
    }, 10000);

    // Handle page visibility changes (mobile app switching)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        visibilityWasHidden = true;
        console.log('SSE FRONTEND: Page hidden (app backgrounded)');
      } else if (visibilityWasHidden) {
        console.log('SSE FRONTEND: Page visible again after being hidden');
        // Check if connection is still healthy
        const timeSinceLastEvent = Date.now() - lastEventTime;
        if (timeSinceLastEvent > 30000) {
          console.warn('SSE FRONTEND: Connection likely lost while app was backgrounded');
          callbacks?.onStatus?.('Reconnecting after app switch...');
        }
        visibilityWasHidden = false;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function
    const cleanup = () => {
      clearInterval(healthCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    // Use fetch with ReadableStream for SSE
    fetch(`${baseURL}/chat/intelligent/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(requestPayload),
      signal: abortController.signal
    }).then(async response => {
      if (!response.ok) {
        const error = await response.json();
        callbacks?.onError?.(error.message || 'Stream request failed');
        cleanup();
        reject(new Error(error.message || 'Stream request failed'));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks?.onError?.('No response body');
        cleanup();
        reject(new Error('No response body'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AIResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = '';
        let currentData = '';

        console.log('SSE FRONTEND: Processing', lines.length, 'lines');

        for (const line of lines) {
          // Skip SSE comment lines (used for padding/keep-alive)
          // But use them to track connection health
          if (line.startsWith(':')) {
            lastEventTime = Date.now();
            connectionHealthy = true;
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            console.log('SSE FRONTEND: Got event type:', currentEvent);
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim();
            console.log('SSE FRONTEND: Got data for event:', currentEvent);
          } else if (line === '' && currentEvent && currentData) {
            // Process complete event
            console.log('SSE FRONTEND: Processing complete event:', currentEvent);
            // Update connection health tracking
            lastEventTime = Date.now();
            connectionHealthy = true;
            try {
              const event: StreamEvent = JSON.parse(currentData);

              switch (event.type) {
                case 'thinking':
                  console.log('SSE FRONTEND: Calling onThinking with:', event.message);
                  callbacks?.onThinking?.(event.message || '');
                  break;
                case 'thinking_content':
                  // Claude's actual thinking/reasoning content (extended thinking)
                  console.log('SSE FRONTEND: Calling onThinkingContent with:', event.content?.substring(0, 50) + '...');
                  callbacks?.onThinkingContent?.(event.content || '');
                  break;
                case 'status':
                  // User-friendly ephemeral status messages
                  console.log('SSE FRONTEND: Calling onStatus with:', event.message);
                  callbacks?.onStatus?.(event.message || '');
                  break;
                case 'tool_call':
                  // Legacy - kept for backwards compatibility but now mostly replaced by 'status'
                  console.log('SSE FRONTEND: Calling onToolCall with:', event.function_name);
                  callbacks?.onToolCall?.(
                    event.function_name || '',
                    event.arguments || {},
                    event.iteration || 0
                  );
                  break;
                case 'tool_result':
                  // Legacy - kept for backwards compatibility but now mostly replaced by 'status'
                  console.log('SSE FRONTEND: Calling onToolResult with:', event.function_name, event.success);
                  callbacks?.onToolResult?.(
                    event.function_name || '',
                    event.success || false,
                    event.result_summary || '',
                    event.iteration || 0
                  );
                  break;
                case 'text':
                  callbacks?.onText?.(event.content || '');
                  break;
                case 'done':
                  finalResult = {
                    response: event.response || '',
                    metadata: event.metadata,
                    scratchpad: event.scratchpad,
                    skills_used: event.skills_used,
                    sessionId: event.sessionId
                  };
                  callbacks?.onDone?.(finalResult);
                  break;
                case 'error':
                  callbacks?.onError?.(event.message || 'Unknown error');
                  break;
                case 'session_started':
                  // Store requestId for abort capability
                  currentRequestId = event.requestId || null;
                  console.log('SSE FRONTEND: Session started with requestId:', currentRequestId);
                  callbacks?.onSessionStarted?.(event.requestId || '');
                  break;
                case 'interrupted':
                  // Processing was interrupted (timeout or user stop)
                  console.log('SSE FRONTEND: Processing interrupted:', event.message);
                  callbacks?.onInterrupted?.(event.message || 'Processing stopped', event.partialArtifacts || []);
                  break;
                case 'permission_request':
                  // Human-in-the-loop permission request
                  console.log('SSE FRONTEND: Permission request:', event.toolName);
                  callbacks?.onPermissionRequest?.({
                    action: event.action || '',
                    toolName: event.toolName || '',
                    toolArgs: event.toolArgs || {},
                    sessionId: event.sessionId
                  });
                  break;
              }
            } catch (e) {
              console.warn('Failed to parse SSE event:', currentData);
            }

            // Reset for next event
            currentEvent = '';
            currentData = '';
          }
        }
      }

      cleanup();
      if (finalResult) {
        resolve(finalResult);
      } else {
        // Stream ended without 'done' event - try to recover artifacts
        console.warn('Stream ended without done event - attempting artifact recovery...');

        // Check if connection was lost while app was backgrounded
        if (visibilityWasHidden) {
          console.log('Connection likely lost while app was in background');
          callbacks?.onStatus?.('Connection lost while app was in background. Checking for completed work...');
        }

        try {
          const recoveredArtifacts = await getRecentArtifacts(120); // Last 2 minutes
          if (recoveredArtifacts.length > 0) {
            console.log('Recovered', recoveredArtifacts.length, 'artifacts from interrupted stream');
            // Return partial success with recovered artifacts
            const recoveryResult: AIResponse = {
              response: 'The connection was interrupted, but your file(s) may have been created successfully. Check the downloads below or use the Artifacts Browser.',
              recoveredArtifacts: recoveredArtifacts
            };
            callbacks?.onDone?.(recoveryResult);
            resolve(recoveryResult);
            return;
          }
        } catch (recoveryError) {
          console.error('Artifact recovery failed:', recoveryError);
        }
        reject(new Error('Stream ended without final result. If you were generating a file, check the Artifacts Browser.'));
      }
    }).catch(async error => {
      cleanup();
      console.error('Stream error:', error);

      // Check if this was due to app backgrounding
      if (visibilityWasHidden) {
        console.log('Stream error occurred while app was backgrounded');
        callbacks?.onStatus?.('Connection lost while app was in background. Checking for completed work...');
      }

      // Also attempt recovery on catch errors
      try {
        const recoveredArtifacts = await getRecentArtifacts(120);
        if (recoveredArtifacts.length > 0) {
          console.log('Recovered', recoveredArtifacts.length, 'artifacts after stream error');
          const recoveryResult: AIResponse = {
            response: 'The connection was interrupted, but your file(s) may have been created successfully. Check the downloads below or use the Artifacts Browser.',
            recoveredArtifacts: recoveredArtifacts
          };
          callbacks?.onDone?.(recoveryResult);
          resolve(recoveryResult);
          return;
        }
      } catch (recoveryError) {
        console.error('Artifact recovery failed:', recoveryError);
      }
      callbacks?.onError?.(error.message);
      reject(error);
    });
  });

  return { promise, abort: abortSession };
};

/**
 * Provider status response from backend
 */
export interface ProviderStatus {
  default: string;
  roleProviders: {
    admin: string;
    consumer: string;
  };
  providers: {
    [key: string]: {
      available: boolean;
      name: string;
      model: string;
    };
  };
}

/**
 * Fetch AI provider configuration from backend
 * Returns role-specific provider settings
 */
export const getProviderStatus = async (): Promise<ProviderStatus | null> => {
  try {
    const response = await api.get('/chat/providers');
    console.log('Provider status:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch provider status:', error);
    return null;
  }
};