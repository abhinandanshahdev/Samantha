import { UseCase } from '../types';
import api from './apiService';

interface VoiceSessionConfig {
  onAudioReceived: (audioData: ArrayBuffer) => void;
  onTranscriptReceived: (transcript: string, messageType?: 'user' | 'assistant') => void;
  onError: (error: Error) => void;
  onConnectionStateChange: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  voiceMode?: 'auto' | 'push-to-talk';
  onVoiceModeChange?: (mode: 'auto' | 'push-to-talk') => void;
}

interface SessionContextCall {
  toolName: string;
  payload: any;
  result: any;
  timestamp: string;
}

interface SessionContext {
  recentCalls: SessionContextCall[];
  conversationTurns: number;
}

export class RealtimeVoiceService {
  private ws: WebSocket | null = null;
  private config: VoiceSessionConfig | null = null;
  private isConnecting = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private isResponsePending = false;
  private hasIntroduced = false;
  private voiceMode: 'auto' | 'push-to-talk' = 'auto';
  private isPushToTalkActive = false;
  private noiseLevel = 0;
  private noiseThreshold = 0.5;
  private sessionContext: SessionContext = {
    recentCalls: [],
    conversationTurns: 0
  };
  private readonly MAX_CONTEXT_CALLS = 10; // Keep last 10 function calls
  private domainId: number | null = null; // Track active domain for function calls
  private lastUserTranscript: string | null = null; // Track last user utterance
  private conversationHistory: { isUser: boolean; text: string }[] = []; // Rolling text history
  private readonly MAX_HISTORY = 20;


  // Helper method to update session context after function calls
  private updateSessionContext(toolName: string, payload: any, result: any): void {
    this.sessionContext.recentCalls.push({
      toolName,
      payload,
      result,
      timestamp: new Date().toISOString()
    });

    // Keep only last MAX_CONTEXT_CALLS
    if (this.sessionContext.recentCalls.length > this.MAX_CONTEXT_CALLS) {
      this.sessionContext.recentCalls.shift();
    }

    this.sessionContext.conversationTurns++;
    console.log(`📋 Session context updated: ${this.sessionContext.recentCalls.length} calls, ${this.sessionContext.conversationTurns} turns`);
  }

  // Reset session context
  private resetSessionContext(): void {
    this.sessionContext = {
      recentCalls: [],
      conversationTurns: 0
    };
    console.log('📋 Session context reset');
  }

  async startSession(config: VoiceSessionConfig, useCases: UseCase[] = []): Promise<void> {
    console.log('🚀 Starting voice session with orchestrator bridge v2');
    this.voiceMode = config.voiceMode || 'auto';

    // Get active domain from localStorage
    try {
      // Preferred key used by DomainContext
      const activeDomainIdStr = localStorage.getItem('active_domain_id');
      if (activeDomainIdStr) {
        const parsedId = parseInt(activeDomainIdStr, 10);
        this.domainId = Number.isFinite(parsedId) ? parsedId : null;
      } else {
        // Backward-compat: older key may store full object
        const activeDomainStr = localStorage.getItem('activeDomain');
        if (activeDomainStr) {
          const activeDomain = JSON.parse(activeDomainStr);
          this.domainId = activeDomain?.id || null;
        }
      }
      console.log('📁 Voice service: Using domain ID:', this.domainId);
    } catch (error) {
      console.error('Error getting active domain:', error);
      this.domainId = null;
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('Stopping existing session before starting new one');
      this.stopSession();
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Reset session context for new session
    this.resetSessionContext();

    this.config = config;
    this.isConnecting = true;
    config.onConnectionStateChange('connecting');

    try {
      // Get realtime config from backend
      const realtimeConfig = await this.getRealtimeConfig();
      
      // Connect to Azure OpenAI Realtime API
      await this.connectWebSocket(realtimeConfig);
      
      // Start audio capture
      await this.startAudioCapture();
      
    } catch (error) {
      this.isConnecting = false;
      config.onConnectionStateChange('error');
      config.onError(error as Error);
      throw error;
    }
  }

  private async getRealtimeConfig(): Promise<any> {
    const response = await fetch('/api/realtime/ephemeral-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get realtime config');
    }

    const data = await response.json();
    return data;
  }

  private async connectWebSocket(config: any): Promise<void> {
    // Core42 Realtime API WebSocket URL format
    const wsUrl = `${config.endpoint}?model=${config.model}`;

    console.log('Connecting to Core42 WebSocket URL:', wsUrl);

    // Use WebSocket subprotocols for authentication (browser-compatible method)
    this.ws = new WebSocket(wsUrl, [
      "realtime",
      `openai-insecure-api-key.${config.apiKey}`,
      "openai-beta.realtime-v1"
    ]);

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('WebSocket not initialized'));

      this.ws.onopen = async () => {
        this.isConnecting = false;
        this.config?.onConnectionStateChange('connected');
        
        // Build rich instructions using intelligent chat service
        const instructions = await this.buildVoiceInstructions();

        // Configure the session with function calling
        console.log('🔧 Registering orchestrator_bridge tool with Azure Realtime API');
        this.sendMessage({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: instructions,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: this.voiceMode === 'auto' ? {
              type: 'server_vad',
              threshold: this.noiseThreshold,
              prefix_padding_ms: 200,
              silence_duration_ms: 800
            } : null, // Disable VAD for push-to-talk
            tools: [
              {
                type: "function",
                name: "orchestrator_bridge",
                description: "Execute any tool through the intelligent orchestrator with ReAct planning and reasoning. This bridge provides access to all backend functions with multi-step reasoning capabilities.",
                parameters: {
                  type: "object",
                  properties: {
                    toolName: {
                      type: "string",
                      enum: [
                        "search_use_cases",
                        "get_use_case_details",
                        "get_use_cases_by_criteria",
                        "get_strategic_pillars",
                        "get_strategic_goals_by_pillar",
                        "get_use_cases_by_goal",
                        "get_use_case_statistics",
                        "get_executive_brief",
                        "ask_user_clarification"
                      ],
                      description: "Name of the tool to execute through the orchestrator"
                    },
                    payload: {
                      type: "object",
                      description: "Parameters for the tool. Structure depends on the toolName selected."
                    }
                  },
                  required: ["toolName", "payload"]
                }
              }
            ],
            tool_choice: "auto"
          }
        });
        
        // Send greeting introduction
        setTimeout(() => {
          this.sendIntroduction();
        }, 1000); // Wait 1 second after connection
        
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      this.ws.onclose = () => {
        this.config?.onConnectionStateChange('disconnected');
      };

      this.ws.onerror = (error) => {
        this.isConnecting = false;
        this.config?.onConnectionStateChange('error');
        this.config?.onError(new Error('WebSocket error'));
        reject(error);
      };
    });
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      console.log('WebSocket message received:', message.type, message);
      
      switch (message.type) {
        case 'response.audio.delta':
          console.log('Received audio delta:', message);
          if (message.delta) {
            const audioData = this.base64ToArrayBuffer(message.delta);
            this.config?.onAudioReceived(audioData);
          }
          break;
          
        case 'response.audio_transcript.delta':
          console.log('Audio transcript delta:', message.delta);
          // Skip - will use response.output_item.done for final transcript
          break;
          
        case 'response.audio_transcript.done':
          console.log('Audio transcript done:', message.transcript);
          // Skip - will use response.output_item.done for final transcript  
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          console.log('Transcription completed:', message.transcript);
          if (message.transcript) {
            this.lastUserTranscript = message.transcript;
            this.config?.onTranscriptReceived(message.transcript, 'user');

            // Track in local conversation history
            this.conversationHistory.push({ isUser: true, text: message.transcript });
            if (this.conversationHistory.length > this.MAX_HISTORY) {
              this.conversationHistory.shift();
            }
          }
          break;
          
        case 'response.text.delta':
          console.log('Text response delta:', message.delta);
          // Skip - will use response.output_item.done for final text
          break;

        case 'session.created':
          console.log('Session created successfully');
          break;

        case 'input_audio_buffer.speech_started':
          console.log('Speech detected');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('Speech ended - VAD will automatically trigger response');
          // With VAD enabled (default), the API automatically commits the buffer
          // and creates a response. We don't need to manually trigger it.
          this.isResponsePending = true;
          break;

        case 'input_audio_buffer.committed':
          console.log('Audio buffer committed by VAD');
          break;

        case 'response.created':
          console.log('AI response started');
          break;

        case 'response.done':
          console.log('AI response completed');
          this.isResponsePending = false; // Reset for next conversation
          break;

        case 'conversation.item.created':
          console.log('Conversation item created:', message);
          // Skip - will use response.output_item.done for final content
          break;

        case 'response.output_item.added':
          console.log('Response output item added:', message);
          break;

        case 'response.output_item.done':
          console.log('Response output item done:', message);
          // Check if this contains transcript text for the assistant's response
          if (message.item?.content) {
            // Handle different content types
            if (Array.isArray(message.item.content)) {
              message.item.content.forEach((content: any) => {
                if (content.type === 'text' && content.text) {
                  console.log('Assistant text from output_item:', content.text);
                  this.config?.onTranscriptReceived(content.text, 'assistant');

                  // Track assistant text in history
                  this.conversationHistory.push({ isUser: false, text: content.text });
                  if (this.conversationHistory.length > this.MAX_HISTORY) {
                    this.conversationHistory.shift();
                  }
                } else if (content.type === 'audio' && content.transcript) {
                  console.log('Assistant transcript from output_item:', content.transcript);
                  this.config?.onTranscriptReceived(content.transcript, 'assistant');

                  // Track assistant transcript in history
                  this.conversationHistory.push({ isUser: false, text: content.transcript });
                  if (this.conversationHistory.length > this.MAX_HISTORY) {
                    this.conversationHistory.shift();
                  }
                }
              });
            } else if (typeof message.item.content === 'string') {
              console.log('Assistant text from output_item (string):', message.item.content);
              this.config?.onTranscriptReceived(message.item.content, 'assistant');

              // Track assistant string content in history
              this.conversationHistory.push({ isUser: false, text: message.item.content });
              if (this.conversationHistory.length > this.MAX_HISTORY) {
                this.conversationHistory.shift();
              }
            }
          }
          // Also check for transcript field directly
          if (message.item?.transcript) {
            console.log('Assistant transcript from output_item:', message.item.transcript);
            this.config?.onTranscriptReceived(message.item.transcript, 'assistant');

            // Track assistant transcript in history
            this.conversationHistory.push({ isUser: false, text: message.item.transcript });
            if (this.conversationHistory.length > this.MAX_HISTORY) {
              this.conversationHistory.shift();
            }
          }
          break;

        case 'response.function_call_arguments.delta':
          console.log('Function call arguments delta:', message);
          break;

        case 'response.function_call_arguments.done':
          console.log('Function call arguments done:', message);
          if (message.name && message.arguments) {
            this.handleFunctionCall(message.name, message.arguments, message.call_id);
          }
          break;
          
        case 'error':
          console.error('WebSocket error:', message.error);
          this.config?.onError(new Error(message.error?.message || 'Unknown error'));
          break;

        default:
          console.log('Unhandled message type:', message.type);
          // Log the full message for debugging unknown types
          if (message.type && message.type.includes('response')) {
            console.log('Full unhandled response message:', JSON.stringify(message, null, 2));
          }
          break;
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private async startAudioCapture(): Promise<void> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Create AudioContext for proper PCM16 conversion
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });

      const source = audioContext.createMediaStreamSource(this.audioStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          
          // Calculate current noise level for auto-detection
          this.updateNoiseLevel(inputBuffer);
          
          // Send audio based on voice mode
          if (this.voiceMode === 'auto' || this.isPushToTalkActive) {
            this.sendPCM16Audio(inputBuffer);
          }
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Store references for cleanup
      (this as any).audioContext = audioContext;
      (this as any).processor = processor;
      (this as any).source = source;

    } catch (error) {
      throw new Error('Failed to access microphone: ' + (error as Error).message);
    }
  }

  private sendPCM16Audio(audioBuffer: Float32Array): void {
    try {
      // Convert Float32 to PCM16
      const pcm16 = new Int16Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        // Clamp to [-1, 1] and convert to 16-bit integer
        const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      }
      
      // Convert to base64
      const bytes = new Uint8Array(pcm16.buffer);
      const base64Audio = this.arrayBufferToBase64(bytes.buffer);
      
      this.sendMessage({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      });
    } catch (error) {
      console.error('Error sending PCM16 audio:', error);
    }
  }

  private async sendAudioData(audioBlob: Blob): Promise<void> {
    // This method is now deprecated in favor of sendPCM16Audio
    console.warn('sendAudioData is deprecated, using PCM16 conversion instead');
  }

  private sendMessage(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private updateNoiseLevel(audioBuffer: Float32Array): void {
    // Calculate RMS (Root Mean Square) for noise level detection
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      sum += audioBuffer[i] * audioBuffer[i];
    }
    const rms = Math.sqrt(sum / audioBuffer.length);
    
    // Smooth the noise level with exponential moving average
    this.noiseLevel = this.noiseLevel * 0.9 + rms * 0.1;
    
    // Auto-adjust threshold based on ambient noise
    if (this.voiceMode === 'auto') {
      // Base threshold + noise compensation
      this.noiseThreshold = Math.min(0.8, Math.max(0.3, 0.5 + this.noiseLevel * 2));
    }
  }

  switchVoiceMode(mode: 'auto' | 'push-to-talk'): void {
    this.voiceMode = mode;
    this.config?.onVoiceModeChange?.(mode);
    
    // Update session configuration if connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendMessage({
        type: 'session.update',
        session: {
          turn_detection: mode === 'auto' ? {
            type: 'server_vad',
            threshold: this.noiseThreshold,
            prefix_padding_ms: 200,
            silence_duration_ms: 800
          } : null
        }
      });
    }
  }

  setPushToTalkActive(active: boolean): void {
    console.log('PTT active changed:', active);
    const wasActive = this.isPushToTalkActive;
    this.isPushToTalkActive = active;

    // When PTT is released (was active, now inactive), commit buffer and trigger response
    if (wasActive && !active && this.voiceMode === 'push-to-talk') {
      console.log('PTT released - committing audio buffer and triggering response');
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Commit the audio buffer
        this.sendMessage({
          type: 'input_audio_buffer.commit'
        });

        // Trigger a response
        this.sendMessage({
          type: 'response.create'
        });
      }
    }
  }

  getCurrentNoiseLevel(): number {
    return this.noiseLevel;
  }

  getCurrentThreshold(): number {
    return this.noiseThreshold;
  }

  // Helper function to get time-based greeting (matches ChatAssistant.tsx)
  private getTimeBasedGreeting(): string {
    // Get current time in Abu Dhabi (GST - UTC+4)
    const now = new Date();
    const abuDhabiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
    const hour = abuDhabiTime.getHours();

    // Generate time-based greeting (Good morning, Good afternoon, or Good evening)
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  }

  // Helper function to extract user name from various sources
  private extractUserName(): string {
    try {
      // Priority 1: Check if there's a current user in DOM/window context
      if (typeof window !== 'undefined') {
        const appUser = (window as any).__APP_USER__;
        if (appUser?.name) {
          return appUser.name.split(' ')[0];
        }
      }

      // Priority 2: Try JWT token
      const jwtToken = sessionStorage.getItem('jwt_token');
      if (jwtToken) {
        const payload = JSON.parse(atob(jwtToken.split('.')[1]));
        const name = payload.name || payload.given_name || payload.preferred_username;
        if (name) {
          return name.split(' ')[0]; // First name only
        }
      }
      
      // Priority 3: Try user profile in localStorage
      const userProfile = localStorage.getItem('userProfile');
      if (userProfile) {
        const profile = JSON.parse(userProfile);
        if (profile.name) {
          return profile.name.split(' ')[0];
        }
        if (profile.displayName) {
          return profile.displayName.split(' ')[0];
        }
      }
      
      return 'there';
    } catch (error) {
      console.error('Error extracting user name:', error);
      return 'there';
    }
  }

  private async buildVoiceInstructions(): Promise<string> {
    const userName = this.extractUserName();
    
    // Build base instructions with Strategic Pillars
    const baseInstructions = `You are Hekmah, an intelligent AI assistant for AI Strategy at Department of Finance, Abu Dhabi. You're having a voice conversation with ${userName}.

PERSONALITY: Be warm, conversational, and personable. Use ${userName}'s name occasionally but not excessively. Be professional yet friendly. Keep responses concise for voice interaction.

VOICE MODE SPECIFIC RULES:
1. Keep responses concise (1-3 sentences typically)
2. Use natural conversational flow
3. Avoid long lists or detailed technical information unless specifically requested
4. Use ${userName}'s name occasionally but not excessively
5. Speak naturally as if having a real conversation
6. For search results, mention only the top 2-3 most relevant items

THINKING AUDIO - SPEAK BEFORE FUNCTION CALLS:
IMPORTANT: Before calling any function, FIRST speak a brief filler phrase out loud, THEN call the function.
Sequence: Speak first -> Then call function -> Then give results

Example filler phrases to say BEFORE searching:
- "Let me check that for you..."
- "One moment while I look that up..."
- "Just a second, searching our database..."

NEVER call a function silently - always announce what you're doing first.

SCOPE RESTRICTION - STAY ON TOPIC:
You are ONLY designed to help with AI Strategy topics for Department of Finance, Abu Dhabi.
For OFF-TOPIC questions (general knowledge, weather, news, geography, etc.), politely redirect:
- "I'm specialized in AI strategy for Department of Finance. Is there anything about our AI initiatives I can help you with?"
NEVER answer questions unrelated to DoF AI strategy - always redirect back to AI topics.

CRITICAL ANTI-HALLUCINATION RULES:
1. NEVER make up or guess information about AI initiatives, departments, goals, or statistics
2. If you don't have specific data, ALWAYS use the available functions to get current information
3. When someone asks about specific names, ALWAYS use search_use_cases first
4. If someone mentions any proper noun that could be an AI initiative name, search for it before responding
5. NEVER assume you know what something is - always search the database first

DYNAMIC DATA ACCESS: You have access to real-time functions to query:
- AI initiatives by department, status, strategic goal, pillar, or impact level
- Strategic goals by pillar
- Current statistics and counts
- Search functionality for specific AI initiatives

Remember: This is a voice conversation with ${userName}. Be conversational and use the available functions to get accurate, current information.`;
    
    return baseInstructions;
  }

  private sendIntroduction(): void {
    if (this.hasIntroduced || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const userName = this.extractUserName();
    const timeGreeting = this.getTimeBasedGreeting();
    this.hasIntroduced = true;

    // Let the model generate the introduction naturally with both text and audio
    // Use time-based greeting (matches text chat behavior)
    this.sendMessage({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: `Greet the user with "${timeGreeting}, ${userName}!" then briefly introduce yourself as Hekmah. Keep it snappy and short. Ask them what you can help them with.`
      }
    });
  }

  private async handleFunctionCall(functionName: string, argumentsStr: string, callId: string): Promise<void> {
    try {
      console.log('🌉 Handling function call:', functionName);

      // Check if this is the orchestrator_bridge
      if (functionName === 'orchestrator_bridge') {
        // Parse the arguments to extract toolName and payload
        const args = JSON.parse(argumentsStr);
        const { toolName, payload } = args;

        console.log('🔧 Orchestrator bridge called with tool:', toolName);
        console.log('📦 Payload:', payload);

        // Call the orchestrator endpoint with session context and domain
        const response = await api.post('/chat/orchestrator', {
          toolName,
          payload,
          sessionContext: this.sessionContext,
          domainId: this.domainId,
          userQuery: this.lastUserTranscript,
          conversationHistory: this.conversationHistory
        });

        const { ok, result, error, iterations, execution_time_ms } = response.data;

        if (!ok) {
          console.error('❌ Orchestrator bridge error:', error);
          throw new Error(error);
        }

        console.log('✅ Orchestrator bridge succeeded');
        console.log(`   Iterations: ${iterations}, Time: ${execution_time_ms}ms`);

        // Update session context with this call
        this.updateSessionContext(toolName, payload, result);

        // Send function result back to the conversation
        this.sendMessage({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(result)
          }
        });

        // Create response to continue the conversation
        this.sendMessage({
          type: 'response.create'
        });

      } else {
        // Route ANY direct tool name through the orchestrator bridge for consistency
        console.log('⚠️  Direct function call requested, routing via orchestrator:', functionName);

        let payload: any = {};
        try {
          payload = JSON.parse(argumentsStr);
        } catch (e) {
          console.warn('Unable to parse function arguments as JSON, passing raw string');
          payload = { _raw: argumentsStr };
        }

        const response = await api.post('/chat/orchestrator', {
          toolName: functionName,
          payload,
          sessionContext: this.sessionContext,
          domainId: this.domainId,
          userQuery: this.lastUserTranscript,
          conversationHistory: this.conversationHistory
        });

        const { ok, result, error, iterations, execution_time_ms } = response.data;

        if (!ok) {
          console.error('❌ Orchestrator bridge error (routed):', error);
          throw new Error(error);
        }

        console.log('✅ Orchestrator bridge (routed) succeeded');
        console.log(`   Iterations: ${iterations}, Time: ${execution_time_ms}ms`);

        // Update session context with this call
        this.updateSessionContext(functionName, payload, result);

        // Send function result back to the conversation
        this.sendMessage({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(result)
          }
        });

        // Create response to continue the conversation
        this.sendMessage({
          type: 'response.create'
        });
      }

    } catch (error) {
      console.error('Voice function call error:', error);

      // Send error response
      this.sendMessage({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify({ error: "Function execution failed" })
        }
      });

      this.sendMessage({
        type: 'response.create'
      });
    }
  }

  stopSession(): void {
    console.log('Stopping voice session...');

    // Stop and cleanup MediaRecorder first
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }

    // Disconnect AudioContext components before closing
    if ((this as any).processor) {
      try {
        (this as any).processor.disconnect();
      } catch (e) {
        console.log('Processor already disconnected');
      }
      (this as any).processor = null;
    }

    if ((this as any).source) {
      try {
        (this as any).source.disconnect();
      } catch (e) {
        console.log('Source already disconnected');
      }
      (this as any).source = null;
    }

    // Close AudioContext
    if ((this as any).audioContext) {
      try {
        (this as any).audioContext.close();
      } catch (e) {
        console.log('AudioContext already closed');
      }
      (this as any).audioContext = null;
    }

    // Stop all audio stream tracks - THIS IS THE CRITICAL STEP FOR RELEASING THE MICROPHONE
    if (this.audioStream) {
      console.log('Stopping audio stream tracks...');
      this.audioStream.getTracks().forEach(track => {
        console.log('Stopping track:', track.label, 'enabled:', track.enabled, 'readyState:', track.readyState);
        track.stop();
      });
      this.audioStream = null;
      console.log('Audio stream tracks stopped');
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Reset state
    this.config = null;
    this.isConnecting = false;
    this.isResponsePending = false;
    this.hasIntroduced = false;
    this.isPushToTalkActive = false;

    console.log('Voice session stopped and microphone released');
  }

  isActive(): boolean {
    return this.ws?.readyState === WebSocket.OPEN || this.isConnecting;
  }
}