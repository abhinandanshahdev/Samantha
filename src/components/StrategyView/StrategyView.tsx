import React, { useState, useEffect } from 'react';
import { StrategicGoal, StrategicPillar, StrategicGoalsFilters, User } from '../../types';
import { strategicGoalsAPI, strategicPillarsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import { FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import LoadingAnimation from '../LoadingAnimation/LoadingAnimation';
import './StrategyView.css';

interface StrategyViewProps {
  onCreateGoal: () => void;
  onEditGoal: (goal: StrategicGoal) => void;
  onGoalClick: (goal: StrategicGoal) => void;
  onBackToDashboard: () => void;
  user?: User;
  showAIChat?: boolean;
  onCloseChatClick?: () => void;
}

const StrategyView: React.FC<StrategyViewProps> = ({
  onCreateGoal,
  onEditGoal,
  onGoalClick,
  onBackToDashboard,
  user,
  showAIChat = false,
  onCloseChatClick
}) => {
  const activeDomainId = useActiveDomainId();
  const [goals, setGoals] = useState<StrategicGoal[]>([]);
  const [pillars, setPillars] = useState<StrategicPillar[]>([]);
  const [filters, setFilters] = useState<StrategicGoalsFilters>({});
  const [loading, setLoading] = useState(true);
  const [selectedPillars, setSelectedPillars] = useState<number[]>([]);

  // Load strategic goals and pillars filtered by active domain
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [goalsData, pillarsData] = await Promise.all([
          strategicGoalsAPI.getAll({ domain_id: activeDomainId }),
          strategicPillarsAPI.getAll(activeDomainId)
        ]);
        setGoals(goalsData);
        setAllGoals(goalsData);
        setPillars(pillarsData);
      } catch (error) {
        console.error('Failed to load strategic goals:', error);
        setGoals([]);
        setAllGoals([]);
        setPillars([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeDomainId]);

  const handleFilterChange = (newFilters: Partial<StrategicGoalsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handlePillarToggle = (pillarId: number) => {
    const newSelectedPillars = selectedPillars.includes(pillarId)
      ? selectedPillars.filter(id => id !== pillarId)
      : [...selectedPillars, pillarId];

    setSelectedPillars(newSelectedPillars);

    // Filter goals based on selected pillars
    if (newSelectedPillars.length > 0) {
      const filteredGoals = allGoals.filter(goal =>
        newSelectedPillars.includes(goal.strategic_pillar_id)
      );
      setGoals(filteredGoals);
    } else {
      // If no pillars selected, show all goals
      setGoals(allGoals);
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

  // Calculate goals by pillar from ALL goals (not filtered)
  const [allGoals, setAllGoals] = useState<StrategicGoal[]>([]);
  
  const goalsByPillar = pillars.reduce((acc, pillar) => {
    acc[pillar.id] = allGoals.filter(goal => goal.strategic_pillar_id === pillar.id);
    return acc;
  }, {} as Record<number, StrategicGoal[]>);

  if (loading) {
    return (
      <div className="strategic-goals-dashboard">
        <LoadingAnimation type="cards" message="Loading strategic goals..." />
      </div>
    );
  }

  return (
    <div className="strategic-goals-dashboard">
      <div className="dashboard-content">

      {/* Strategic Pillars Section */}
      <div className="strategic-pillars-section">
        <div className="filter-title-container">
          <h2 className="section-title">Implementation Pillars</h2>
        </div>
        <div className="strategic-pillars">
          <div className="pillars-grid">
            {pillars.map(pillar => {
              const pillarGoals = goalsByPillar[pillar.id] || [];
              const isSelected = selectedPillars.includes(pillar.id);

              return (
                <label
                  key={pillar.id}
                  className="pillar-card"
                  data-description={pillar.description}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handlePillarToggle(pillar.id)}
                  />
                  <span className="pillar-checkbox"></span>
                  <div className="pillar-header">
                    <h3>{pillar.name}</h3>
                    <span className="goal-count">{pillarGoals.length} goals</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Create Goal Button */}
        {user?.role === 'admin' && (
          <button className="btn-primary create-goal-btn-sidebar" onClick={onCreateGoal}>
            <FaPlus />
            Create Strategic Goal
          </button>
        )}
      </div>

      {/* Strategic Goals Section - Full Width */}
      <div className="goals-section">
        <div className="goals-title-container">
          <h2 className="section-title">
            {selectedPillars.length > 0
              ? selectedPillars.length === 1
                ? `Goals for ${pillars.find(p => p.id === selectedPillars[0])?.name}`
                : `Strategic Goals (${selectedPillars.length} pillars selected)`
              : 'Strategic Goals'
            }
          </h2>
        </div>

        {goals.length === 0 ? (
          <div className="empty-state">
            <p>No strategic goals found.</p>
          </div>
        ) : (
          <div className="goals-grid">
            {goals.map(goal => (
              <div key={goal.id} className="goal-card">
                <div className="goal-header">
                  <div className="goal-title-section">
                    <h3 className="goal-title">{goal.title}</h3>
                  </div>
                  
                  {user?.role === 'admin' && (
                    <div className="goal-actions-menu">
                      <button 
                        className="action-btn edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditGoal(goal);
                        }}
                        title="Edit goal"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        className="action-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGoal(goal.id);
                        }}
                        title="Delete goal"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  )}
                </div>

                <p className="goal-description">{goal.description}</p>
                
                <div className="goal-footer">
                  <div className="initiatives-count">
                    <span className="count-number">{goal.aligned_use_cases_count || 0}</span>
                    <span className="count-label">Aligned Initiatives</span>
                  </div>
                </div>
                
                <span 
                  className="pillar-badge"
                  data-pillar={goal.strategic_pillar_name}
                >
                  {goal.strategic_pillar_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* AI Chat Interface */}
      {(user?.role === 'admin' || user?.role === 'consumer') && (
        <ChatAssistant
          useCases={[]}
          isOpen={showAIChat}
          onClose={onCloseChatClick || (() => {})}
        />
      )}
    </div>
  );
};

export default StrategyView;