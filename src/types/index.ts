export interface User {
  id: string;
  email: string;
  name: string;
  role: 'consumer' | 'admin';
  created_date: string;
  email_verified: boolean;
}

export type DomainType = 'ai' | 'data' | 'infosec' | 'infrastructure' | 'custom';

export interface DomainConfig {
  terminology?: {
    initiative_singular: string;
    initiative_plural: string;
  };
  features?: {
    complexity_fields: boolean;
    ai_autocomplete: boolean;
  };
}

export interface Domain {
  id: number;
  name: string;
  type: DomainType;
  hero_message?: string;
  subtitle?: string;
  config_json?: DomainConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  initiative_count?: number;
  pillar_count?: number;
  goal_count?: number;
  category_count?: number;
}

export type ComplexityLevel = 'High' | 'Medium' | 'Low';

export type KanbanStatus = 'backlog' | 'prioritised' | 'in_progress' | 'completed' | 'blocked' | 'slow_burner' | 'de_prioritised' | 'on_hold';

export type DataSensitivityLevel = 'Public' | 'Restricted' | 'Confidential' | 'Secret';

export interface ComplexityCategories {
  data_complexity: ComplexityLevel;
  integration_complexity: ComplexityLevel;
  intelligence_complexity: ComplexityLevel;
  functional_complexity: ComplexityLevel;
}

export interface UseCase {
  id: string;
  domain_id: number;
  title: string;
  description: string;
  problem_statement: string;
  solution_overview: string;
  technical_implementation?: string;
  results_metrics?: string;
  lessons_learned?: string;
  category: string;
  tags?: string[];
  status: 'concept' | 'proof_of_concept' | 'validation' | 'pilot' | 'production';
  author_name: string;
  owner_name?: string;
  owner_email?: string;
  created_date: string;
  updated_date: string;
  view_count: number;
  rating: number;
  strategic_impact: 'Low' | 'Medium' | 'High';
  complexity: ComplexityCategories;
  department: string;
  justification?: string;
  attachments?: string[];
  strategic_goal_alignments?: UseCaseGoalAlignment[];
  goal_alignment_count?: number;
  likes_count?: number;
  comments_count?: number;
  agent_count?: number; // Count of linked agents
  kanban_pillar?: KanbanStatus;
  expected_delivery_date?: string; // Format: 'MMM YYYY' like 'Jan 2025'
  data_sensitivity?: DataSensitivityLevel;
  roadmap_link?: string;
  value_realisation_link?: string;
}

export interface Category {
  id: string | number;
  name: string;
  description: string;
  domain_id?: number;
}

export interface Outcome {
  id?: number;
  domain_id: number;
  outcome_key: string;
  title: string;
  measure: string;
  progress: number;
  maturity?: number;
  display_order: number;
  is_active?: boolean;
  created_date?: string;
  updated_date?: string;
}

export interface Department {
  id: string;
  name: string;
  domain_id?: number;
}

export interface SearchFilters {
  search?: string;
  domain_id?: number; // Filter by domain
  categories?: string[];  // Changed to array for multi-select
  statuses?: string[];    // Changed to array for multi-select
  departments?: string[]; // Changed to array for multi-select
  tags?: string[];        // Array for multi-select tags (AND logic: must have ALL selected tags)
  strategic_pillars?: number[]; // Array for multi-select strategic pillars
  strategic_goals?: string[];   // Array for multi-select strategic goals
  // Legacy single-select (for backward compatibility, will be removed)
  category?: string;
  status?: string;
  department?: string;
  strategic_pillar_id?: number; // Single strategic pillar filter
  strategic_goal_id?: string;   // Single strategic goal filter
  strategic_impact?: 'Low' | 'Medium' | 'High'; // Strategic impact filter
  complexity?: {
    data_complexity?: ComplexityLevel;
    integration_complexity?: ComplexityLevel;
    intelligence_complexity?: ComplexityLevel;
    functional_complexity?: ComplexityLevel;
  };
  dateRange?: {
    start: string;
    end: string;
  };
  kanban_pillar?: KanbanStatus; // Kanban delivery status filter
  expected_delivery_year?: number; // Expected delivery year filter
  expected_delivery_month?: string; // Expected delivery month filter (e.g., 'Jan', 'Feb')
  data_sensitivity?: DataSensitivityLevel[]; // Data sensitivity filter (multi-select with AND logic)
  agent_types?: string[]; // Filter use cases by their linked agents' types (used in Linked Initiatives view)
}

export interface PrioritizationMatrix {
  complexity: 'High' | 'Medium' | 'Low';
  impact: 'High' | 'Medium' | 'Low';
} 

export interface StrategicPillar {
  id: number;
  name: string;
  description: string;
  domain_id: number;
  display_order: number;
  created_date: string;
  updated_date: string;
}

export interface StrategicGoal {
  id: string;
  title: string;
  description: string;
  strategic_pillar_id: number;
  strategic_pillar_name?: string;
  target_date?: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  completion_percentage?: number;
  success_metrics?: string;
  author_id: string;
  author_name?: string;
  display_order: number;
  created_date: string;
  updated_date: string;
  aligned_use_cases_count?: number;
}

export interface UseCaseGoalAlignment {
  use_case_id: string;
  strategic_goal_id: string;
  alignment_strength: 'Low' | 'Medium' | 'High';
  rationale?: string;
  created_date: string;
  goal_title?: string;
  goal_description?: string;
}

export interface StrategicGoalsFilters {
  search?: string;
  strategic_pillar_id?: number;
  status?: string;
  priority?: string;
  domain_id?: number | null;
}

export interface Comment {
  id: string;
  use_case_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  parent_comment_id?: string | null;
  content: string;
  is_edited: boolean;
  created_date: string;
  updated_date: string;
}

export interface Like {
  id: number;
  use_case_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  created_date: string;
}

export interface UseCaseAssociation {
  association_id: number;
  use_case_id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  department: string;
  created_date: string;
  created_by_name: string;
}

// Agent types
export interface AgentType {
  id: number;
  name: string;
  description: string;
  domain_id: number;
  created_date?: string;
  updated_date?: string;
}

export interface Agent {
  id: string;
  domain_id: number;
  title: string;
  description: string;
  problem_statement: string;
  solution_overview: string;
  technical_implementation?: string;
  results_metrics?: string;
  lessons_learned?: string;
  agent_type: string;
  status: 'concept' | 'proof_of_concept' | 'validation' | 'pilot' | 'production';
  author_name: string;
  owner_name?: string;
  owner_email?: string;
  created_date: string;
  updated_date: string;
  strategic_impact: 'Low' | 'Medium' | 'High';
  complexity: ComplexityCategories;
  department: string;
  justification?: string;
  initiative_count?: number;
  likes_count?: number;
  comments_count?: number;
  kanban_pillar?: KanbanStatus;
  expected_delivery_date?: string; // Format: 'MMM YYYY' like 'Jan 2025'
  linked_initiatives?: string[]; // Array of use case IDs
  data_sensitivity?: DataSensitivityLevel;
  roadmap_link?: string;
  value_realisation_link?: string;
}

export interface AgentFilters {
  search?: string;
  domain_id?: number;
  agent_types?: string[];
  statuses?: string[];
  departments?: string[];
  tags?: string[];        // Array for multi-select tags (filters agents by linked initiatives' tags with AND logic)
  initiative_ids?: string[]; // Filter agents by linked initiatives (multi-select)
  agent_type?: string; // Legacy single-select
  status?: string; // Legacy single-select
  department?: string; // Legacy single-select
  strategic_impact?: 'Low' | 'Medium' | 'High';
  complexity?: {
    data_complexity?: ComplexityLevel;
    integration_complexity?: ComplexityLevel;
    intelligence_complexity?: ComplexityLevel;
    functional_complexity?: ComplexityLevel;
  };
  kanban_pillar?: KanbanStatus;
  expected_delivery_year?: number;
  expected_delivery_month?: string;
  data_sensitivity?: DataSensitivityLevel[]; // Data sensitivity filter (multi-select with AND logic)
}

export interface AgentLike {
  id: number;
  agent_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  created_date: string;
}

export interface AgentInitiativeAssociation {
  association_id: number;
  use_case_id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  department: string;
  created_date: string;
  created_by_name: string;
}

export interface InitiativeAgentAssociation {
  association_id: number;
  agent_id: string;
  title: string;
  description: string;
  status: string;
  agent_type: string;
  department: string;
  created_date: string;
  created_by_name: string;
}

export type AuditLogEventType =
  | 'kanban_change'
  | 'roadmap_change'
  | 'status_change'
  | 'use_case_created'
  | 'agent_created'
  | 'comment_added'
  | 'like_added';

export type AuditLogEntityType = 'use_case' | 'agent';

export interface AuditLog {
  id: string;
  event_type: AuditLogEventType;
  entity_type: AuditLogEntityType;
  entity_id: string;
  entity_title: string | null;
  user_id: string | null;
  user_name: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, any> | null;
  created_date: string;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Domain Export/Import Types
// ============================================================================

export interface ExportPreviewDomain {
  id: number;
  name: string;
  type: DomainType;
  counts: {
    initiatives: number;
    agents: number;
    strategic_pillars: number;
    strategic_goals: number;
    categories: number;
    departments: number;
    agent_types: number;
    outcomes: number;
    tags: number;
    comments: number;
    initiative_likes: number;
    agent_likes: number;
    initiative_associations: number;
    goal_alignments: number;
    agent_initiative_associations: number;
  };
  total: number;
}

export interface ExportPreviewResponse {
  domains: ExportPreviewDomain[];
  total_entities: number;
  estimated_size_kb: number;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  entity_type: string;
  entity_name: string;
  message: string;
}

export interface ImportValidationDomain {
  name: string;
  exists: boolean;
  will_skip: boolean;
  has_errors: boolean;
  entity_counts: {
    [key: string]: {
      to_import: number;
      to_skip: number;
    };
  };
  validation_issues: ValidationIssue[];
}

export interface MissingAuthor {
  original_name: string;
  mapped_to: string;
}

export interface ImportValidationResponse {
  valid: boolean;
  domains: ImportValidationDomain[];
  total_to_import: number;
  total_to_skip: number;
  missing_authors: MissingAuthor[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ImportEntityResult {
  imported: number;
  skipped: number;
  errors: number;
}

export interface ImportDomainResult {
  name: string;
  status: 'imported' | 'merged' | 'skipped' | 'error';
  entities: {
    [key: string]: ImportEntityResult;
  };
  warnings: string[];
  error: string | null;
}

export interface ImportResponse {
  success: boolean;
  message: string;
  domains: ImportDomainResult[];
  errors: string[];
  warnings: string[];
}