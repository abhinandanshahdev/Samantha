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

export type EffortLevel = 'Low' | 'Medium' | 'High';

export type KanbanStatus = 'intention' | 'experimentation' | 'commitment' | 'implementation' | 'integration' | 'blocked' | 'slow_burner' | 'de_prioritised' | 'on_hold';

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
  status: KanbanStatus;
  author_name: string;
  owner_name?: string;
  owner_email?: string;
  created_date: string;
  updated_date: string;
  view_count: number;
  rating: number;
  strategic_impact: 'Low' | 'Medium' | 'High';
  effort_level?: EffortLevel;
  justification?: string;
  attachments?: string[];
  strategic_goal_alignments?: UseCaseGoalAlignment[];
  goal_alignment_count?: number;
  likes_count?: number;
  comments_count?: number;
  task_count?: number; // Count of linked tasks
  expected_delivery_date?: string; // Format: 'MMM YYYY' like 'Jan 2025'
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

export interface SearchFilters {
  search?: string;
  domain_id?: number; // Filter by domain
  categories?: string[];  // Array for multi-select
  statuses?: KanbanStatus[];    // Array for multi-select
  tags?: string[];        // Array for multi-select tags (AND logic: must have ALL selected tags)
  strategic_pillars?: number[]; // Array for multi-select strategic pillars
  strategic_goals?: string[];   // Array for multi-select strategic goals
  // Legacy single-select (for backward compatibility)
  category?: string;
  status?: KanbanStatus;
  strategic_pillar_id?: number; // Single strategic pillar filter
  strategic_goal_id?: string;   // Single strategic goal filter
  strategic_impact?: 'Low' | 'Medium' | 'High'; // Strategic impact filter
  effort_level?: EffortLevel; // Effort level filter
  dateRange?: {
    start: string;
    end: string;
  };
  expected_delivery_year?: number; // Expected delivery year filter
  expected_delivery_month?: string; // Expected delivery month filter (e.g., 'Jan', 'Feb')
}

export interface PrioritizationMatrix {
  effort: EffortLevel;
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
  status: KanbanStatus;
  category: string;
  created_date: string;
  created_by_name: string;
}

// Task types (renamed from Agent)
export interface Task {
  id: string;
  domain_id: number;
  title: string;
  description: string;
  problem_statement: string;
  solution_overview: string;
  technical_implementation?: string;
  results_metrics?: string;
  lessons_learned?: string;
  status: KanbanStatus;
  author_name: string;
  owner_name?: string;
  owner_email?: string;
  created_date: string;
  updated_date: string;
  strategic_impact: 'Low' | 'Medium' | 'High';
  effort_level?: EffortLevel;
  justification?: string;
  initiative_count?: number;
  likes_count?: number;
  comments_count?: number;
  expected_delivery_date?: string; // Format: 'MMM YYYY' like 'Jan 2025'
  linked_initiatives?: string[]; // Array of use case IDs
  roadmap_link?: string;
  value_realisation_link?: string;
}

export interface TaskFilters {
  search?: string;
  domain_id?: number;
  statuses?: KanbanStatus[];
  tags?: string[];        // Array for multi-select tags (filters tasks by linked initiatives' tags with AND logic)
  initiative_ids?: string[]; // Filter tasks by linked initiatives (multi-select)
  status?: KanbanStatus; // Legacy single-select
  strategic_impact?: 'Low' | 'Medium' | 'High';
  effort_level?: EffortLevel;
  expected_delivery_year?: number;
  expected_delivery_month?: string;
}

export interface TaskLike {
  id: number;
  task_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  created_date: string;
}

export interface TaskInitiativeAssociation {
  association_id: number;
  use_case_id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  category: string;
  created_date: string;
  created_by_name: string;
}

export interface InitiativeTaskAssociation {
  association_id: number;
  task_id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  created_date: string;
  created_by_name: string;
}

export type AuditLogEventType =
  | 'kanban_change'
  | 'roadmap_change'
  | 'status_change'
  | 'use_case_created'
  | 'task_created'
  | 'comment_added'
  | 'like_added';

export type AuditLogEntityType = 'use_case' | 'task';

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
    tasks: number;
    strategic_pillars: number;
    strategic_goals: number;
    categories: number;
    outcomes: number;
    tags: number;
    comments: number;
    initiative_likes: number;
    task_likes: number;
    initiative_associations: number;
    goal_alignments: number;
    task_initiative_associations: number;
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
