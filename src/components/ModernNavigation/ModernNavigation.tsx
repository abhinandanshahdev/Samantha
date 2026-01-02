import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import './ModernNavigation.css';

interface NavigationItem {
  id: string;
  label: string;
  view: string;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'value-dashboard', label: 'Family Goals', view: 'value_dashboard' },
  { id: 'initiatives', label: 'Initiatives', view: 'dashboard' },
  { id: 'tasks', label: 'Tasks', view: 'tasks' },
  { id: 'kanban', label: 'Kanban', view: 'roadmap' },
  { id: 'roadmap-timeline', label: 'Roadmap', view: 'roadmap_timeline' }
];

interface ModernNavigationProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onTogglePresentation?: () => void;
  presentation?: boolean;
  userRole?: string;
}

const ModernNavigation: React.FC<ModernNavigationProps> = ({ currentView, onNavigate, onTogglePresentation, presentation, userRole }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isActive = (view: string) => {
    return currentView === view;
  };

  const handleNavigation = (view: string) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  // Filter navigation items based on user role
  const getVisibleItems = () => {
    // Users without proper roles (null/undefined) can only see Dashboard
    if (!userRole || (userRole !== 'admin' && userRole !== 'consumer')) {
      return NAVIGATION_ITEMS.filter(item => item.view === 'value_dashboard');
    }
    // Admin and consumer users see all tabs
    return NAVIGATION_ITEMS;
  };

  const visibleItems = getVisibleItems();

  // Get current view label for mobile header
  const currentViewLabel = NAVIGATION_ITEMS.find(item => item.view === currentView)?.label || 'Dashboard';

  return (
    <nav className="modern-navigation">
      <div className="modern-navigation-container">
        {/* Mobile tab toggle with chevron */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          <span className="mobile-current-view">{currentViewLabel}</span>
          {mobileMenuOpen ? <FaChevronUp className="toggle-chevron" /> : <FaChevronDown className="toggle-chevron" />}
        </button>

        {/* Desktop navigation items */}
        <div className={`modern-navigation-items ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          {visibleItems.map((item) => (
            <button
              key={item.id}
              className={`modern-navigation-item ${isActive(item.view) ? 'active' : ''}`}
              onClick={() => handleNavigation(item.view)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div
            className="mobile-menu-overlay"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </div>
    </nav>
  );
};

export default ModernNavigation;