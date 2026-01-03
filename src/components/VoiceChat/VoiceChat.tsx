import React, { useEffect, useRef, useState } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaVolumeUp, FaCog, FaHandPaper } from 'react-icons/fa';
import { useVoiceChat } from '../../hooks/useVoiceChat';
import { UseCase } from '../../types';
import './VoiceChat.css';

interface VoiceChatProps {
  isVisible: boolean;
  onClose: () => void;
  useCases: UseCase[];
}

const VoiceChat: React.FC<VoiceChatProps> = ({ isVisible, onClose, useCases }) => {
  const conversationRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    isConnecting,
    isConnected,
    conversation,
    error,
    voiceMode,
    noiseLevel,
    startVoiceChat,
    stopVoiceChat,
    clearTranscript,
    switchVoiceMode,
    setPushToTalkActive
  } = useVoiceChat(useCases);

  const [isPushToTalkPressed, setIsPushToTalkPressed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Auto-scroll to latest message
  useEffect(() => {
    if (conversation.length > 0) {
      // Use setTimeout to ensure DOM is updated before scrolling
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'end' 
        });
      }, 100);
    }
  }, [conversation]);

  // Push-to-talk keyboard handlers
  useEffect(() => {
    if (voiceMode !== 'push-to-talk' || !isVisible) return;

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
  }, [voiceMode, isPushToTalkPressed, isVisible, setPushToTalkActive]);

  const handleToggleVoice = async () => {
    if (isConnected) {
      stopVoiceChat();
    } else {
      try {
        await startVoiceChat();
      } catch (err) {
        console.error('Failed to start voice chat:', err);
      }
    }
  };

  const handleClose = () => {
    if (isConnected) {
      stopVoiceChat();
    }
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="voice-chat-overlay">
      <div className="voice-chat-container">
        <div className="voice-chat-header">
          <div className="voice-chat-title">
            <FaVolumeUp className="voice-icon" />
            Voyagers - Voice Assistant
            {voiceMode === 'push-to-talk' && (
              <span className="voice-mode-badge">PTT</span>
            )}
          </div>
          <div className="header-controls">
            <button 
              className="settings-btn" 
              onClick={() => setShowSettings(!showSettings)}
              title="Voice Settings"
            >
              <FaCog />
            </button>
            <button className="voice-chat-close" onClick={handleClose}>
              ×
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="voice-settings">
            <div className="settings-section">
              <label>Voice Mode:</label>
              <div className="mode-buttons">
                <button 
                  className={`mode-btn ${voiceMode === 'auto' ? 'active' : ''}`}
                  onClick={() => switchVoiceMode('auto')}
                >
                  Auto
                </button>
                <button 
                  className={`mode-btn ${voiceMode === 'push-to-talk' ? 'active' : ''}`}
                  onClick={() => switchVoiceMode('push-to-talk')}
                >
                  <FaHandPaper /> Push to Talk
                </button>
              </div>
            </div>
            {voiceMode === 'auto' && (
              <div className="noise-indicator">
                <label>Noise Level:</label>
                <div className="noise-bar">
                  <div 
                    className="noise-level" 
                    style={{ width: `${Math.min(noiseLevel * 1000, 100)}%` }}
                  ></div>
                </div>
                <small>Threshold auto-adjusts based on environment</small>
              </div>
            )}
            {voiceMode === 'push-to-talk' && (
              <div className="ptt-info">
                <small>Hold SPACEBAR to talk</small>
              </div>
            )}
          </div>
        )}

        <div className="voice-chat-content">
          {error && (
            <div className="voice-chat-error">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="voice-chat-status">
            {isConnecting && (
              <div className="status-connecting">
                <div className="pulse-animation"></div>
                Connecting to voice service...
              </div>
            )}

            {isConnected && !isConnecting && (
              <div className="status-connected">
                <div className="recording-indicator"></div>
                {voiceMode === 'auto' ? 'Voice chat active - Speak naturally' :
                 isPushToTalkPressed ? 'Recording - Release SPACE to stop' : 'Push-to-talk ready - Hold SPACE to speak'}
              </div>
            )}

            {!isConnected && !isConnecting && !error && (
              <div className="status-disconnected">
                Click the microphone to start voice chat
              </div>
            )}
          </div>

          <div className="voice-chat-controls">
            <button
              className={`voice-toggle-btn ${isConnected ? 'active' : ''} ${isConnecting ? 'connecting' : ''}`}
              onClick={handleToggleVoice}
              disabled={isConnecting}
              title={isConnected ? 'Stop voice chat' : 'Start voice chat'}
            >
              {isConnecting ? (
                <div className="spinner"></div>
              ) : isConnected ? (
                <FaMicrophoneSlash />
              ) : (
                <FaMicrophone />
              )}
            </button>
            
            {conversation.length > 0 && (
              <button
                className="clear-transcript-btn"
                onClick={clearTranscript}
                title="Clear conversation"
              >
                Clear
              </button>
            )}
          </div>

          {conversation.length > 0 && (
            <div className="voice-chat-conversation" ref={conversationRef}>
              <div className="conversation-label">Conversation:</div>
              <div className="conversation-messages">
                {conversation.map((message, index) => (
                  <div key={index} className={`message ${message.type}`}>
                    <div className="message-content">
                      {message.text}
                    </div>
                    <div className="message-time">
                      {message.timestamp.toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {conversation.length === 0 && isConnected && (
            <div className="voice-chat-instructions">
              <p>🎙️ Voice assistant ready!</p>
              <p>Ask me about:</p>
              <ul>
                <li>Initiative priorities & recommendations</li>
                <li>Strategic alignments & impact</li>
                <li>Department initiatives</li>
                <li>Project status & feasibility</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceChat;