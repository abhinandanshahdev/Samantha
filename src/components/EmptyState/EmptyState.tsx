import React from 'react';
import { FaPlus, FaSearch, FaExclamationTriangle } from 'react-icons/fa';
import './EmptyState.css';

interface EmptyStateProps {
  title: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
  icon?: 'add' | 'search' | 'warning';
  showAction?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  actionText,
  onAction,
  icon = 'add',
  showAction = true
}) => {
  const getIcon = () => {
    switch (icon) {
      case 'search':
        return <FaSearch />;
      case 'warning':
        return <FaExclamationTriangle />;
      default:
        return <FaPlus />;
    }
  };

  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {getIcon()}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-message">{message}</p>
      {showAction && actionText && onAction && (
        <button className="empty-state-action" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;