import React, { useEffect, useState } from "react";
import { strategicPillarsAPI, strategicGoalsAPI, outcomesAPI } from "../../services/apiService";
import { useActiveDomainId, useDomain } from "../../context/DomainContext";
import type { StrategicPillar, Outcome } from "../../types";
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import "./ValueFlowDashboard.css";

/**
 * ValueFlowDashboard - Newspaper/Magazine-style layout
 * Clean typography-focused design with snippets
 */

export default function ValueFlowDashboard({
  userRole,
  showAIChat = false,
  onCloseChatClick,
  onNavigateToInitiatives,
  goalDisplayMode = 'initiatives'
}: {
  presentation?: boolean;
  userRole?: string;
  showAIChat?: boolean;
  onCloseChatClick?: () => void;
  onNavigateToInitiatives?: (pillarId: number, goalLabel: string, goalIndex: number) => void;
  goalDisplayMode?: 'completion' | 'initiatives';
}) {
  const activeDomainId = useActiveDomainId();
  const { activeDomain } = useDomain();

  const [dynamicPillars, setDynamicPillars] = useState<StrategicPillar[]>([]);
  const [pillarGoals, setPillarGoals] = useState<Record<number, { label: string; alignedCount: number; completionPercentage?: number; updatedAt?: string }[]>>({});
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [editingOutcome, setEditingOutcome] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Outcome>>({});

  const hero = {
    title: activeDomain?.hero_message || activeDomain?.name || "Family Goals",
    subtitle: activeDomain?.subtitle || activeDomain?.name || "",
  };

  // Fetch outcomes
  useEffect(() => {
    (async () => {
      try {
        const dbOutcomes = await outcomesAPI.getAll(activeDomainId);
        if (dbOutcomes && dbOutcomes.length > 0) {
          setOutcomes(dbOutcomes.sort((a, b) => a.display_order - b.display_order));
        }
      } catch (err) {
        console.warn("Failed to load outcomes", err);
      }
    })();
  }, [activeDomainId]);

  // Load pillars and goals
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const pillars: StrategicPillar[] = await strategicPillarsAPI.getAll(activeDomainId);
        if (!mounted) return;
        setDynamicPillars(Array.isArray(pillars) ? pillars : []);

        const goalEntries = await Promise.all(
          pillars.map(async (pillar) => {
            const goals = await strategicGoalsAPI.getAll({
              strategic_pillar_id: pillar.id,
              domain_id: activeDomainId
            });
            const top = goals.slice(0, 4).map(g => ({
              label: g.title,
              alignedCount: g.aligned_use_cases_count || 0,
              completionPercentage: g.completion_percentage,
              updatedAt: g.updated_date || g.created_date
            }));
            return [pillar.id, top] as const;
          })
        );

        if (!mounted) return;
        const goalMap: Record<number, { label: string; alignedCount: number; completionPercentage?: number; updatedAt?: string }[]> = {};
        goalEntries.forEach(([id, list]) => { goalMap[id] = list; });
        setPillarGoals(goalMap);
      } catch (err) {
        console.warn("Failed to load pillars and goals", err);
      }
    })();
    return () => { mounted = false; };
  }, [activeDomainId]);

  const handleEditOutcome = (outcomeId: number) => {
    const outcome = outcomes.find(o => o.id === outcomeId);
    if (outcome) {
      setEditingOutcome(outcomeId);
      setEditValues({ progress: outcome.progress, maturity: outcome.maturity });
    }
  };

  const handleSaveOutcome = async (outcomeId: number) => {
    try {
      const outcome = outcomes.find(o => o.id === outcomeId);
      if (!outcome) return;

      // Use maturity scale if outcome has maturity value, otherwise use percentage
      const usesMaturity = outcome.maturity !== null && outcome.maturity !== undefined;

      if (usesMaturity) {
        const maturity = Number(editValues.maturity) || 1;
        if (maturity < 1 || maturity > 5) {
          alert("Maturity must be between 1 and 5");
          return;
        }
        const updated = await outcomesAPI.updateProgress(outcomeId, 0, maturity);
        setOutcomes(prev => prev.map(o => o.id === outcomeId ? updated : o));
      } else {
        const progress = Number(editValues.progress) || 0;
        if (progress < 0 || progress > 100) {
          alert("Progress must be between 0 and 100");
          return;
        }
        const updated = await outcomesAPI.updateProgress(outcomeId, progress, undefined);
        setOutcomes(prev => prev.map(o => o.id === outcomeId ? updated : o));
      }

      setEditingOutcome(null);
      setEditValues({});
    } catch (err: any) {
      console.error("Failed to update outcome", err);
      alert(`Failed to update outcome: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingOutcome(null);
    setEditValues({});
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };


  // Render outcome KPI visual
  const renderOutcomeKPI = (outcome: Outcome, outcomeIndex: number) => {
    const isEditing = editingOutcome === outcome.id;
    const currentMaturity = isEditing && editValues?.maturity !== undefined ? editValues.maturity : outcome.maturity;
    const currentProgress = isEditing && editValues?.progress !== undefined ? editValues.progress : outcome.progress;
    const progress = currentMaturity ? Math.round((currentMaturity / 5) * 100) : currentProgress ?? 0;
    const usesMaturity = outcome.maturity !== null && outcome.maturity !== undefined;

    return (
      <div className="news-outcome-inline" key={outcome.outcome_key}>
        <div className="news-outcome-header">
          <span className="news-outcome-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill="currentColor" opacity="0.15"/>
              <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </span>
          <div className="news-outcome-info">
            <span className="news-outcome-label">Key Outcome</span>
            <h3 className="news-outcome-title-inline">{outcome.title}</h3>
            {outcome.measure && (
              <p className="news-outcome-measure">{outcome.measure}</p>
            )}
          </div>
        </div>
        <div className="news-outcome-kpi">
          {isEditing ? (
            <div className="news-outcome-edit">
              <input
                type="number"
                min={usesMaturity ? 1 : 0}
                max={usesMaturity ? 5 : 100}
                value={usesMaturity ? (editValues?.maturity || 1) : (editValues?.progress || 0)}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (usesMaturity) {
                    if (!isNaN(value) && value >= 1 && value <= 5) {
                      setEditValues(prev => ({ ...prev, maturity: value }));
                    }
                  } else {
                    if (!isNaN(value) && value >= 0 && value <= 100) {
                      setEditValues(prev => ({ ...prev, progress: value }));
                    }
                  }
                }}
                className="news-input"
              />
              <span className="news-input-label">{usesMaturity ? '/5' : '%'}</span>
              <button className="news-btn-save" onClick={() => handleSaveOutcome(outcome.id!)}>Save</button>
              <button className="news-btn-cancel" onClick={handleCancelEdit}>Cancel</button>
            </div>
          ) : usesMaturity ? (
            <div className="news-maturity-container">
              <div className="news-maturity-dots">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className={`news-maturity-dot ${level <= (currentMaturity || 0) ? 'filled' : ''}`}
                  />
                ))}
              </div>
              <div className="news-maturity-meta">
                <span className="news-maturity-label">Level {currentMaturity}/5</span>
                {userRole === 'admin' && (
                  <button className="news-btn-edit" onClick={() => handleEditOutcome(outcome.id!)}>Edit</button>
                )}
              </div>
            </div>
          ) : (
            <div className="news-progress-container">
              <div className="news-progress-bar">
                <div className="news-progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="news-progress-meta">
                <span className="news-progress-label">{progress}%</span>
                {userRole === 'admin' && (
                  <button className="news-btn-edit" onClick={() => handleEditOutcome(outcome.id!)}>Edit</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="news-dashboard">
      {/* Masthead - Left Aligned */}
      <header className="news-masthead">
        <h1 className="news-masthead-title">{hero.title}</h1>
        {hero.subtitle && <p className="news-masthead-subtitle">{hero.subtitle}</p>}
      </header>

      {/* Combined Outcome + Pillar Sections */}
      {Array.isArray(dynamicPillars) && dynamicPillars.map((pillar, pillarIndex) => {
        const goals = pillarGoals[pillar.id] || [];
        if (goals.length === 0) return null;
        // Match outcome by index (outcome 1 -> pillar A, outcome 2 -> pillar B, etc.)
        const pairedOutcome = outcomes[pillarIndex];

        return (
          <section key={pillar.id} className="news-section news-combined-section">
            {/* Paired Outcome KPI */}
            {pairedOutcome && renderOutcomeKPI(pairedOutcome, pillarIndex)}

            {/* Pillar Header */}
            <div className="news-pillar-header">
              <span className="news-pillar-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M6 3H13V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <div className="news-pillar-text">
                <span className="news-pillar-type-label">Strategic Action</span>
                <h2 className="news-section-title">{pillar.name}</h2>
                {pillar.description && (
                  <p className="news-section-desc">{pillar.description}</p>
                )}
              </div>
            </div>

            {/* Goals Grid */}
            <div className="news-goals">
              {goals.map((goal, idx) => {
                const showCompletion = goalDisplayMode === 'completion' && goal.completionPercentage !== undefined;
                const initiativesCount = goal.alignedCount ?? 0;

                return (
                  <article
                    key={`${pillar.id}-goal-${idx}`}
                    className="news-goal"
                    onClick={() => onNavigateToInitiatives?.(pillar.id, goal.label, idx)}
                  >
                    <span className="news-goal-number">{idx + 1}</span>
                    <div className="news-goal-content">
                      <h4 className="news-goal-title">{goal.label}</h4>
                      <div className="news-goal-footer">
                        <span className="news-goal-stat">
                          {showCompletion
                            ? `${goal.completionPercentage}% complete`
                            : `${initiativesCount} ${initiativesCount === 1 ? 'initiative' : 'initiatives'}`
                          }
                        </span>
                        {goal.updatedAt && (
                          <span className="news-goal-date">{formatDate(goal.updatedAt)}</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* AI Chat */}
      {(userRole === 'admin' || userRole === 'consumer') && (
        <ChatAssistant
          useCases={[]}
          isOpen={showAIChat}
          onClose={onCloseChatClick || (() => {})}
        />
      )}
    </div>
  );
}
