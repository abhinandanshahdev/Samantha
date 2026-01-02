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

      const usesMaturity = outcome.outcome_key === 'sustainability';

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

  // Convert index to letter (0 -> A, 1 -> B, etc.)
  const indexToLetter = (index: number) => String.fromCharCode(65 + index);

  // Calculate activity level for a specific pillar based on its goals
  const calculatePillarActivityLevel = (pillarId: number): 'low' | 'medium' | 'high' => {
    const goals = pillarGoals[pillarId] || [];
    let totalInitiatives = 0;
    let recentUpdates = 0;
    const now = new Date();

    goals.forEach(goal => {
      totalInitiatives += goal.alignedCount || 0;
      if (goal.updatedAt) {
        const updateDate = new Date(goal.updatedAt);
        const diffDays = Math.floor((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) recentUpdates++;
      }
    });

    // Determine activity level for this pillar
    if (recentUpdates >= 2 || totalInitiatives >= 5) return 'high';
    if (recentUpdates >= 1 || totalInitiatives >= 2) return 'medium';
    return 'low';
  };

  return (
    <div className="news-dashboard">
      {/* Masthead - Left Aligned */}
      <header className="news-masthead">
        <h1 className="news-masthead-title">{hero.title}</h1>
        {hero.subtitle && <p className="news-masthead-subtitle">{hero.subtitle}</p>}
      </header>

      {/* Outcomes Section */}
      {outcomes.length > 0 && (
        <section className="news-section">
          <h2 className="news-section-label">Key Outcomes</h2>
          <div className="news-outcomes">
            {outcomes.map((outcome, outcomeIndex) => {
              const isEditing = editingOutcome === outcome.id;
              const currentMaturity = isEditing && editValues?.maturity !== undefined ? editValues.maturity : outcome.maturity;
              const currentProgress = isEditing && editValues?.progress !== undefined ? editValues.progress : outcome.progress;
              const progress = currentMaturity ? Math.round((currentMaturity / 5) * 100) : currentProgress ?? 0;
              const usesMaturity = outcome.outcome_key === 'sustainability';

              return (
                <article key={outcome.outcome_key} className="news-outcome">
                  <span className="news-outcome-number">{outcomeIndex + 1}</span>
                  <div className="news-outcome-content">
                    <h3 className="news-outcome-title">{outcome.title}</h3>
                    {outcome.measure && (
                      <p className="news-outcome-measure">{outcome.measure}</p>
                    )}
                    {/* Progress Bar */}
                    <div className="news-progress-container">
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
                      ) : (
                        <>
                          <div className="news-progress-bar">
                            <div className="news-progress-fill" style={{ width: `${progress}%` }}></div>
                          </div>
                          <div className="news-progress-meta">
                            <span className="news-progress-label">
                              {usesMaturity ? `${currentMaturity}/5 Maturity` : `${progress}%`}
                            </span>
                            {userRole === 'admin' && (
                              <button className="news-btn-edit" onClick={() => handleEditOutcome(outcome.id!)}>
                                Edit
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Pillars as Sections with A, B, C labels */}
      {Array.isArray(dynamicPillars) && dynamicPillars.map((pillar, pillarIndex) => {
        const goals = pillarGoals[pillar.id] || [];
        if (goals.length === 0) return null;
        const activityLevel = calculatePillarActivityLevel(pillar.id);

        return (
          <section key={pillar.id} className="news-section news-pillar-section">
            <div className="news-pillar-header">
              <span className="news-pillar-label">{indexToLetter(pillarIndex)}</span>
              <div className="news-pillar-text">
                <div className="news-pillar-title-row">
                  <h2 className="news-section-title">{pillar.name}</h2>
                  <div className={`news-activity-bars news-activity-${activityLevel}`} title={`Activity: ${activityLevel}`}>
                    <span className="news-bar news-bar-1"></span>
                    <span className="news-bar news-bar-2"></span>
                    <span className="news-bar news-bar-3"></span>
                  </div>
                </div>
                {pillar.description && (
                  <p className="news-section-desc">{pillar.description}</p>
                )}
              </div>
            </div>
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
