import React, { useState, useEffect, useRef } from 'react';
import { FaBars, FaSearch, FaTimes } from 'react-icons/fa';
import { Sparkles } from 'lucide-react';
import { useDomain } from '../../context/DomainContext';
import './Header.css';

interface HeaderProps {
  onSearch?: (query: string) => void;
  onUserMenuClick: () => void;
  user?: {
    name: string;
    role: string;
  };
  onChatClick?: () => void;
  userRole?: string;
  initialSearchQuery?: string;
}

const Header: React.FC<HeaderProps> = ({ onSearch, onUserMenuClick, user, onChatClick, userRole, initialSearchQuery }) => {
  const { activeDomain } = useDomain();
  const [searchValue, setSearchValue] = useState(initialSearchQuery || '');
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Update search value when initialSearchQuery changes
  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchValue(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch?.(searchValue);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchValue(value);
    // Auto-search when input changes (including when cleared)
    onSearch?.(value);
  };

  const clearSearch = () => {
    setSearchValue('');
    onSearch?.('');
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to focus search
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear and blur search
      if (event.key === 'Escape' && searchFocused) {
        clearSearch();
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchFocused]);

  return (
    <header className="modern-header">
      <div className="header-container">
        {/* Burger Menu - Far Left */}
        <button 
          className="menu-trigger"
          onClick={onUserMenuClick}
          aria-label="Menu"
        >
          <FaBars />
        </button>

        {/* Logo & Brand - Aligned with content */}
        <div className="header-brand">
          <div className="brand-group">
            <img
              src="/logo-samantha.svg"
              alt="Voyagers"
              className="brand-logo"
            />
            <div className="brand-divider"></div>
            <div className="brand-name">
              <span className="brand-title">Voyagers</span>
              <span className="brand-subtitle">AI for the family</span>
            </div>
          </div>
        </div>

        {/* Center Section - Search or spacer to maintain layout */}
        <div className={`header-search ${searchFocused ? 'focused' : ''} ${mobileSearchOpen ? 'mobile-open' : ''}`}>
          {onSearch ? (
            <form onSubmit={handleSearch} className="search-container">
              <FaSearch className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Type to search..."
                className="search-field"
                value={searchValue}
                onChange={handleInputChange}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              {searchValue && (
                <button 
                  type="button"
                  className="search-clear"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  <FaTimes />
                </button>
              )}
              <div className="search-shortcut">
                <kbd>⌘K</kbd> or <kbd>Ctrl+K</kbd>
              </div>
            </form>
          ) : (
            <div className="header-spacer"></div>
          )}
        </div>

        {/* Right Section - Actions */}
        <div className="header-actions">
          {onSearch && (
            <button
              className="action-button mobile-search-trigger"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              aria-label="Search"
            >
              <FaSearch />
            </button>
          )}

          {/* AI Chat Button - only show for users with proper roles */}
          {onChatClick && (userRole === 'admin' || userRole === 'consumer') && (
            <button
              className="ai-chat-button"
              onClick={onChatClick}
              title="Voyagers assistant"
            >
              <Sparkles size={18} strokeWidth={1.5} />
            </button>
          )}

          {/* Mobile menu trigger - shows on right on mobile */}
          <button
            className="action-button mobile-menu-trigger"
            onClick={onUserMenuClick}
            aria-label="Menu"
          >
            <FaBars />
          </button>

          <div className="user-menu">
            {user ? (
              <div
                className="user-greeting-container"
                onClick={onUserMenuClick}
              >
                <span className="user-greeting">Hello, {user.name.split(' ')[0]}!</span>
                <span className="user-role-label">You are {user.role === 'admin' ? 'an admin' : 'a consumer'}</span>
              </div>
            ) : (
              <button
                className="login-button"
                onClick={onUserMenuClick}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Search Overlay */}
      {onSearch && mobileSearchOpen && (
        <div className="mobile-search-overlay">
          <form onSubmit={handleSearch} className="mobile-search-form">
            <input
              type="text"
              placeholder="Type to search..."
              className="mobile-search-input"
              value={searchValue}
              onChange={handleInputChange}
              autoFocus
            />
            <button 
              type="button"
              className="mobile-search-close"
              onClick={() => setMobileSearchOpen(false)}
            >
              <FaTimes />
            </button>
          </form>
        </div>
      )}
    </header>
  );
};

export default Header;