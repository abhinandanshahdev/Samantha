import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Category, SearchFilters, StrategicPillar, StrategicGoal, TaskFilters, UseCase, Task, KanbanStatus } from '../../types';
import { strategicPillarsAPI, strategicGoalsAPI, tagsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import { FaChevronDown, FaTimes, FaFilter, FaSearch } from 'react-icons/fa';
import './FilterPanel.css';

interface FilterPanelProps {
  categories?: Category[];
  filters: SearchFilters | TaskFilters;
  onFiltersChange: (filters: SearchFilters | TaskFilters) => void;
  onClearFilters?: () => void;
  showTaskFilter?: boolean;
  hideKanbanStatus?: boolean;
  hideDeliveryDateFilters?: boolean;
  initiatives?: UseCase[]; // Initiatives for task filter (filtered by other criteria)
  tasks?: Task[]; // Tasks for counting linked initiatives
  sortBy?: 'created' | 'updated';
  onSortChange?: (sort: 'created' | 'updated') => void;
}

const FILTER_STORAGE_KEY = 'samantha_filter_preferences';

const FilterPanel: React.FC<FilterPanelProps> = ({
  categories = [],
  filters,
  onFiltersChange,
  onClearFilters,
  showTaskFilter = false,
  hideKanbanStatus = false,
  hideDeliveryDateFilters = false,
  initiatives = [],
  tasks = [],
  sortBy,
  onSortChange
}) => {
  const activeDomainId = useActiveDomainId();
  const [strategicPillars, setStrategicPillars] = useState<StrategicPillar[]>([]);
  const [strategicGoals, setStrategicGoals] = useState<StrategicGoal[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [initiativeSearch, setInitiativeSearch] = useState('');
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Sort initiatives by task_count descending (task_count comes from backend)
  const initiativesSorted = useMemo(() => {
    return [...initiatives].sort((a, b) => (b.task_count || 0) - (a.task_count || 0));
  }, [initiatives]);

  // Filter initiatives by search term
  const filteredInitiatives = useMemo(() => {
    if (!initiativeSearch.trim()) return initiativesSorted;
    const search = initiativeSearch.toLowerCase();
    return initiativesSorted.filter(init =>
      init.title.toLowerCase().includes(search)
    );
  }, [initiativesSorted, initiativeSearch]);

  // Load strategic pillars, goals, and tags (filtered by domain)
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        const [fetchedPillars, fetchedGoals, fetchedTags] = await Promise.all([
          strategicPillarsAPI.getAll(activeDomainId),
          strategicGoalsAPI.getAll(activeDomainId ? { domain_id: activeDomainId } : undefined),
          tagsAPI.getAll()
        ]);

        setStrategicPillars(fetchedPillars);
        setStrategicGoals(fetchedGoals);

        // Extract tag names from fetched tags
        const tagNames = fetchedTags.map(tag => tag.name);
        setAvailableTags(tagNames);
      } catch (error) {
        console.error('Failed to load filter data:', error);
      }
    };

    loadFilterData();
  }, [activeDomainId]);

  // Note: Removed localStorage loading to prevent infinite re-render loop
  // Parent component should handle initial filter state if needed

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (filters && Object.keys(filters).length > 0) {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    }
  }, [filters]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && dropdownRefs.current[openDropdown]) {
        const dropdownEl = dropdownRefs.current[openDropdown];
        if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const handleCategoryToggle = (categoryName: string) => {
    const searchFilters = filters as SearchFilters;
    const currentCategories = searchFilters.categories || [];
    const newCategories = currentCategories.includes(categoryName)
      ? currentCategories.filter((c: string) => c !== categoryName)
      : [...currentCategories, categoryName];

    onFiltersChange({
      ...filters,
      categories: newCategories.length > 0 ? newCategories : undefined,
      category: undefined // Clear legacy single-select
    } as SearchFilters);
  };

  const handleStatusToggle = (statusValue: string) => {
    const currentStatuses = filters.statuses || [];
    const typedStatusValue = statusValue as KanbanStatus;
    const newStatuses = currentStatuses.includes(typedStatusValue)
      ? currentStatuses.filter(s => s !== typedStatusValue)
      : [...currentStatuses, typedStatusValue];

    onFiltersChange({
      ...filters,
      statuses: newStatuses.length > 0 ? newStatuses : undefined,
      status: undefined // Clear legacy single-select
    });
  };

  const handleInitiativeToggle = (initiativeId: string) => {
    const taskFilters = filters as TaskFilters;
    const currentInitiatives = taskFilters.initiative_ids || [];
    const newInitiatives = currentInitiatives.includes(initiativeId)
      ? currentInitiatives.filter(id => id !== initiativeId)
      : [...currentInitiatives, initiativeId];

    onFiltersChange({
      ...filters,
      initiative_ids: newInitiatives.length > 0 ? newInitiatives : undefined
    } as TaskFilters);
  };

  const handleTagToggle = (tagName: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter(t => t !== tagName)
      : [...currentTags, tagName];

    onFiltersChange({
      ...filters,
      tags: newTags.length > 0 ? newTags : undefined
    });
  };

  const handleClearAll = () => {
    localStorage.removeItem(FILTER_STORAGE_KEY);
    onClearFilters?.();
    setOpenDropdown(null);
  };

  const removeFilter = (type: string, value: string) => {
    switch(type) {
      case 'category':
        handleCategoryToggle(value);
        break;
      case 'status':
        handleStatusToggle(value);
        break;
      case 'tag':
        handleTagToggle(value);
        break;
    }
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    const searchFilters = filters as SearchFilters;
    const taskFilters = filters as TaskFilters;

    if (searchFilters.categories && searchFilters.categories.length > 0) count += searchFilters.categories.length;
    if (filters.statuses && filters.statuses.length > 0) count += filters.statuses.length;
    if (searchFilters.tags && searchFilters.tags.length > 0) count += searchFilters.tags.length;
    if (searchFilters.strategic_pillars && searchFilters.strategic_pillars.length > 0) count += searchFilters.strategic_pillars.length;
    if (searchFilters.strategic_goals && searchFilters.strategic_goals.length > 0) count += searchFilters.strategic_goals.length;
    if (!hideDeliveryDateFilters && filters.expected_delivery_year) count++;
    if (!hideDeliveryDateFilters && filters.expected_delivery_month) count++;
    if (taskFilters.initiative_ids && taskFilters.initiative_ids.length > 0) count += taskFilters.initiative_ids.length;
    // Legacy support
    if (searchFilters.category) count++;
    if (filters.status) count++;
    if (searchFilters.strategic_pillar_id) count++;
    if (searchFilters.strategic_goal_id) count++;
    return count;
  };

  const statuses: { value: KanbanStatus; label: string; color: string }[] = [
    { value: 'intention', label: 'Intention', color: '#77787B' },
    { value: 'experimentation', label: 'Experimentation', color: '#9B59B6' },
    { value: 'commitment', label: 'Commitment', color: '#C68D6D' },
    { value: 'implementation', label: 'Implementation', color: '#4A90E2' },
    { value: 'integration', label: 'Integration', color: '#00A79D' },
    { value: 'blocked', label: 'Blocked', color: '#E74C3C' },
    { value: 'slow_burner', label: 'Slow Burner', color: '#F59E0B' },
    { value: 'de_prioritised', label: 'De-prioritised', color: '#9e9e9e' },
    { value: 'on_hold', label: 'On Hold', color: '#6366F1' }
  ];

  const toggleDropdown = (dropdown: string) => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  const handleStrategicPillarToggle = (pillarId: number) => {
    const searchFilters = filters as SearchFilters;
    const currentPillars = searchFilters.strategic_pillars || [];
    const newPillars = currentPillars.includes(pillarId)
      ? currentPillars.filter((p: number) => p !== pillarId)
      : [...currentPillars, pillarId];
    onFiltersChange({
      ...filters,
      strategic_pillars: newPillars.length > 0 ? newPillars : undefined,
      strategic_pillar_id: undefined, // Clear legacy single-select
      strategic_goals: undefined, // Clear goals when pillar changes
      strategic_goal_id: undefined
    } as SearchFilters);
  };

  const handleStrategicGoalToggle = (goalId: string) => {
    const searchFilters = filters as SearchFilters;
    const currentGoals = searchFilters.strategic_goals || [];
    const newGoals = currentGoals.includes(goalId)
      ? currentGoals.filter((g: string) => g !== goalId)
      : [...currentGoals, goalId];
    onFiltersChange({
      ...filters,
      strategic_goals: newGoals.length > 0 ? newGoals : undefined,
      strategic_goal_id: undefined // Clear legacy single-select
    } as SearchFilters);
  };

  return (
    <div className={`filter-panel-modern ${mobileExpanded ? 'mobile-expanded' : ''}`}>
      {/* Mobile toggle header */}
      <div
        className="filter-mobile-toggle"
        onClick={() => setMobileExpanded(!mobileExpanded)}
      >
        <div className="filter-toggle-content">
          <FaFilter className="filter-icon" />
          <span>Filters</span>
          {getActiveFiltersCount() > 0 && (
            <span className="filter-count-badge">{getActiveFiltersCount()}</span>
          )}
        </div>
        <FaChevronDown className={`filter-toggle-chevron ${mobileExpanded ? 'rotated' : ''}`} />
      </div>

      {/* Filter content wrapper for mobile collapse */}
      <div className="filter-content-wrapper">
        <div className="filter-header-modern">
          <div className="filter-title">
            <FaFilter className="filter-icon" />
            <span>Filters</span>
            {getActiveFiltersCount() > 0 && (
              <span className="filter-count-badge">{getActiveFiltersCount()}</span>
            )}
          </div>
          {getActiveFiltersCount() > 0 && (
            <button className="clear-all-btn" onClick={handleClearAll}>
              Clear all
            </button>
          )}
        </div>

        {/* Mobile sort option - appears as filter option on mobile */}
        {sortBy && onSortChange && (
          <div className="mobile-sort-section">
            <label className="mobile-sort-label">Sort by</label>
            <select
              className="mobile-sort-dropdown"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as 'created' | 'updated')}
            >
              <option value="updated">Date Modified</option>
              <option value="created">Date Added</option>
            </select>
          </div>
        )}

        <div className="filter-dropdowns">
        {/* Patterns Dropdown - Only shown for Initiatives */}
        {!showTaskFilter && (
        <div
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['patterns'] = el}}
        >
          <button
            className={`dropdown-trigger ${openDropdown === 'patterns' ? 'active' : ''}`}
            onClick={() => toggleDropdown('patterns')}
          >
            <span className="dropdown-label">
              Patterns
              {((filters as SearchFilters).categories?.length || 0) > 0 && (
                <span className="selection-count">{(filters as SearchFilters).categories?.length}</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'patterns' ? 'rotated' : ''}`} />
          </button>

          {openDropdown === 'patterns' && (
            <div className="dropdown-menu">
              <div className="dropdown-options">
                {categories.map(category => (
                  <label key={category.id} className="dropdown-option">
                    <input
                      type="checkbox"
                      name="categories"
                      id={`category-${category.id}`}
                      checked={(filters as SearchFilters).categories?.includes(category.name) || false}
                      onChange={() => handleCategoryToggle(category.name)}
                    />
                    <span className="option-checkbox"></span>
                    <span className="option-text">{category.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Status Dropdown */}
        <div 
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['status'] = el}}
        >
          <button 
            className={`dropdown-trigger ${openDropdown === 'status' ? 'active' : ''}`}
            onClick={() => toggleDropdown('status')}
          >
            <span className="dropdown-label">
              Status
              {(filters.statuses?.length || 0) > 0 && (
                <span className="selection-count">{filters.statuses?.length}</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'status' ? 'rotated' : ''}`} />
          </button>
          
          {openDropdown === 'status' && (
            <div className="dropdown-menu">
              <div className="dropdown-options">
                {statuses.map(status => (
                  <label key={status.value} className="dropdown-option">
                    <input
                      type="checkbox"
                      name="statuses"
                      id={`status-${status.value}`}
                      checked={filters.statuses?.includes(status.value) || false}
                      onChange={() => handleStatusToggle(status.value)}
                    />
                    <span className="option-checkbox"></span>
                    <span className="option-text">
                      <span className="status-dot" style={{ backgroundColor: status.color }}></span>
                      {status.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Initiatives Dropdown - Only shown when showTaskFilter is true */}
        {showTaskFilter && initiatives && initiatives.length > 0 && (
          <div
            className="filter-dropdown"
            ref={el => {dropdownRefs.current['initiatives'] = el}}
          >
            <button
              className={`dropdown-trigger ${openDropdown === 'initiatives' ? 'active' : ''} ${((filters as TaskFilters).initiative_ids?.length || 0) > 0 ? 'has-selection' : ''}`}
              onClick={() => toggleDropdown('initiatives')}
            >
              <span className="dropdown-label">
                Linked Initiatives
                {((filters as TaskFilters).initiative_ids?.length || 0) > 0 && (
                  <span className="selection-count">{(filters as TaskFilters).initiative_ids?.length}</span>
                )}
              </span>
              <FaChevronDown className={`dropdown-arrow ${openDropdown === 'initiatives' ? 'rotated' : ''}`} />
            </button>

            {openDropdown === 'initiatives' && (
              <div className="dropdown-menu" style={{ minWidth: '280px' }}>
                {/* Search input */}
                <div style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                  position: 'sticky',
                  top: 0,
                  background: 'white',
                  zIndex: 1
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    background: '#f5f5f5',
                    borderRadius: '6px'
                  }}>
                    <FaSearch style={{ color: '#999', fontSize: '12px' }} />
                    <input
                      type="text"
                      placeholder="Search initiatives..."
                      value={initiativeSearch}
                      onChange={(e) => setInitiativeSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        fontSize: '13px',
                        width: '100%',
                        color: '#333'
                      }}
                    />
                    {initiativeSearch && (
                      <FaTimes
                        style={{ color: '#999', fontSize: '11px', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInitiativeSearch('');
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="dropdown-options" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {filteredInitiatives.length === 0 ? (
                    <div style={{ padding: '12px', color: '#999', fontSize: '13px', textAlign: 'center' }}>
                      No initiatives found
                    </div>
                  ) : (
                    filteredInitiatives.map(initiative => (
                      <label key={initiative.id} className="dropdown-option" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            name="initiative_ids"
                            id={`initiative-${initiative.id}`}
                            checked={(filters as TaskFilters).initiative_ids?.includes(initiative.id) || false}
                            onChange={() => handleInitiativeToggle(initiative.id)}
                          />
                          <span className="option-checkbox"></span>
                          <span className="option-text" title={initiative.title} style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>{initiative.title}</span>
                        </div>
                        <span style={{
                          marginLeft: '8px',
                          padding: '2px 6px',
                          background: (initiative.task_count || 0) > 0 ? '#e8f5e9' : '#f5f5f5',
                          color: (initiative.task_count || 0) > 0 ? '#2e7d32' : '#999',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          flexShrink: 0
                        }}>
                          {initiative.task_count || 0}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tags Dropdown */}
        <div
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['tags'] = el}}
        >
          <button
            className={`dropdown-trigger ${openDropdown === 'tags' ? 'active' : ''}`}
            onClick={() => toggleDropdown('tags')}
          >
            <span className="dropdown-label">
              Tags
              {((filters as SearchFilters).tags?.length || 0) > 0 && (
                <span className="selection-count">{(filters as SearchFilters).tags?.length}</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'tags' ? 'rotated' : ''}`} />
          </button>

          {openDropdown === 'tags' && (
            <div className="dropdown-menu">
              {availableTags.length === 0 ? (
                <div className="dropdown-empty">
                  No tags available. Create an initiative with tags first.
                </div>
              ) : (
                <div className="dropdown-options">
                  {availableTags.map(tag => (
                    <label key={tag} className="dropdown-option">
                      <input
                        type="checkbox"
                        name="tags"
                        id={`tag-${tag}`}
                        checked={(filters as SearchFilters).tags?.includes(tag) || false}
                        onChange={() => handleTagToggle(tag)}
                      />
                      <span className="option-checkbox"></span>
                      <span className="option-text">{tag}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Strategic Pillars Dropdown - Only shown for Initiatives */}
        {!showTaskFilter && (
        <div
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['strategic-pillars'] = el}}
        >
          <button
            className={`dropdown-trigger ${openDropdown === 'strategic-pillars' ? 'active' : ''}`}
            onClick={() => toggleDropdown('strategic-pillars')}
          >
            <span className="dropdown-label">
              Strategic Pillars
              {((filters as SearchFilters).strategic_pillars?.length || 0) > 0 && (
                <span className="selection-count">{(filters as SearchFilters).strategic_pillars?.length}</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'strategic-pillars' ? 'rotated' : ''}`} />
          </button>

          {openDropdown === 'strategic-pillars' && (
            <div className="dropdown-menu">
              <div className="dropdown-options">
                {strategicPillars.map(pillar => (
                  <label key={pillar.id} className="dropdown-option">
                    <input
                      type="checkbox"
                      name="strategic_pillars"
                      id={`pillar-${pillar.id}`}
                      checked={(filters as SearchFilters).strategic_pillars?.includes(pillar.id) || false}
                      onChange={() => handleStrategicPillarToggle(pillar.id)}
                    />
                    <span className="option-checkbox"></span>
                    <span className="option-text">{pillar.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Strategic Goals Dropdown - Only shown for Initiatives */}
        {!showTaskFilter && (
        <div
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['strategic-goals'] = el}}
        >
          <button 
            className={`dropdown-trigger ${openDropdown === 'strategic-goals' ? 'active' : ''}`}
            onClick={() => toggleDropdown('strategic-goals')}
          >
            <span className="dropdown-label">
              Strategic Goals
              {((filters as SearchFilters).strategic_goals?.length || 0) > 0 && (
                <span className="selection-count">{(filters as SearchFilters).strategic_goals?.length}</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'strategic-goals' ? 'rotated' : ''}`} />
          </button>

          {openDropdown === 'strategic-goals' && (
            <div className="dropdown-menu">
              <div className="dropdown-options">
                {strategicGoals
                  .filter(goal =>
                    !(filters as SearchFilters).strategic_pillars?.length ||
                    (filters as SearchFilters).strategic_pillars?.includes(goal.strategic_pillar_id)
                  )
                  .map(goal => (
                    <label key={goal.id} className="dropdown-option">
                      <input
                        type="checkbox"
                        name="strategic_goals"
                        id={`goal-${goal.id}`}
                        checked={(filters as SearchFilters).strategic_goals?.includes(goal.id) || false}
                        onChange={() => handleStrategicGoalToggle(goal.id)}
                      />
                      <span className="option-checkbox"></span>
                      <span className="option-text">{goal.title}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Expected Delivery Year Dropdown */}
        {!hideDeliveryDateFilters && (
        <div
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['delivery-year'] = el}}
        >
          <button
            className={`dropdown-trigger ${openDropdown === 'delivery-year' ? 'active' : ''}`}
            onClick={() => toggleDropdown('delivery-year')}
          >
            <span className="dropdown-label">
              Delivery Year
              {filters.expected_delivery_year && (
                <span className="selection-count">1</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'delivery-year' ? 'rotated' : ''}`} />
          </button>

          {openDropdown === 'delivery-year' && (
            <div className="dropdown-menu">
              <div className="dropdown-options">
                <label className="dropdown-option">
                  <input
                    type="radio"
                    name="expected_delivery_year"
                    id="year-all"
                    checked={!filters.expected_delivery_year}
                    onChange={() => onFiltersChange({ ...filters, expected_delivery_year: undefined })}
                  />
                  <span className="option-checkbox"></span>
                  <span className="option-text">All Years</span>
                </label>
                {[2024, 2025, 2026, 2027, 2028].map(year => (
                  <label key={year} className="dropdown-option">
                    <input
                      type="radio"
                      name="expected_delivery_year"
                      id={`year-${year}`}
                      checked={filters.expected_delivery_year === year}
                      onChange={() => onFiltersChange({ ...filters, expected_delivery_year: year })}
                    />
                    <span className="option-checkbox"></span>
                    <span className="option-text">{year}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Expected Delivery Month Dropdown */}
        {!hideDeliveryDateFilters && (
        <div
          className="filter-dropdown"
          ref={el => {dropdownRefs.current['delivery-month'] = el}}
        >
          <button
            className={`dropdown-trigger ${openDropdown === 'delivery-month' ? 'active' : ''}`}
            onClick={() => toggleDropdown('delivery-month')}
          >
            <span className="dropdown-label">
              Delivery Month
              {filters.expected_delivery_month && (
                <span className="selection-count">1</span>
              )}
            </span>
            <FaChevronDown className={`dropdown-arrow ${openDropdown === 'delivery-month' ? 'rotated' : ''}`} />
          </button>

          {openDropdown === 'delivery-month' && (
            <div className="dropdown-menu">
              <div className="dropdown-options">
                <label className="dropdown-option">
                  <input
                    type="radio"
                    name="expected_delivery_month"
                    id="month-all"
                    checked={!filters.expected_delivery_month}
                    onChange={() => onFiltersChange({ ...filters, expected_delivery_month: undefined })}
                  />
                  <span className="option-checkbox"></span>
                  <span className="option-text">All Months</span>
                </label>
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                  <label key={month} className="dropdown-option">
                    <input
                      type="radio"
                      name="expected_delivery_month"
                      id={`month-${month}`}
                      checked={filters.expected_delivery_month === month}
                      onChange={() => onFiltersChange({ ...filters, expected_delivery_month: month })}
                    />
                    <span className="option-checkbox"></span>
                    <span className="option-text">{month}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Active Filter Pills */}
      {getActiveFiltersCount() > 0 && (
        <div className="active-filters">
          {(filters as SearchFilters).categories?.map((cat: string) => (
            <div key={cat} className="filter-pill">
              <span className="pill-label">Pattern: {cat}</span>
              <button
                className="pill-remove"
                onClick={() => removeFilter('category', cat)}
              >
                <FaTimes />
              </button>
            </div>
          ))}
          {filters.statuses?.map(status => {
            const statusObj = statuses.find(s => s.value === status);
            return (
              <div key={status} className="filter-pill">
                <span className="pill-label">
                  Status: {statusObj?.label || status}
                </span>
                <button
                  className="pill-remove"
                  onClick={() => removeFilter('status', status)}
                >
                  <FaTimes />
                </button>
              </div>
            );
          })}
          {(filters as TaskFilters).initiative_ids?.map((initiativeId: string) => {
            const initiative = initiatives.find(i => i.id === initiativeId);
            return (
              <div key={initiativeId} className="filter-pill">
                <span className="pill-label" title={initiative?.title || initiativeId}>
                  Initiative: {initiative?.title ? (initiative.title.length > 20 ? initiative.title.substring(0, 20) + '...' : initiative.title) : initiativeId}
                </span>
                <button
                  className="pill-remove"
                  onClick={() => handleInitiativeToggle(initiativeId)}
                >
                  <FaTimes />
                </button>
              </div>
            );
          })}
          {(filters as SearchFilters).tags?.map((tagName: string) => (
            <div key={tagName} className="filter-pill">
              <span className="pill-label">Tag: {tagName}</span>
              <button
                className="pill-remove"
                onClick={() => removeFilter('tag', tagName)}
              >
                <FaTimes />
              </button>
            </div>
          ))}
          {(filters as SearchFilters).strategic_pillars?.map((pillarId: number) => {
            const pillar = strategicPillars.find(p => p.id === pillarId);
            return (
              <div key={pillarId} className="filter-pill">
                <span className="pill-label">
                  Pillar: {pillar?.name || `ID ${pillarId}`}
                </span>
                <button
                  className="pill-remove"
                  onClick={() => handleStrategicPillarToggle(pillarId)}
                >
                  <FaTimes />
                </button>
              </div>
            );
          })}
          {(filters as SearchFilters).strategic_goals?.map((goalId: string) => {
            const goal = strategicGoals.find(g => g.id === goalId);
            return (
              <div key={goalId} className="filter-pill">
                <span className="pill-label">
                  Goal: {goal?.title || `ID ${goalId}`}
                </span>
                <button
                  className="pill-remove"
                  onClick={() => handleStrategicGoalToggle(goalId)}
                >
                  <FaTimes />
                </button>
              </div>
            );
          })}
          {!hideDeliveryDateFilters && filters.expected_delivery_year && (
            <div className="filter-pill">
              <span className="pill-label">Year: {filters.expected_delivery_year}</span>
              <button
                className="pill-remove"
                onClick={() => onFiltersChange({ ...filters, expected_delivery_year: undefined })}
              >
                <FaTimes />
              </button>
            </div>
          )}
          {!hideDeliveryDateFilters && filters.expected_delivery_month && (
            <div className="filter-pill">
              <span className="pill-label">Month: {filters.expected_delivery_month}</span>
              <button
                className="pill-remove"
                onClick={() => onFiltersChange({ ...filters, expected_delivery_month: undefined })}
              >
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


export default FilterPanel;