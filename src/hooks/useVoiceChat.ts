import React, { useState, useRef, useCallback } from 'react';
import { RealtimeVoiceService } from '../services/realtimeVoiceService';
import { UseCase } from '../types';

interface ConversationMessage {
  type: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface UseVoiceChatResult {
  isConnecting: boolean;
  isConnected: boolean;
  transcript: string;
  conversation: ConversationMessage[];
  error: string | null;
  voiceMode: 'auto' | 'push-to-talk';
  noiseLevel: number;
  startVoiceChat: () => Promise<void>;
  stopVoiceChat: () => void;
  clearTranscript: () => void;
  switchVoiceMode: (mode: 'auto' | 'push-to-talk') => void;
  setPushToTalkActive: (active: boolean) => void;
}

export const useVoiceChat = (useCases: UseCase[] = []): UseVoiceChatResult => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<'auto' | 'push-to-talk'>('push-to-talk');  // Force push-to-talk only
  const [noiseLevel, setNoiseLevel] = useState(0);
  
  const voiceServiceRef = useRef<RealtimeVoiceService | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioBufferQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
    const audioContext = audioContextRef.current!;

    while (audioBufferQueueRef.current.length > 0) {
      const audioData = audioBufferQueueRef.current.shift()!;
      
      try {
        // Convert raw PCM16 data to AudioBuffer
        const pcm16Data = new Int16Array(audioData);
        const sampleRate = 24000; // Azure OpenAI Realtime uses 24kHz
        const audioBuffer = audioContext.createBuffer(1, pcm16Data.length, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        
        // Convert PCM16 to Float32 (-1 to 1 range)
        for (let i = 0; i < pcm16Data.length; i++) {
          channelData[i] = pcm16Data[i] / 32768.0;
        }
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        // Wait for the audio to finish playing
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start(0);
        });
      } catch (err) {
        console.error('Error decoding/playing audio chunk:', err);
      }
    }

    isPlayingRef.current = false;
  }, []);

  const playAudio = useCallback(async (audioData: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Queue the audio data
      audioBufferQueueRef.current.push(audioData);
      
      // If not already playing, start playing the queue
      if (!isPlayingRef.current) {
        await playAudioQueue();
      }
    } catch (err) {
      console.error('Error playing audio:', err);
    }
  }, [playAudioQueue]);

  const startVoiceChat = useCallback(async () => {
    try {
      setError(null);
      setIsConnecting(true);

      // Clear conversation when starting a new session
      setConversation([]);
      setTranscript('');

      if (!voiceServiceRef.current) {
        voiceServiceRef.current = new RealtimeVoiceService();
      }

      await voiceServiceRef.current.startSession({
        voiceMode,
        onAudioReceived: playAudio,
        onVoiceModeChange: (mode) => setVoiceMode(mode),
        onTranscriptReceived: (text: string, messageType?: 'user' | 'assistant') => {
          setTranscript(prev => prev + text);
          // Add to conversation based on message type
          if (messageType === 'user') {
            setConversation(prev => [...prev, {
              type: 'user',
              text: text.trim(),
              timestamp: new Date()
            }]);
          } else if (messageType === 'assistant') {
            setConversation(prev => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.type === 'assistant') {
                // Update existing assistant message
                return prev.map((msg, index) =>
                  index === prev.length - 1
                    ? { ...msg, text: msg.text + text }
                    : msg
                );
              } else {
                // Create new assistant message
                return [...prev, {
                  type: 'assistant',
                  text: text,
                  timestamp: new Date()
                }];
              }
            });
          }
        },
        onError: (err) => {
          setError(err.message);
          setIsConnected(false);
          setIsConnecting(false);
        },
        onConnectionStateChange: (state) => {
          switch (state) {
            case 'connecting':
              setIsConnecting(true);
              setIsConnected(false);
              break;
            case 'connected':
              setIsConnecting(false);
              setIsConnected(true);
              break;
            case 'disconnected':
            case 'error':
              setIsConnecting(false);
              setIsConnected(false);
              break;
          }
        }
      }, useCases);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start voice chat';
      setError(errorMessage);
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, [playAudio, useCases]);

  const stopVoiceChat = useCallback(() => {
    if (voiceServiceRef.current) {
      voiceServiceRef.current.stopSession();
      voiceServiceRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    audioBufferQueueRef.current = [];
    isPlayingRef.current = false;
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    // Clear any lingering voice UI state so nothing persists into text mode
    setTranscript('');
    setConversation([]);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setConversation([]);
  }, []);

  const switchVoiceMode = useCallback((mode: 'auto' | 'push-to-talk') => {
    setVoiceMode(mode);
    if (voiceServiceRef.current) {
      voiceServiceRef.current.switchVoiceMode(mode);
    }
  }, []);

  const setPushToTalkActive = useCallback((active: boolean) => {
    if (voiceServiceRef.current) {
      voiceServiceRef.current.setPushToTalkActive(active);
    }
  }, []);

  // Update noise level periodically
  React.useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      if (voiceServiceRef.current) {
        setNoiseLevel(voiceServiceRef.current.getCurrentNoiseLevel());
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    isConnecting,
    isConnected,
    transcript,
    conversation,
    error,
    voiceMode,
    noiseLevel,
    startVoiceChat,
    stopVoiceChat,
    clearTranscript,
    switchVoiceMode,
    setPushToTalkActive
  };
};