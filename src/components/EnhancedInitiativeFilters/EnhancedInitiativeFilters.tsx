import React, { useState, useEffect } from 'react';
import { SearchFilters, Category, Department, StrategicPillar, StrategicGoal } from '../../types';
import { categoryAPI, departmentAPI, strategicPillarsAPI, strategicGoalsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import { FaSearch, FaFilter, FaTimes } from 'react-icons/fa';
import './EnhancedInitiativeFilters.css';

interface EnhancedInitiativeFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  totalCount: number;
  filteredCount: number;
  isFiltered: boolean;
}

const EnhancedInitiativeFilters: React.FC<EnhancedInitiativeFiltersProps> = ({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
  isFiltered
}) => {
  const activeDomainId = useActiveDomainId();
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pillars, setPillars] = useState<StrategicPillar[]>([]);
  const [goals, setGoals] = useState<StrategicGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    const loadFilterData = async () => {
      try {
        setLoading(true);
        const [categoriesData, departmentsData, pillarsData, goalsData] = await Promise.all([
          categoryAPI.getAll(activeDomainId),
          departmentAPI.getAll(activeDomainId || undefined),
          strategicPillarsAPI.getAll(activeDomainId),
          strategicGoalsAPI.getAll(activeDomainId ? { domain_id: activeDomainId } : undefined)
        ]);

        setCategories(categoriesData);
        setDepartments(departmentsData);
        setPillars(pillarsData);
        setGoals(goalsData);
      } catch (error) {
        console.error('Failed to load filter data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFilterData();
  }, [activeDomainId]);

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    
    // Clear strategic goal filter if strategic pillar changes
    if (key === 'strategic_pillar_id' && value !== filters.strategic_pillar_id) {
      newFilters.strategic_goal_id = undefined;
    }
    
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange({});
    setShowAdvanced(false);
  };

  const hasActiveFilters = Object.keys(filters).some(key =>
    filters[key as keyof SearchFilters] !== undefined &&
    filters[key as keyof SearchFilters] !== ''
  );

  // Count active filters for mobile badge
  const activeFilterCount = Object.keys(filters).filter(key =>
    filters[key as keyof SearchFilters] !== undefined &&
    filters[key as keyof SearchFilters] !== ''
  ).length;

  // Filter goals based on selected pillar
  const filteredGoals = filters.strategic_pillar_id 
    ? goals.filter(goal => goal.strategic_pillar_id === filters.strategic_pillar_id)
    : goals;

  if (loading) {
    return <div className="enhanced-filters-loading">Loading filters...</div>;
  }

  return (
    <div className={`enhanced-use-case-filters ${filtersExpanded ? 'expanded' : ''}`}>
      {/* Mobile toggle header */}
      <div
        className="filter-toggle-mobile"
        onClick={() => setFiltersExpanded(!filtersExpanded)}
      >
        <div className="toggle-text">
          <FaFilter />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="active-filter-count">{activeFilterCount}</span>
          )}
        </div>
        <span className="toggle-icon">&#9660;</span>
      </div>

      {/* Filter content wrapper for mobile collapse */}
      <div className="filter-content-wrapper">
        {/* Results Summary */}
        <div className="results-summary">
        <div className="count-display">
          <span className="result-count">
            {isFiltered ? (
              <>
                <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> initiatives
              </>
            ) : (
              <>
                <strong>{totalCount}</strong> initiatives total
              </>
            )}
          </span>
          {isFiltered && (
            <button 
              className="clear-filters-btn"
              onClick={clearAllFilters}
            >
              <FaTimes /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters Toggle */}
      <div className="search-section">
        <button
          className={`advanced-toggle ${showAdvanced ? 'active' : ''}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <FaFilter /> Advanced Filters
        </button>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="advanced-filters">
          <div className="filter-row">
            <div className="filter-group">
              <label>Category</label>
              <select
                value={filters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              >
                <option value="">All Statuses</option>
                <option value="concept">Concept</option>
                <option value="proof_of_concept">Proof of Concept</option>
                <option value="validation">Validation</option>
                <option value="pilot">Pilot</option>
                <option value="production">Production</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Department</label>
              <select
                value={filters.department || ''}
                onChange={(e) => handleFilterChange('department', e.target.value || undefined)}
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Strategic Pillar</label>
              <select
                value={filters.strategic_pillar_id || ''}
                onChange={(e) => handleFilterChange('strategic_pillar_id', e.target.value ? parseInt(e.target.value) : undefined)}
              >
                <option value="">All Strategic Pillars</option>
                {pillars.map((pillar) => (
                  <option key={pillar.id} value={pillar.id}>
                    {pillar.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Strategic Goal</label>
              <select
                value={filters.strategic_goal_id || ''}
                onChange={(e) => handleFilterChange('strategic_goal_id', e.target.value || undefined)}
                disabled={!filters.strategic_pillar_id}
              >
                <option value="">
                  {filters.strategic_pillar_id ? 'All Goals for Selected Pillar' : 'Select Pillar First'}
                </option>
                {filteredGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Strategic Impact</label>
              <select
                value={filters.strategic_impact || ''}
                onChange={(e) => handleFilterChange('strategic_impact', e.target.value || undefined)}
              >
                <option value="">All Impact Levels</option>
                <option value="Low">Low Impact</option>
                <option value="Medium">Medium Impact</option>
                <option value="High">High Impact</option>
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Delivery Status</label>
              <select
                value={filters.kanban_pillar || ''}
                onChange={(e) => handleFilterChange('kanban_pillar', e.target.value || undefined)}
              >
                <option value="">All Statuses</option>
                <option value="backlog">Backlog</option>
                <option value="prioritised">Prioritised</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
                <option value="slow_burner">Slow Burner</option>
                <option value="de_prioritised">De-prioritised</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Expected Delivery Year</label>
              <select
                value={filters.expected_delivery_year || ''}
                onChange={(e) => handleFilterChange('expected_delivery_year', e.target.value ? parseInt(e.target.value) : undefined)}
              >
                <option value="">All Years</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Expected Delivery Month</label>
              <select
                value={filters.expected_delivery_month || ''}
                onChange={(e) => handleFilterChange('expected_delivery_month', e.target.value || undefined)}
              >
                <option value="">All Months</option>
                <option value="Jan">January</option>
                <option value="Feb">February</option>
                <option value="Mar">March</option>
                <option value="Apr">April</option>
                <option value="May">May</option>
                <option value="Jun">June</option>
                <option value="Jul">July</option>
                <option value="Aug">August</option>
                <option value="Sep">September</option>
                <option value="Oct">October</option>
                <option value="Nov">November</option>
                <option value="Dec">December</option>
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="filter-actions">
              <button
                className="clear-all-btn"
                onClick={clearAllFilters}
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active Filters Tags */}
      {hasActiveFilters && (
        <div className="active-filters">
          {filters.category && (
            <div className="filter-tag">
              <span>Category: {filters.category}</span>
              <button onClick={() => handleFilterChange('category', undefined)}>
                <FaTimes />
              </button>
            </div>
          )}
          
          {filters.status && (
            <div className="filter-tag">
              <span>Status: {filters.status.replace('_', ' ')}</span>
              <button onClick={() => handleFilterChange('status', undefined)}>
                <FaTimes />
              </button>
            </div>
          )}
          
          {filters.department && (
            <div className="filter-tag">
              <span>Department: {filters.department}</span>
              <button onClick={() => handleFilterChange('department', undefined)}>
                <FaTimes />
              </button>
            </div>
          )}
          
          {filters.strategic_pillar_id && (
            <div className="filter-tag">
              <span>Pillar: {pillars.find(p => p.id === filters.strategic_pillar_id)?.name}</span>
              <button onClick={() => handleFilterChange('strategic_pillar_id', undefined)}>
                <FaTimes />
              </button>
            </div>
          )}
          
          {filters.strategic_goal_id && (
            <div className="filter-tag">
              <span>Goal: {goals.find(g => g.id === filters.strategic_goal_id)?.title}</span>
              <button onClick={() => handleFilterChange('strategic_goal_id', undefined)}>
                <FaTimes />
              </button>
            </div>
          )}
        </div>
      )}
      </div>{/* End filter-content-wrapper */}
    </div>
  );
};

export default EnhancedInitiativeFilters;