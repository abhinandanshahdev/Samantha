import React, { useState, useEffect, useMemo } from 'react';
import { UseCase, SearchFilters } from '../../types';
import { useCaseAPI } from '../../services/apiService';
import { useAuth } from '../../context/AuthContext';
import { useActiveDomainId } from '../../context/DomainContext';
import Header from '../Header/Header';
import PrioritizationMatrix from '../PrioritizationMatrix/PrioritizationMatrix';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import EmptyState from '../EmptyState/EmptyState';
import VirtualizedInitiativeList from '../VirtualizedInitiativeList/VirtualizedInitiativeList';
import EnhancedInitiativeFilters from '../EnhancedInitiativeFilters/EnhancedInitiativeFilters';
import { emptyStateMessages } from '../../data/emptyStates';
import { FaThLarge, FaList, FaBullseye, FaPlus, FaComments, FaChartLine } from 'react-icons/fa';
import './Dashboard.css';

interface DashboardProps {
  onUseCaseClick: (useCase: UseCase) => void;
  onEditUseCase?: (useCase: UseCase) => void;
  onDeleteUseCase?: (id: string) => Promise<void>;
  onCreateClick: () => void;
  onCreateGoalClick: () => void;
  onStrategicGoalsClick: () => void;
  onUserMenuClick: () => void;
  user?: {
    name: string;
    role: string;
  };
}

const Dashboard: React.FC<DashboardProps> = ({
  onUseCaseClick,
  onEditUseCase,
  onDeleteUseCase,
  onCreateClick,
  onCreateGoalClick,
  onStrategicGoalsClick,
  onUserMenuClick,
  user
}) => {
  const activeDomainId = useActiveDomainId();
  const [filters, setFilters] = useState<SearchFilters>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'matrix'>('grid');
  const [showAIChat, setShowAIChat] = useState(false);
  const [stats, setStats] = useState<{
    total_count: number;
    status_breakdown: Record<string, number>;
    filtered: boolean
  }>({ total_count: 0, status_breakdown: {}, filtered: false });
  const [matrixUseCases, setMatrixUseCases] = useState<UseCase[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const { isAuthenticated } = useAuth();

  // Combine filters with active domain
  const filtersWithDomain = useMemo(() => {
    const combined = { ...filters };
    if (activeDomainId) {
      combined.domain_id = activeDomainId;
    }
    return combined;
  }, [filters, activeDomainId]);

  // Load initial stats
  useEffect(() => {
    const loadInitialStats = async () => {
      try {
        const initialStats = await useCaseAPI.getStats(filtersWithDomain);
        setStats(initialStats);
      } catch (error) {
        console.error('Failed to load initial stats:', error);
        // Set default stats to show the component
        setStats({ total_count: 0, status_breakdown: {}, filtered: false });
      }
    };

    loadInitialStats();
  }, [filtersWithDomain]);

  // Load matrix data when matrix view is selected
  useEffect(() => {
    const loadMatrixData = async () => {
      if (viewMode === 'matrix') {
        try {
          setLoadingMatrix(true);
          // Load up to 200 items for matrix view (performance limit)
          const matrixData = await useCaseAPI.getAll({ ...filtersWithDomain, limit: 200 });
          setMatrixUseCases(matrixData);
        } catch (error) {
          console.error('Failed to load matrix data:', error);
          setMatrixUseCases([]);
        } finally {
          setLoadingMatrix(false);
        }
      }
    };

    loadMatrixData();
  }, [viewMode, filtersWithDomain]);

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
  };

  const handleStatsUpdate = (newStats: { total_count: number; status_breakdown: Record<string, number>; filtered: boolean }) => {
    setStats(newStats);
  };

  const handleUseCaseClick = (useCase: UseCase) => {
    onUseCaseClick(useCase);
  };

  const handleUserMenuClick = () => {
    onUserMenuClick();
  };

  return (
    <div className="dashboard">
      <Header 
        onUserMenuClick={handleUserMenuClick}
        user={user}
      />
      
      <div className="dashboard-content">
        <div className="dashboard-main">
          {/* Enhanced Filters with Statistics */}
          <EnhancedInitiativeFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            totalCount={stats.total_count}
            filteredCount={stats.filtered ? (Object.keys(stats.status_breakdown).length > 0 ? Object.values(stats.status_breakdown).reduce((a, b) => a + b, 0) : 0) : stats.total_count}
            isFiltered={stats.filtered}
          />
          
          {/* View Controls */}
          <div className="dashboard-header">
            <div className="dashboard-controls">
              <div className="view-controls">
                <div className="view-toggle">
                  <button 
                    className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                  >
                    <FaThLarge />
                  </button>
                  <button 
                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="List view"
                  >
                    <FaList />
                  </button>
                  <button 
                    className={`view-toggle-btn ${viewMode === 'matrix' ? 'active' : ''}`}
                    onClick={() => setViewMode('matrix')}
                    title="Matrix view"
                  >
                    <FaChartLine />
                  </button>
                </div>
              </div>
              
              <div className="dashboard-actions">
                <button className="view-goals-button" onClick={onStrategicGoalsClick}>
                  <FaBullseye />
                  Strategic Goals
                </button>
                {user?.role === 'admin' && (
                  <>
                    <button className="create-goal-button" onClick={onCreateGoalClick}>
                      <FaPlus />
                      Add Strategic Goal
                    </button>
                    <button className="create-button" onClick={onCreateClick}>
                      <FaPlus />
                      Add Initiative
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Main Content Area */}
          {viewMode === 'matrix' ? (
            <div className="matrix-container-wrapper">
              {loadingMatrix ? (
                <div className="matrix-loading">Loading matrix data...</div>
              ) : (
                <PrioritizationMatrix
                  useCases={matrixUseCases}
                  onUseCaseClick={handleUseCaseClick}
                />
              )}
            </div>
          ) : (
            <VirtualizedInitiativeList
              filters={filters}
              onUseCaseClick={onUseCaseClick}
              onEditUseCase={onEditUseCase || (() => {})}
              onDeleteUseCase={onDeleteUseCase || (() => Promise.resolve())}
              user={user}
              onStatsUpdate={handleStatsUpdate}
            />
          )}
        </div>
      </div>
      
      {/* AI Chat Interface */}
      <ChatAssistant
        useCases={[]} // Will be loaded internally by the chat interface
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
      />
      
      {/* Floating AI Button */}
      <button
        className="ai-float-button"
        onClick={() => setShowAIChat(true)}
        title="Samantha Assistant"
      >
        <FaComments />
      </button>
    </div>
  );
};

export default Dashboard; 