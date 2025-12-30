import React, { useEffect, useRef, useState } from "react";
import { strategicPillarsAPI, strategicGoalsAPI, outcomesAPI } from "../../services/apiService";
import { useActiveDomainId, useDomain } from "../../context/DomainContext";
import type { StrategicPillar, StrategicGoal, Outcome } from "../../types";
import { motion } from "framer-motion";
import ChatAssistant from '../ChatAssistant/ChatAssistant';
import { FaComments } from 'react-icons/fa';
import hexagonSvg from "../../assets/hexagon.svg";
import "./ValueFlowDashboard.css";

/**
 * AI Value Flow – Single‑file React SPA visualization (WHITE BACKGROUND)
 *
 * Brand Guidelines (applied):
 * - Primary: Gold #B79546, Metal Grey #77787B (tints: 80/60/40/20)
 * - Secondary (internal only): Sea Green #00A79D, Earthy Brown #C68D6D, Sunset Yellow #F6BD60
 * - Gradient allowed for internal digital: Sea Green ↔ Sunset Yellow (used subtly)
 * - Typography: Helvetica LT Pro / Calibri fallback for UI; Markazi Text suggested for internal call‑outs
 * - Pattern: abstract hexagon in gold at ~20% opacity (expanded across viewport)
 *
 * Interaction & Motion:
 * - GOLD flow animates HERO → Outcomes → Pillars → Goals (top to bottom, continuous)
 * - Added Presentation Mode: pauses animation, thickens lines, boosts contrast
 * - Goals are numbered; each goal shows Initiatives count + chips
 */

// ——— Palette (Guideline‑driven) ———
const COLORS = {
  paper: "#ffffff",
  text: "#111827", // gray-900
  textMuted: "#4B5563", // gray-600
  border: "#E5E7EB", // gray-200
  gold: "#B79546", // PRIMARY
  metal: "#77787B", // PRIMARY neutral
  sea: "#77787B", // Changed from blue to grey
  earthy: "#77787B", // Changed to grey
  sunset: "#B79546", // Changed to gold
};

// ——— Data Model ———
// Legacy hardcoded data removed - now fully dynamic from database

// ——— Components ———
export default function ValueFlowDashboard({
  presentation = false,
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Node refs
  const heroRef = useRef<HTMLDivElement | null>(null);
  const outcomeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pillarRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const goalRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [edges, setEdges] = useState<
    { id: string; d: string; kind: "goal-pillar" | "pillar-outcome" | "outcome-hero" }[]
  >([]);

  // presentation mode now controlled by parent

  // Dynamic pillars from database
  const [dynamicPillars, setDynamicPillars] = useState<StrategicPillar[]>([]);
  const [pillarGoals, setPillarGoals] = useState<Record<number, { label: string; alignedCount: number; completionPercentage?: number }[]>>({});

  // Database outcomes state
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [editingOutcome, setEditingOutcome] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Outcome>>({});

  // Compute hero from domain
  const hero = {
    id: "hero",
    title: activeDomain?.hero_message || activeDomain?.name || "Strategic Excellence",
    subtitle: activeDomain?.subtitle || "Unified, measurable North Star",
  };

  // Fetch outcomes from database filtered by active domain
  useEffect(() => {
    (async () => {
      try {
        const dbOutcomes = await outcomesAPI.getAll(activeDomainId);
        if (dbOutcomes && dbOutcomes.length > 0) {
          setOutcomes(dbOutcomes.sort((a, b) => a.display_order - b.display_order));
        }
      } catch (err) {
        console.warn("Failed to load outcomes from database, using defaults", err);
      }
    })();
  }, [activeDomainId]);

  // Load pillars and their goals from database
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const pillars: StrategicPillar[] = await strategicPillarsAPI.getAll(activeDomainId);
        if (!mounted) return;
        setDynamicPillars(Array.isArray(pillars) ? pillars : []);

        // Load goals for each pillar
        const goalEntries = await Promise.all(
          pillars.map(async (pillar) => {
            const goals = await strategicGoalsAPI.getAll({
              strategic_pillar_id: pillar.id,
              domain_id: activeDomainId
            });
            // Take top 4 goals, map to display format
            const top = goals.slice(0, 4).map(g => ({
              label: g.title,
              alignedCount: g.aligned_use_cases_count || 0,
              completionPercentage: g.completion_percentage
            }));
            return [pillar.id, top] as const;
          })
        );

        if (!mounted) return;
        const goalMap: Record<number, { label: string; alignedCount: number; completionPercentage?: number }[]> = {};
        goalEntries.forEach(([id, list]) => { goalMap[id] = list; });
        setPillarGoals(goalMap);
      } catch (err) {
        console.warn("Failed to load pillars and goals", err);
      }
    })();
    return () => { mounted = false; };
  }, [activeDomainId]);

  // Outcome edit handlers
  const handleEditOutcome = (outcomeId: number) => {
    const outcome = outcomes.find(o => o.id === outcomeId);
    if (outcome) {
      setEditingOutcome(outcomeId);
      setEditValues({
        progress: outcome.progress,
        maturity: outcome.maturity
      });
    }
  };

  const handleSaveOutcome = async (outcomeId: number) => {
    try {
      const outcome = outcomes.find(o => o.id === outcomeId);
      if (!outcome) return;
      
      // Determine if this outcome uses maturity scoring (only sustainability)
      const usesMaturity = outcome.outcome_key === 'sustainability';
      
      if (usesMaturity) {
        // Maturity-based outcome (1-5 scale)
        const maturity = Number(editValues.maturity) || 1;
        if (maturity < 1 || maturity > 5) {
          alert("Maturity must be between 1 and 5");
          return;
        }
        console.log("Saving maturity outcome:", { outcomeId, maturity });
        const updated = await outcomesAPI.updateProgress(outcomeId, 0, maturity);
        setOutcomes(prev => prev.map(o => o.id === outcomeId ? updated : o));
      } else {
        // Progress-based outcome (0-100 percentage)
        const progress = Number(editValues.progress) || 0;
        if (progress < 0 || progress > 100) {
          alert("Progress must be between 0 and 100");
          return;
        }
        console.log("Saving progress outcome:", { outcomeId, progress });
        const updated = await outcomesAPI.updateProgress(outcomeId, progress, undefined);
        setOutcomes(prev => prev.map(o => o.id === outcomeId ? updated : o));
      }
      
      setEditingOutcome(null);
      setEditValues({});
    } catch (err: any) {
      console.error("Failed to update outcome", err);
      console.error("Error details:", err.response?.data);
      alert(`Failed to update outcome: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingOutcome(null);
    setEditValues({});
  };

  // Build edges after layout (and on resize)
  useEffect(() => {
    let raf: number | null = null;
    const build = () => {
      const box = contentRef.current?.getBoundingClientRect();
      if (!box) return;
      const EDGE_PADDING = 14; // keep paths outside card boxes
      const centerOf = (el: HTMLElement | null) => {
        if (!el) return { x: 0, y: 0, w: 0, h: 0 };
        const r = el.getBoundingClientRect();
        return {
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top,
          w: r.width,
          h: r.height,
        };
      };

      const hero = centerOf(heroRef.current);
      const heroBottomY = hero.y + hero.h + 8; // connect slightly below HERO for better curve

      const outcomeMap: Record<string, { top: { x: number; y: number }; bottom: { x: number; y: number } }> = {};
      outcomes.forEach((o) => {
        const ref = outcomeRefs.current[o.outcome_key];
        const { x, y, h } = centerOf(ref!);
        // Nudge endpoints outside the outcome card bounds
        outcomeMap[o.outcome_key] = { top: { x, y: y - 10 }, bottom: { x, y: y + h + EDGE_PADDING } };
      });

      const pillarMap: Record<number, { top: { x: number; y: number }; bottom: { x: number; y: number } }> = {};
      dynamicPillars.forEach((p) => {
        const ref = pillarRefs.current[p.id];
        const { x, y, h } = centerOf(ref!);
        pillarMap[p.id] = { top: { x, y }, bottom: { x, y: y + h } };
      });

      const newEdges: { id: string; d: string; kind: "goal-pillar" | "pillar-outcome" | "outcome-hero" }[] = [];

      // Goals → Pillar
      dynamicPillars.forEach((p) => {
        const parent = pillarMap[p.id];
        const goals = pillarGoals[p.id] || [];
        goals.forEach((_, idx) => {
          const key = `${p.id}-goal-${idx}`;
          const ref = goalRefs.current[key];
          if (!ref || !parent) return;
          const g = centerOf(ref);
          newEdges.push({ id: `gp-${key}`, d: vCurvePath(g.x, g.y + EDGE_PADDING, parent.top.x, parent.top.y - EDGE_PADDING), kind: "goal-pillar" });
        });
      });

      // Pillar → Outcome (1-to-1 mapping: first pillar to first outcome, second to second, etc.)
      dynamicPillars.forEach((pillar, pillarIndex) => {
        const p = pillarMap[pillar.id];
        if (!p) return;

        // Map each pillar to its corresponding outcome by index
        const correspondingOutcome = outcomes[pillarIndex];
        if (!correspondingOutcome) return;

        const o = outcomeMap[correspondingOutcome.outcome_key];
        if (!o) return;

        newEdges.push({
          id: `po-${pillar.id}`,
          d: vCurvePath(p.top.x, p.top.y - EDGE_PADDING, o.bottom.x, o.bottom.y),
          kind: "pillar-outcome"
        });
      });

      // Outcome → HERO (to bottom center of HERO)
      Object.entries(outcomeMap).forEach(([oid, o]) => {
        newEdges.push({ id: `oh-${oid}`, d: vCurvePath(o.top.x, o.top.y, hero.x, heroBottomY), kind: "outcome-hero" });
      });

      setEdges(newEdges);
    };

    // defer to next frame to ensure DOM laid out
    raf = requestAnimationFrame(build);

    const ro = new ResizeObserver(() => build());
    if (contentRef.current) ro.observe(contentRef.current);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [outcomes, dynamicPillars, pillarGoals]);

  // ——— Render ———
  return (
    <div
      ref={containerRef}
      className="ai-value-flow-container"
      style={{ 
        background: COLORS.paper, 
        color: COLORS.text, 
        fontFamily: "Helvetica, Calibri, Arial, sans-serif"
      }}
    >
      {/* Subtle golden hex field across viewport (lowest layer) */}
      <HexField />

      <div className="ai-value-flow-content" ref={contentRef}>
        {/* Toggle moved to context menu in header */}
        
        {/* Pending User Message */}
        {(!userRole || (userRole !== 'admin' && userRole !== 'consumer')) && (
          <div style={{
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '0 0 24px 0',
            fontSize: '14px',
            color: '#92400E'
          }}>
            <strong>Limited Access:</strong> You currently have view-only access to the dashboard. 
            Please contact the <strong>Data & AI team</strong> to request proper permissions for full feature access.
          </div>
        )}

        {/* HERO Goal - Dynamic from domain */}
        <section className="ai-value-flow-hero-section">
          <motion.div
            ref={heroRef}
            className="ai-value-flow-hero-card"
            initial={{ y: 8 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="ai-value-flow-hero-title" style={{ color: COLORS.text }}>{hero.title}</h2>
            <p className="ai-value-flow-hero-subtitle" style={{ color: COLORS.textMuted }}>{hero.subtitle}</p>
            <div
              className="ai-value-flow-hero-gradient"
              style={{
                background: "linear-gradient(90deg, #E6C76B, #B79546)",
                opacity: 0.8,
              }}
            />
          </motion.div>
        </section>

        {/* Outcomes (with teal numeric labels 1–3) */}
        <section className="ai-value-flow-outcomes">
          {outcomes.map((o, idx) => (
            <OutcomeCard 
              key={o.outcome_key} 
              outcome={o} 
              ordinal={idx + 1} 
              index={idx} 
              refCb={(el) => { outcomeRefs.current[o.outcome_key] = el; }}
              isEditing={editingOutcome === o.id}
              editValues={editingOutcome === o.id ? editValues : undefined}
              onEdit={() => handleEditOutcome(o.id!)}
              onSave={() => handleSaveOutcome(o.id!)}
              onCancel={handleCancelEdit}
              onValueChange={(field, value) => setEditValues(prev => ({ ...prev, [field]: value }))}
              userRole={userRole}
            />
          ))}
        </section>

        {/* Pillars & Goals - Dynamic from database */}
        <section className="ai-value-flow-pillars">
          {Array.isArray(dynamicPillars) && dynamicPillars.map((p) => {
            const goals = pillarGoals[p.id] || [];
            return (
              <div
                key={p.id}
                ref={(el) => { pillarRefs.current[p.id] = el; }}
                className="ai-value-flow-pillar-card"
              >
                <div className="ai-value-flow-pillar-header">
                  <h3 className="ai-value-flow-pillar-title" style={{ color: COLORS.text }}>{p.name}</h3>
                </div>

                <div className="ai-value-flow-goals">
                  {goals.map((g, idx) => {
                    const initiativesCount = g.alignedCount ?? 0;
                    return (
                      <motion.div
                        key={`${p.id}-goal-${idx}`}
                        ref={(el: HTMLDivElement | null) => { goalRefs.current[`${p.id}-goal-${idx}`] = el; }}
                        className="ai-value-flow-goal-card"
                        initial={{ y: 8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.05 * idx }}
                      >
                        <div className="ai-value-flow-goal-header">
                          <div className="ai-value-flow-goal-content" style={{ color: COLORS.text }}>
                            {g.label}
                          </div>
                          {/* Show completion hexagon in completion mode */}
                          {goalDisplayMode === 'completion' && g.completionPercentage !== undefined && g.completionPercentage !== null && (
                            <CompletionHexagon percentage={g.completionPercentage} />
                          )}
                          {/* Show initiatives hexagon button only in initiatives mode */}
                          {goalDisplayMode === 'initiatives' && (
                            <HexagonButton
                              count={initiativesCount}
                              onClick={() => {
                                if (onNavigateToInitiatives) {
                                  onNavigateToInitiatives(p.id, g.label, idx);
                                }
                              }}
                            />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* SVG Flow Layer hidden when presentation (hide animation) is true */}
        {!presentation && (
          <svg className="ai-value-flow-svg" aria-hidden>
            {edges.map((e) => (
              <ValuePath key={e.id} idStr={e.id} d={e.d} animate={true} presentation={false} />
            ))}
          </svg>
        )}
      </div>

      {/* AI Chat Interface - only show for users with proper roles */}
      {(userRole === 'admin' || userRole === 'consumer') && (
        <ChatAssistant
          useCases={[]} // Dashboard doesn't have use cases, but component expects it
          isOpen={showAIChat}
          onClose={onCloseChatClick || (() => {})}
        />
      )}
    </div>
  );
}

// ——— Helpers ———
function vCurvePath(x1: number, y1: number, x2: number, y2: number) {
  const midY = (y1 + y2) / 2;
  const controlOffset = Math.abs(y2 - y1) * 0.4; // Make curves more pronounced
  return `M ${x1} ${y1} C ${x1} ${y1 + controlOffset}, ${x2} ${y2 - controlOffset}, ${x2} ${y2}`;
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="ai-value-flow-legend-swatch">
      <span className="ai-value-flow-legend-color" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}

function OutcomeCard({ 
  outcome, 
  ordinal, 
  index, 
  refCb, 
  isEditing = false,
  editValues,
  onEdit,
  onSave,
  onCancel,
  onValueChange,
  userRole
}: { 
  outcome: Outcome; 
  ordinal: number; 
  index: number; 
  refCb: (el: HTMLDivElement | null) => void;
  isEditing?: boolean;
  editValues?: Partial<Outcome>;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onValueChange?: (field: string, value: any) => void;
  userRole?: string;
}) {
  const track = "#F3F4F6"; // gray-100
  const currentMaturity = isEditing && editValues?.maturity !== undefined ? editValues.maturity : outcome.maturity;
  const currentProgress = isEditing && editValues?.progress !== undefined ? editValues.progress : outcome.progress;
  const progress = currentMaturity ? Math.round((currentMaturity / 5) * 100) : currentProgress ?? 0;
  
  const label = currentMaturity ? (
    isEditing ? (
      <div className="ai-value-flow-outcome-label-center">
        <input 
          type="number" 
          min="1" 
          max="5"
          value={editValues?.maturity || 1}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1 && value <= 5) {
              onValueChange?.('maturity', value);
            }
          }}
          style={{ width: '40px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <div className="ai-value-flow-outcome-maturity-text" style={{ color: COLORS.textMuted }}>/5 Maturity</div>
      </div>
    ) : (
      <div className="ai-value-flow-outcome-label-center">
        <div className="ai-value-flow-outcome-maturity" style={{ color: COLORS.text }}>{currentMaturity}/5</div>
        <div className="ai-value-flow-outcome-maturity-text" style={{ color: COLORS.textMuted }}>Maturity</div>
      </div>
    )
  ) : (
    isEditing ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input 
          type="number" 
          min="0" 
          max="100"
          value={editValues?.progress || 0}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 0 && value <= 100) {
              onValueChange?.('progress', value);
            }
          }}
          style={{ width: '50px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <span>%</span>
      </div>
    ) : (
      <div className="ai-value-flow-outcome-progress" style={{ color: COLORS.text }}>{progress}%</div>
    )
  );
  return (
    <motion.div
      ref={refCb}
      className="ai-value-flow-outcome-card"
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.1 * index }}
    >
      {/* Removed grey hexagon */}
      {/* Teal ordinal label */}
      <div className="ai-value-flow-outcome-ordinal" style={{ background: COLORS.metal, color: "white" }}>
        {ordinal}
      </div>
      <div className="ai-value-flow-outcome-header">
        <h4 className="ai-value-flow-outcome-title" style={{ color: COLORS.text }}>{outcome.title}</h4>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isEditing ? (
            <>
              <button
                onClick={onSave}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: COLORS.gold,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
              <button
                onClick={onCancel}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: COLORS.metal,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {userRole === 'admin' && (
                <button
                  onClick={onEdit}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    background: 'transparent',
                    color: COLORS.metal,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="ai-value-flow-outcome-content">
        <Ring size={84} thickness={11} value={progress} color={COLORS.metal} track={track} label={label} />
        <p className="ai-value-flow-outcome-measure" style={{ color: COLORS.textMuted }}>{outcome.measure}</p>
      </div>
    </motion.div>
  );
}

function Ring({ size = 88, thickness = 10, value = 50, track, color, label }:{ size?: number; thickness?: number; value?: number; track?: string; color?: string; label?: React.ReactNode; }) {
  // Detect dark mode
  const isDarkMode = document.body.classList.contains('dark-mode');

  // In dark mode, always use soft purple theme colors (override any passed colors)
  // In light mode, use passed colors or default to gold theme
  const ringColor = isDarkMode ? '#C4B5FD' : (color || COLORS.gold);
  const trackColor = isDarkMode ? '#3D3856' : (track || '#F3F4F6');
  const innerBg = isDarkMode ? '#1F1E30' : COLORS.paper;
  const innerText = isDarkMode ? '#EDECF3' : COLORS.text;
  const shadowColor = isDarkMode ? 'rgba(157, 122, 234, 0.3)' : 'rgba(183, 149, 70, 0.25)';

  // Ensure perfect circle by using fixed aspect ratio
  const actualSize = size;
  const style: React.CSSProperties = {
    width: actualSize,
    height: actualSize,
    minWidth: actualSize,
    minHeight: actualSize,
    maxWidth: actualSize,
    maxHeight: actualSize,
    background: `conic-gradient(${ringColor} ${value * 3.6}deg, ${trackColor} 0deg)`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: `drop-shadow(0 0 0.25rem ${shadowColor})`,
    flexShrink: 0,
  };
  const inner: React.CSSProperties = {
    width: actualSize - thickness * 2,
    height: actualSize - thickness * 2,
    background: innerBg,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: innerText,
    fontWeight: 700,
  };
  return (
    <div style={style}>
      <div style={inner}>{label ?? `${value}%`}</div>
    </div>
  );
}

function ValuePath({ idStr, d, animate, presentation }: { idStr: string; d: string; animate: boolean; presentation: boolean }) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!pathRef.current) return;
    const L = pathRef.current.getTotalLength();

    let raf: number;
    let t = 1; // Start at 1 to flow from hero (top) to goals (bottom)
    const speed = 0.35; // Subtle speed

    const step = (ts: number) => {
      if (!pathRef.current) return;
      if (!animate) {
        // Freeze at 50% in presentation mode
        const p = pathRef.current.getPointAtLength(L * 0.5);
        setPos({ x: p.x, y: p.y });
        return; // stop animating
      }
      t = (t - speed / 60); // Subtract to go backwards (hero to goals)
      if (t < 0) t = 1; // Reset to start when reaching the end
      const p = pathRef.current.getPointAtLength(L * t);
      setPos({ x: p.x, y: p.y });
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [d, animate]);

  return (
    <g>
      {/* Animated dashed path - subtle, no glow */}
      <motion.path
        ref={pathRef}
        id={idStr}
        d={d}
        fill="none"
        stroke={COLORS.gold}
        strokeWidth={presentation ? 3 : 1.5}
        strokeOpacity={presentation ? 1 : 0.6}
        strokeDasharray="8 8"
        animate={animate ? { strokeDashoffset: [0, 32] } : { strokeDashoffset: 0 }}
        transition={animate ? { repeat: Infinity, duration: 2, ease: "linear" } : undefined}
      />
      {/* Traveling dot - subtle, no glow */}
      <circle cx={pos.x} cy={pos.y} r={presentation ? 4 : 3} fill={COLORS.gold} opacity={0.7} />
    </g>
  );
}

function HeroHexBackdrop() {
  // Complete hexagon design using all key paths from branded SVG
  return (
    <svg 
      className="ai-value-flow-hex-backdrop" 
      viewBox="0 0 1125 1535" 
      aria-hidden
      style={{ 
        width: '12rem', // Made bigger
        height: '12rem',
        opacity: 0.7,
        transform: 'translateX(1rem)'
      }}
    >
      {/* Layer 1: Base hexagon structure */}
      <path fill="#B79546" d="M189 1008L192 1008C193.473 999.995 186.401 992.153 183.337 985C177.498 971.367 174.224 955.518 171.119 941C168.262 927.644 165.266 914.221 161.866 901.015C160.641 896.259 158.493 891.849 157.514 887C156.846 883.691 157.253 880.296 156.545 877C146.635 830.87 136.039 785.008 125.464 738.985C122.953 728.057 121.57 716.918 118.87 706C116.323 695.701 114.144 685.261 111.522 675C108.939 664.895 105.868 654.558 106.019 644C106.349 620.725 122.642 595.367 141 582C138.47 614.057 143.792 646.115 146.83 678L158.17 798C160.127 818.556 163 839.331 163 860C163.683 858.494 163.826 857.685 164 856L167 858C168.186 853.987 167.64 850.098 168.209 846C169.528 836.506 169.778 827.642 170.015 818C170.291 806.727 171.544 795.308 172.039 784C172.855 765.371 172.785 746.612 174.09 728C175.363 709.825 177.911 691.28 177.999 673C178.063 659.701 177.436 646.285 178.039 633C178.27 627.915 179.935 623.126 179.996 618C180.161 604.236 178.477 588.393 181.924 575C184.647 564.418 188.575 554.628 195.478 546C209.99 527.862 235.14 516.705 254.91 505.23C303.328 477.128 350.879 446.424 397.576 415.573C410.349 407.133 423.085 398.669 436 390.471C447.752 383.011 459.779 375.725 474 374.129C490.857 372.238 505.108 381.202 519 389.127C530.128 395.476 541.559 401.437 553 407.198C569.548 415.532 585.505 425.228 602 433.741C639.609 453.153 677.385 472.239 715 491.641C743.251 506.214 772.161 516.509 786.891 547C795.701 565.237 794.742 585.323 796.089 605C798.026 633.271 798.721 661.69 799.961 690C800.456 701.305 799.316 712.71 800.089 724C802.578 760.338 801.631 797.644 800.039 834C799.647 842.956 800.722 852.075 799.829 861C798.182 877.481 790.267 893.944 778.924 905.961C769.017 916.456 756.555 922.553 744 929.295C731.271 936.13 718.548 943.25 706 950.427C658.937 977.348 612.483 1005.34 567.001 1034.86C542.659 1050.66 515.148 1077.06 484 1074.91C468.257 1073.83 455.021 1066.45 441 1060.03C414.228 1047.77 387.701 1034.98 361 1022.51C350.422 1017.57 340.071 1010.77 329 1007.01C326.294 1006.09 320.212 1003.48 317.478 1004.65C313.699 1006.28 318.501 1010.22 320.045 1011.3C327.079 1016.25 334.795 1020.28 342.039 1024.91C363.028 1038.33 383.906 1051.85 404.925 1065.23C413.671 1070.79 422.277 1078.32 432 1082C425.753 1083.35 418.275 1080.84 412 1079.75C396.582 1077.07 381.373 1073.38 366 1070.58C359.38 1069.37 352.762 1066.92 346 1068L346 1071C351.326 1073.07 356.491 1075.7 362 1077.25C368.181 1079 374.865 1079.73 380.91 1081.68C403.315 1088.9 425.517 1096.68 448 1103.65C459.17 1107.12 470.888 1109.75 481.91 1113.67C500.41 1120.26 519.594 1128.76 539 1132.62C559.476 1136.69 582.802 1136.32 602.83 1129.92C622.113 1123.77 637.519 1111.73 652.039 1098.17C666.183 1084.96 679.905 1071.35 693.08 1057.17C710.705 1038.19 729.148 1019.97 746.826 1001.04C772.69 973.342 796.987 944.28 822.134 915.961C846.258 888.794 874.103 859.295 876.91 821C877.715 810.02 877.714 797.802 875.487 787C871.666 768.47 863.516 750.889 857.597 733C843.871 691.509 831.195 649.87 818.77 608C809.542 576.901 800.55 545.447 792.579 514C785.518 486.137 779.207 460.017 758.116 438.884C731.059 411.775 693.369 404.663 658 394.124C597.183 376.002 536.147 359.352 475 342.406C453.567 336.466 431.043 328.45 409 325.3C387.488 322.226 363.061 325.135 343.001 333.286C315.896 344.3 296.275 366.725 276 387C242.659 420.341 210.044 454.502 177.91 489C156.71 511.761 135.265 534.249 114.344 557.255C94.6121 578.953 75.1588 599.714 67.76 629C56.1504 674.954 77.742 721.138 94.1752 763C113.782 812.947 132.546 863.527 151.088 914C159.093 935.792 165.564 958.443 174.181 980C178.171 989.98 183.812 998.681 189 1008z"/>
      
      {/* Layer 2: Inner detail structure */}
      <path fill="#C8A876" d="M243 474C248.752 471.581 253.777 467.543 259.09 464.28C269.811 457.695 280.353 450.837 291.09 444.281C321.562 425.673 352.384 407.712 383.001 389.374C392.246 383.837 401.643 378.602 410.91 373.091C419.112 368.214 427.763 362.642 437 360C429.845 356.168 420.846 355.032 413 353.13C400.552 350.111 386.864 347.09 374 349.329C353.76 352.852 340.653 365.176 327.196 379.576C315.367 392.233 304.354 405.648 292.536 418.286C281.841 429.723 271.576 441.533 260.924 453.014C255.034 459.363 246.65 466.172 243 474z"/>
      
      {/* Layer 3: Additional hexagon elements */}
      <path fill="#D4B885" d="M381 324C386.959 326.5 395.564 325 402 325C396.041 322.5 387.436 324 381 324z"/>
      
      {/* Layer 4: Light accent paths */}
      <path fill="#E8D6A8" d="M332 338C333.809 338.574 334.069 338.465 336 338C334.341 337.594 333.758 337.691 332 338z"/>
      <path fill="#E8D6A8" d="M320 345C321.809 345.574 322.069 345.465 324 345C322.341 344.594 321.758 344.691 320 345z"/>
      <path fill="#E8D6A8" d="M491 346C492.75 347.255 493.858 347.614 496 348C494.249 346.745 493.143 346.386 491 346z"/>
      <path fill="#E8D6A8" d="M379 348C382.959 349.661 387.737 349 392 349C388.041 347.339 383.263 348 379 348z"/>
      
      {/* Layer 5: Mid-tone detail paths */}
      <path fill="#C8A876" d="M396 349C398.886 350.535 401.748 350.858 405 351C402.114 349.465 399.252 349.142 396 349z"/>
      <path fill="#C8A876" d="M429 357C431.283 358.222 433.428 358.652 436 359C433.686 357.409 431.81 357.143 429 357z"/>
      <path fill="#C8A876" d="M470 374C476.232 376.615 486.104 376.124 493 377C486.782 372.728 477.231 374 470 374z"/>
      
      {/* Layer 6: Completing structural elements */}
      <path fill="#B79546" d="M288 445C289.809 445.574 290.069 445.465 292 445C290.341 444.594 289.758 444.691 288 445z"/>
      <path fill="#B79546" d="M280 450C281.809 450.574 282.069 450.465 284 450C282.341 449.594 281.758 449.691 280 450z"/>
    </svg>
  );
}

function CardHexInset({ color = COLORS.gold }: { color?: string }) {
  // Only show golden hexagons for now
  if (color !== COLORS.gold) return null;
  
  return (
    <div className="ai-value-flow-hex-inset" aria-hidden>
      <img 
        src={hexagonSvg} 
        alt="" 
        style={{ 
          width: '100%', 
          height: '100%',
          opacity: 0.5,
          filter: 'hue-rotate(30deg) saturate(2) brightness(0.5) contrast(1.5)'
        }} 
      />
    </div>
  );
}

function HexagonButton({ count, onClick }: { count: number; onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        margin: 0,
        outline: 'none',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent'
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 100 100"
        style={{
          filter: isHovered ? 'drop-shadow(0 2px 4px rgba(119,120,123,0.4))' : 'drop-shadow(0 1px 2px rgba(119,120,123,0.2))',
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          display: 'block'
        }}
      >
        <defs>
          <linearGradient id={`hexGradient-${count}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.gold}>
              <animate attributeName="stop-color" values={`${COLORS.gold};${COLORS.metal};${COLORS.gold}`} dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor={COLORS.metal}>
              <animate attributeName="stop-color" values={`${COLORS.metal};${COLORS.gold};${COLORS.metal}`} dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={COLORS.gold}>
              <animate attributeName="stop-color" values={`${COLORS.gold};${COLORS.metal};${COLORS.gold}`} dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
        <defs>
          <mask id={`hexMask-${count}`}>
            <polygon
              points="50,8 85,29 85,71 50,92 15,71 15,29"
              fill="white"
            />
          </mask>
        </defs>
        <polygon
          points="50,8 85,29 85,71 50,92 15,71 15,29"
          fill={`url(#hexGradient-${count})`}
          stroke="none"
          opacity="0.7"
        />
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontSize="32"
          fontWeight="900"
          fill="white"
        >
          {count}
        </text>
      </svg>
    </button>
  );
}

function CompletionHexagon({ percentage }: { percentage: number }) {
  return (
    <div
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent'
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 100 100"
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(119,120,123,0.2))',
          display: 'block'
        }}
      >
        <defs>
          <linearGradient id={`completionGradient-${percentage}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.gold}>
              <animate attributeName="stop-color" values={`${COLORS.gold};${COLORS.metal};${COLORS.gold}`} dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor={COLORS.metal}>
              <animate attributeName="stop-color" values={`${COLORS.metal};${COLORS.gold};${COLORS.metal}`} dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={COLORS.gold}>
              <animate attributeName="stop-color" values={`${COLORS.gold};${COLORS.metal};${COLORS.gold}`} dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
        <polygon
          points="50,8 85,29 85,71 50,92 15,71 15,29"
          fill={`url(#completionGradient-${percentage})`}
          stroke="none"
          opacity="0.7"
        />
        <text
          x="50"
          y="58"
          textAnchor="middle"
          fontSize={percentage === 100 ? "20" : "24"}
          fontWeight="900"
          fill="white"
        >
          {percentage}%
        </text>
      </svg>
    </div>
  );
}

function HexField() {
  // Temporarily disabled background hexagons to focus on hero hexagon
  return null;
}