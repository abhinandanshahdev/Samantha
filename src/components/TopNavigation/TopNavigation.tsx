import React from 'react';
import './TopNavigation.css';

interface NavigationItem {
  id: string;
  label: string;
  view: string;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'value-dashboard', label: 'Family Goals', view: 'value_dashboard' },
  { id: 'strategy', label: 'Strategy (Pillars and Goals)', view: 'strategic_goals' },
  { id: 'initiatives', label: 'Initiatives', view: 'dashboard' }
];

interface TopNavigationProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const TopNavigation: React.FC<TopNavigationProps> = ({ currentView, onNavigate }) => {
  const isActive = (view: string) => {
    return currentView === view;
  };

  const handleNavigation = (view: string) => {
    onNavigate(view);
  };

  return (
    <nav className="top-navigation">
      <div className="top-navigation-container">
        <div className="top-navigation-items">
          {NAVIGATION_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`top-navigation-item ${isActive(item.view) ? 'active' : ''}`}
              onClick={() => handleNavigation(item.view)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default TopNavigation;