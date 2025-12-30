import React from 'react';
import './LoadingAnimation.css';

interface LoadingAnimationProps {
  type?: 'cards' | 'list' | 'full';
  message?: string;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  type = 'cards',
  message = 'Loading...'
}) => {
  if (type === 'full') {
    return (
      <div className="loading-full">
        <div className="loading-spinner-large"></div>
        <p className="loading-message">{message}</p>
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="loading-list">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="loading-list-item skeleton">
            <div className="skeleton-avatar"></div>
            <div className="skeleton-content">
              <div className="skeleton-line skeleton-title"></div>
              <div className="skeleton-line skeleton-text"></div>
              <div className="skeleton-line skeleton-text short"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default: cards
  return (
    <div className="loading-cards">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="loading-card skeleton">
          <div className="skeleton-header">
            <div className="skeleton-badge"></div>
          </div>
          <div className="skeleton-line skeleton-title"></div>
          <div className="skeleton-line skeleton-text"></div>
          <div className="skeleton-line skeleton-text"></div>
          <div className="skeleton-line skeleton-text short"></div>
          <div className="skeleton-footer">
            <div className="skeleton-tag"></div>
            <div className="skeleton-tag"></div>
            <div className="skeleton-tag"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingAnimation;
