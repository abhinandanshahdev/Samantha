import React, { useState, useEffect } from 'react';
import { StrategicGoal, StrategicPillar, StrategicGoalsFilters, User } from '../../types';
import { strategicGoalsAPI, strategicPillarsAPI } from '../../services/apiService';
import Header from '../Header/Header';
import EmptyState from '../EmptyState/EmptyState';
import { FaArrowLeft, FaPlus, FaEye, FaEdit, FaTrash } from 'react-icons/fa';
import './StrategicGoalsDashboard.css';

interface StrategicGoalsDashboardProps {
  onCreateGoal: () => void;
  onEditGoal: (goal: StrategicGoal) => void;
  onGoalClick: (goal: StrategicGoal) => void;
  onBackToDashboard: () => void;
  user?: User;
}

const StrategicGoalsDashboard: React.FC<StrategicGoalsDashboardProps> = ({
  onCreateGoal,
  onEditGoal,
  onGoalClick,
  onBackToDashboard,
  user
}) => {
  const [goals, setGoals] = useState<StrategicGoal[]>([]);
  const [pillars, setPillars] = useState<StrategicPillar[]>([]);
  const [filters, setFilters] = useState<StrategicGoalsFilters>({});
  const [loading, setLoading] = useState(true);
  const [selectedPillar, setSelectedPillar] = useState<number | null>(null);

  // Load strategic goals and pillars
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [goalsData, pillarsData] = await Promise.all([
          strategicGoalsAPI.getAll(filters),
          strategicPillarsAPI.getAll()
        ]);
        setGoals(goalsData);
        setPillars(pillarsData);
      } catch (error) {
        console.error('Failed to load strategic goals:', error);
        setGoals([]);
        setPillars([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [filters]);

  const handleFilterChange = (newFilters: Partial<StrategicGoalsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handlePillarClick = (pillarId: number) => {
    if (selectedPillar === pillarId) {
      setSelectedPillar(null);
      handleFilterChange({ strategic_pillar_id: undefined });
    } else {
      setSelectedPillar(pillarId);
      handleFilterChange({ strategic_pillar_id: pillarId });
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (window.confirm('Are you sure you want to delete this strategic goal?')) {
      try {
        await strategicGoalsAPI.delete(goalId);
        setGoals(prev => prev.filter(goal => goal.id !== goalId));
      } catch (error) {
        console.error('Failed to delete strategic goal:', error);
        alert('Failed to delete strategic goal');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#00A79D'; // DoF Sea Green
      case 'completed': return '#B79546'; // DoF Gold
      case 'draft': return '#F6BD60'; // DoF Sunset Yellow
      case 'cancelled': return '#DC2626'; // DoF Error Red
      default: return '#77787B'; // DoF Metal Grey
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return '#DC2626'; // DoF Error Red
      case 'Medium': return '#C68D6D'; // DoF Earthy Brown
      case 'Low': return '#00A79D'; // DoF Sea Green
      default: return '#77787B'; // DoF Metal Grey
    }
  };

  const goalsByPillar = pillars.reduce((acc, pillar) => {
    acc[pillar.id] = goals.filter(goal => goal.strategic_pillar_id === pillar.id);
    return acc;
  }, {} as Record<number, StrategicGoal[]>);

  if (loading) {
    return (
      <div className="strategic-goals-dashboard">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading strategic goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="strategic-goals-dashboard">
      <Header 
        onSearch={() => {}} 
        onUserMenuClick={() => {}}
        user={user}
      />
      
      <div className="dashboard-content">
        <div className="page-header">
          <button className="back-button" onClick={onBackToDashboard}>
            <FaArrowLeft />
            Back to Dashboard
          </button>
        </div>

      <div className="dashboard-filters">
        <div className="filter-controls">
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange({ status: e.target.value || undefined })}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filters.priority || ''}
            onChange={(e) => handleFilterChange({ priority: e.target.value || undefined })}
          >
            <option value="">All Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Strategic Pillars Section */}
      <div className="strategic-pillars-section">
        <div className="strategic-pillars">
          <h2>Strategic Pillars</h2>
          <div className="pillars-grid">
            {pillars.map(pillar => {
              const pillarGoals = goalsByPillar[pillar.id] || [];
              const isSelected = selectedPillar === pillar.id;
              
              return (
                <div
                  key={pillar.id}
                  className={`pillar-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handlePillarClick(pillar.id)}
                >
                  <div className="pillar-header">
                    <h3>{pillar.name}</h3>
                    <span className="goal-count">{pillarGoals.length} goals</span>
                  </div>
                  <p className="pillar-description">{pillar.description}</p>
                  
                  <div className="pillar-stats">
                    <div className="stat">
                      <span className="stat-value">
                        {pillarGoals.filter(g => g.status === 'active').length}
                      </span>
                      <span className="stat-label">Active</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">
                        {pillarGoals.filter(g => g.status === 'completed').length}
                      </span>
                      <span className="stat-label">Completed</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">
                        {pillarGoals.filter(g => g.priority === 'High').length}
                      </span>
                      <span className="stat-label">High Priority</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Strategic Goals Section - Full Width */}
      <div className="goals-section">
        <h2>
          {selectedPillar 
            ? `Goals for ${pillars.find(p => p.id === selectedPillar)?.name}`
            : 'All Strategic Goals'
          }
        </h2>
        
        {goals.length === 0 ? (
          <EmptyState
            title="No Strategic Goals Yet"
            message={selectedPillar
              ? `No goals have been created for ${pillars.find(p => p.id === selectedPillar)?.name} yet. Strategic goals help align your initiatives with organizational objectives.`
              : "No strategic goals have been created yet. Strategic goals help align your initiatives with organizational objectives and measure success."
            }
            actionText={user?.role === 'admin' ? "Create First Goal" : undefined}
            onAction={user?.role === 'admin' ? onCreateGoal : undefined}
            showAction={user?.role === 'admin'}
            icon="add"
          />
        ) : (
          <div className="goals-grid">
            {goals.map(goal => (
              <div key={goal.id} className="goal-card">
                <div className="goal-header">
                  <h3 onClick={() => onGoalClick(goal)}>{goal.title}</h3>
                  <div className="goal-badges">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(goal.status) }}
                    >
                      {goal.status}
                    </span>
                    <span 
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(goal.priority) }}
                    >
                      {goal.priority}
                    </span>
                  </div>
                </div>

                <p className="goal-description">{goal.description}</p>
                
                <div className="goal-meta">
                  <span className="pillar-name">{goal.strategic_pillar_name}</span>
                  <div className="goal-metrics">
                    <span className="aligned-count">
                      {goal.aligned_use_cases_count || 0} aligned use cases
                    </span>
                    {goal.completion_percentage !== undefined && goal.completion_percentage !== null && (
                      <span className="completion-badge">
                        {goal.completion_percentage}% complete
                      </span>
                    )}
                  </div>
                </div>

                <div className="goal-actions">
                  <button 
                    className="btn-secondary"
                    onClick={() => onGoalClick(goal)}
                  >
                    <FaEye />
                    View Details
                  </button>
                  {user?.role === 'admin' && (
                    <>
                      <button 
                        className="btn-secondary"
                        onClick={() => onEditGoal(goal)}
                      >
                        <FaEdit />
                        Edit
                      </button>
                      <button 
                        className="btn-danger"
                        onClick={() => handleDeleteGoal(goal.id)}
                      >
                        <FaTrash />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            
            {/* Add button positioned at the end of the tiles */}
            {user?.role === 'admin' && (
              <div className="create-goal-card">
                <button className="btn-primary create-goal-btn" onClick={onCreateGoal}>
                  <FaPlus />
                  Create Strategic Goal
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default StrategicGoalsDashboard;