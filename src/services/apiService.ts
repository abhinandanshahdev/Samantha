import axios from 'axios';
import { UseCase, Category, SearchFilters, StrategicPillar, StrategicGoal, StrategicGoalsFilters, UseCaseGoalAlignment, Outcome, Comment, UseCaseAssociation, Like, Domain, Task, TaskFilters, TaskLike, TaskInitiativeAssociation, InitiativeTaskAssociation, ExportPreviewResponse, ImportValidationResponse, ImportResponse, KanbanStatus } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  // Check for MSAL JWT token first, then fallback to traditional tokens
  const token = localStorage.getItem('msal_jwt_token') ||
                localStorage.getItem('token') ||
                sessionStorage.getItem('token') ||
                sessionStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('API Request:', config.method?.toUpperCase(), config.url, {
    headers: config.headers.Authorization ? 'Bearer [TOKEN]' : 'No Auth',
    data: config.data
  });
  return config;
});

// Track if user was authenticated (to distinguish expired session from fresh visit)
let wasAuthenticated = false;

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // User successfully made an authenticated request
    if (response.config.headers?.Authorization) {
      wasAuthenticated = true;
    }
    console.log('API Response:', response.config.method?.toUpperCase(), response.config.url, {
      status: response.status,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('API Error:', error.config?.method?.toUpperCase(), error.config?.url, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });

    if (error.response?.status === 401) {
      // Clear tokens
      localStorage.removeItem('msal_jwt_token');
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('jwt_token');

      // Only show alert and reload if user was previously authenticated (session expired)
      // Don't show alerts for fresh visits or during login flow
      if (wasAuthenticated) {
        wasAuthenticated = false;
        console.log('Session expired - redirecting to login');
        // Only reload if not already on login page
        if (!window.location.pathname.includes('login')) {
          window.location.reload();
        }
      } else {
        // Fresh visit or login flow - silently ignore 401s
        console.log('401 during auth flow - ignoring (not yet authenticated)');
      }
    }

    return Promise.reject(error);
  }
);

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('msal_jwt_token') ||
                localStorage.getItem('token') ||
                sessionStorage.getItem('token');
  return !!token;
};

// Helper function to get current token
export const getCurrentToken = (): string | null => {
  return localStorage.getItem('msal_jwt_token') ||
         localStorage.getItem('token') ||
         sessionStorage.getItem('token');
};

// Helper function to get base URL for direct fetch calls
export const getBaseURL = (): string => {
  return API_BASE_URL;
};

// Use Cases API
export const useCaseAPI = {
  getAll: async (filters?: SearchFilters & { limit?: number; offset?: number }): Promise<UseCase[]> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);

    // Handle legacy single-select filters
    if (filters?.category) params.append('category', filters.category);
    if (filters?.status) params.append('status', filters.status);

    // Handle multi-select filters
    if (filters?.categories && filters.categories.length > 0) {
      filters.categories.forEach(category => params.append('categories[]', category));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }

    if (filters?.strategic_pillar_id) params.append('strategic_pillar_id', filters.strategic_pillar_id.toString());
    if (filters?.strategic_goal_id) params.append('strategic_goal_id', filters.strategic_goal_id);

    // Handle multi-select strategic pillars and goals
    if (filters?.strategic_pillars && filters.strategic_pillars.length > 0) {
      params.append('strategic_pillar_id', filters.strategic_pillars[0].toString());
    }
    if (filters?.strategic_goals && filters.strategic_goals.length > 0) {
      params.append('strategic_goal_id', filters.strategic_goals[0]);
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.effort_level) params.append('effort_level', filters.effort_level);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await api.get(`/use-cases?${params.toString()}`);
    return response.data;
  },

  getStats: async (filters?: SearchFilters & { strategic_pillar_id?: number; strategic_goal_id?: string }): Promise<{
    total_count: number;
    status_breakdown: Record<string, number>;
    filtered: boolean;
  }> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);

    // Handle legacy single-select filters
    if (filters?.category) params.append('category', filters.category);
    if (filters?.status) params.append('status', filters.status);

    // Handle multi-select filters
    if (filters?.categories && filters.categories.length > 0) {
      filters.categories.forEach(category => params.append('categories[]', category));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }

    if (filters?.strategic_pillar_id) params.append('strategic_pillar_id', filters.strategic_pillar_id.toString());
    if (filters?.strategic_goal_id) params.append('strategic_goal_id', filters.strategic_goal_id);
    // Handle multi-select strategic pillars and goals
    if (filters?.strategic_pillars && filters.strategic_pillars.length > 0) {
      params.append('strategic_pillar_id', filters.strategic_pillars[0].toString());
    }
    if (filters?.strategic_goals && filters.strategic_goals.length > 0) {
      params.append('strategic_goal_id', filters.strategic_goals[0]);
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.effort_level) params.append('effort_level', filters.effort_level);

    const response = await api.get(`/use-cases/stats?${params.toString()}`);
    return response.data;
  },

  // Get use case statistics grouped by a field (for kanban/timeline views)
  getGroupedStats: async (
    groupBy: 'status' | 'expected_delivery_month',
    filters?: SearchFilters
  ): Promise<{
    groups: Record<string, { count: number }>;
    total_count: number;
    group_by: string;
  }> => {
    const params = new URLSearchParams();
    params.append('group_by', groupBy);

    if (filters?.search) params.append('search', filters.search);
    if (filters?.categories && filters.categories.length > 0) {
      filters.categories.forEach(category => params.append('categories[]', category));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.strategic_pillar_id) params.append('strategic_pillar_id', filters.strategic_pillar_id.toString());
    if (filters?.strategic_goal_id) params.append('strategic_goal_id', filters.strategic_goal_id);
    // Handle multi-select strategic pillars and goals
    if (filters?.strategic_pillars && filters.strategic_pillars.length > 0) {
      params.append('strategic_pillar_id', filters.strategic_pillars[0].toString());
    }
    if (filters?.strategic_goals && filters.strategic_goals.length > 0) {
      params.append('strategic_goal_id', filters.strategic_goals[0]);
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.effort_level) params.append('effort_level', filters.effort_level);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());

    const response = await api.get(`/use-cases/stats/grouped?${params.toString()}`);
    return response.data;
  },

  getById: async (id: string): Promise<UseCase> => {
    const response = await api.get(`/use-cases/${id}`);
    return response.data;
  },

  create: async (useCase: Partial<UseCase>): Promise<UseCase> => {
    const response = await api.post('/use-cases', useCase);
    return response.data;
  },

  update: async (id: string, useCase: Partial<UseCase>): Promise<UseCase> => {
    const response = await api.put(`/use-cases/${id}`, useCase);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    console.log('Attempting to delete use case with ID:', id);
    try {
      await api.delete(`/use-cases/${id}`);
      console.log('Delete successful for use case ID:', id);
    } catch (error) {
      console.error('Delete failed for use case ID:', id, error);
      throw error;
    }
  },

  updateStatus: async (id: string, status: KanbanStatus): Promise<UseCase> => {
    const response = await api.put(`/use-cases/${id}/kanban-status`, { kanban_pillar: status });
    return response.data;
  },

  updateDeliveryDate: async (id: string, expected_delivery_date: string | null | undefined): Promise<UseCase> => {
    const response = await api.put(`/use-cases/${id}/delivery-date`, {
      expected_delivery_date: expected_delivery_date || null
    });
    return response.data;
  },

  getAlignments: async (id: string): Promise<UseCaseGoalAlignment[]> => {
    const response = await api.get(`/use-cases/${id}/strategic-goals`);
    return response.data;
  },

  exportToCsv: async (
    type: 'all' | 'domains' | 'use_cases' | 'strategic_goals' | 'strategic_pillars' | 'likes' | 'comments' | 'associations' | 'alignments' = 'use_cases',
    domainId?: string
  ): Promise<void> => {
    const params = new URLSearchParams({ type });
    if (domainId) {
      params.append('domainId', domainId);
    }

    const response = await api.get(`/use-cases/export?${params.toString()}`, {
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const filename = type === 'use_cases' ? 'use-cases' : type === 'all' ? 'complete-export' : type.replace('_', '-');
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  importFromCsv: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('csvFile', file);

    const response = await api.post('/use-cases/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  },

  // JSON Export/Import functions
  getExportPreview: async (domainIds: number[]): Promise<ExportPreviewResponse> => {
    const response = await api.get(`/use-cases/export-preview?domainIds=${domainIds.join(',')}`);
    return response.data;
  },

  exportToJson: async (domainIds: number[]): Promise<void> => {
    const response = await api.get(`/use-cases/export-json?domainIds=${domainIds.join(',')}`, {
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `domain-export-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  validateJsonImport: async (file: File): Promise<ImportValidationResponse> => {
    const formData = new FormData();
    formData.append('jsonFile', file);

    const response = await api.post('/use-cases/import-json/validate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  },

  importFromJson: async (file: File): Promise<ImportResponse> => {
    const formData = new FormData();
    formData.append('jsonFile', file);

    const response = await api.post('/use-cases/import-json', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  }
};

// Categories API
export const categoryAPI = {
  getAll: async (domainId?: number | null): Promise<Category[]> => {
    const params = new URLSearchParams();
    if (domainId) {
      params.append('domain_id', domainId.toString());
    }
    const response = await api.get(`/categories${params.toString() ? '?' + params.toString() : ''}`);
    return response.data;
  },

  create: async (category: Omit<Category, 'id'>): Promise<Category> => {
    const response = await api.post('/categories', category);
    return response.data;
  },

  update: async (id: string | number, category: Omit<Category, 'id'>): Promise<Category> => {
    const response = await api.put(`/categories/${id}`, category);
    return response.data;
  },

  delete: async (id: string | number): Promise<void> => {
    await api.delete(`/categories/${id}`);
  }
};

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (email: string, name: string, password: string, role: string = 'consumer') => {
    const response = await api.post('/auth/register', { email, name, password, role });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  updateProfile: async (profileData: { name: string }) => {
    const response = await api.put('/auth/profile', profileData);
    return response.data;
  },

  createOrUpdateAzureUser: async (userData: {
    azure_ad_id: string;
    email: string;
    name: string;
    access_token: string;
  }) => {
    const response = await api.post('/auth/azure-ad', userData);
    return response.data;
  }
};

// Strategic Pillars API
export const strategicPillarsAPI = {
  getAll: async (domainId?: number | null): Promise<StrategicPillar[]> => {
    const params = new URLSearchParams();
    if (domainId) {
      params.append('domain_id', domainId.toString());
    }
    const response = await api.get(`/strategic-pillars${params.toString() ? '?' + params.toString() : ''}`);
    return response.data;
  },

  getById: async (id: number): Promise<StrategicPillar> => {
    const response = await api.get(`/strategic-pillars/${id}`);
    return response.data;
  },

  create: async (pillar: Partial<StrategicPillar>): Promise<StrategicPillar> => {
    const response = await api.post('/strategic-pillars', pillar);
    return response.data;
  },

  update: async (id: number, pillar: Partial<StrategicPillar>): Promise<StrategicPillar> => {
    const response = await api.put(`/strategic-pillars/${id}`, pillar);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/strategic-pillars/${id}`);
  }
};

// Strategic Goals API
export const strategicGoalsAPI = {
  getAll: async (filters?: StrategicGoalsFilters): Promise<StrategicGoal[]> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);
    if (filters?.strategic_pillar_id) params.append('strategic_pillar_id', filters.strategic_pillar_id.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());

    const response = await api.get(`/strategic-goals?${params.toString()}`);
    return response.data;
  },

  getById: async (id: string): Promise<StrategicGoal> => {
    const response = await api.get(`/strategic-goals/${id}`);
    return response.data;
  },

  create: async (goal: Partial<StrategicGoal>): Promise<StrategicGoal> => {
    const response = await api.post('/strategic-goals', goal);
    return response.data;
  },

  update: async (id: string, goal: Partial<StrategicGoal>): Promise<StrategicGoal> => {
    const response = await api.put(`/strategic-goals/${id}`, goal);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/strategic-goals/${id}`);
  },

  getAlignedUseCases: async (id: string): Promise<UseCase[]> => {
    const response = await api.get(`/strategic-goals/${id}/aligned-use-cases`);
    return response.data;
  },

  alignUseCase: async (goalId: string, useCaseId: string, alignment: Partial<UseCaseGoalAlignment>): Promise<void> => {
    await api.post(`/strategic-goals/${goalId}/align-use-case`, {
      use_case_id: useCaseId,
      ...alignment
    });
  },

  removeUseCaseAlignment: async (goalId: string, useCaseId: string): Promise<void> => {
    await api.delete(`/strategic-goals/${goalId}/align-use-case/${useCaseId}`);
  }
};

// AI Auto-complete API
export const aiAutoCompleteAPI = {
  generateUseCaseFromPrompt: async (prompt: string, domainId?: number | null): Promise<any> => {
    const response = await api.post('/chat/generate-usecase', {
      prompt,
      domain_id: domainId
    });
    return response.data;
  },

  generateTaskFromPrompt: async (prompt: string, domainId?: number | null): Promise<any> => {
    const response = await api.post('/chat/generate-task', {
      prompt,
      domain_id: domainId
    });
    return response.data;
  }
};

// Outcomes API
export const outcomesAPI = {
  getAll: async (domainId?: number | null): Promise<Outcome[]> => {
    const params = new URLSearchParams();
    if (domainId) {
      params.append('domain_id', domainId.toString());
    }
    const response = await api.get(`/outcomes${params.toString() ? '?' + params.toString() : ''}`);
    return response.data;
  },

  getById: async (id: number): Promise<Outcome> => {
    const response = await api.get(`/outcomes/${id}`);
    return response.data;
  },

  create: async (outcome: Partial<Outcome>): Promise<Outcome> => {
    const response = await api.post('/outcomes', outcome);
    return response.data;
  },

  update: async (id: number, outcome: Partial<Outcome>): Promise<Outcome> => {
    const response = await api.put(`/outcomes/${id}`, outcome);
    return response.data;
  },

  updateProgress: async (id: number, progress: number, maturity?: number): Promise<Outcome> => {
    const response = await api.patch(`/outcomes/${id}/progress`, { progress, maturity });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/outcomes/${id}`);
  }
};

// Comments API
export const commentsAPI = {
  getAll: async (entityId: string, entityType: 'use_case' | 'task' = 'use_case'): Promise<Comment[]> => {
    const endpoint = entityType === 'task'
      ? `/tasks/${entityId}/comments`
      : `/use-cases/${entityId}/comments`;
    const response = await api.get(endpoint);
    return response.data;
  },

  create: async (data: { use_case_id?: string; task_id?: string; parent_comment_id?: string | null; content: string }): Promise<Comment> => {
    const response = await api.post('/comments', data);
    return response.data;
  },

  update: async (id: string, content: string): Promise<Comment> => {
    const response = await api.put(`/comments/${id}`, { content });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/comments/${id}`);
  }
};

// Associations API
export const associationsAPI = {
  getAll: async (useCaseId: string): Promise<UseCaseAssociation[]> => {
    const response = await api.get(`/use-cases/${useCaseId}/associations`);
    return response.data;
  },

  create: async (useCaseId: string, relatedUseCaseId: string): Promise<UseCaseAssociation> => {
    const response = await api.post(`/use-cases/${useCaseId}/associations`, {
      related_use_case_id: relatedUseCaseId
    });
    return response.data;
  },

  delete: async (associationId: number): Promise<void> => {
    await api.delete(`/associations/${associationId}`);
  }
};

// Likes API
export const likesAPI = {
  getAll: async (useCaseId: string): Promise<Like[]> => {
    const response = await api.get(`/use-cases/${useCaseId}/likes`);
    return response.data;
  },

  getCount: async (useCaseId: string): Promise<number> => {
    const response = await api.get(`/use-cases/${useCaseId}/likes/count`);
    return response.data.count;
  },

  check: async (useCaseId: string): Promise<{ liked: boolean; likeId: number | null }> => {
    const response = await api.get(`/use-cases/${useCaseId}/likes/check`);
    return response.data;
  },

  toggle: async (useCaseId: string): Promise<{ liked: boolean; likeId: number | null; count: number }> => {
    const response = await api.post('/likes/toggle', { use_case_id: useCaseId });
    return response.data;
  },

  create: async (useCaseId: string): Promise<Like> => {
    const response = await api.post('/likes', { use_case_id: useCaseId });
    return response.data;
  },

  delete: async (likeId: number): Promise<void> => {
    await api.delete(`/likes/${likeId}`);
  }
};

// Domains API
export const domainAPI = {
  getAll: async (): Promise<Domain[]> => {
    const response = await api.get('/domains');
    return response.data;
  },

  getById: async (id: number): Promise<Domain> => {
    const response = await api.get(`/domains/${id}`);
    return response.data;
  },

  getConfig: async (id: number): Promise<Domain> => {
    const response = await api.get(`/domains/${id}/config`);
    return response.data;
  },

  create: async (domain: Partial<Domain>): Promise<Domain> => {
    const response = await api.post('/domains', domain);
    return response.data;
  },

  update: async (id: number, domain: Partial<Domain>): Promise<Domain> => {
    const response = await api.put(`/domains/${id}`, domain);
    return response.data;
  },

  delete: async (id: number, options?: { forceDelete?: boolean; confirmationCode?: string }): Promise<void> => {
    await api.delete(`/domains/${id}`, { data: options });
  },

  getDeletionPreview: async (id: number): Promise<{
    domain_id: number;
    domain_name: string;
    counts: Record<string, number>;
    total_items: number;
    warning: string;
  }> => {
    const response = await api.get(`/domains/${id}/deletion-preview`);
    return response.data;
  },

  getStats: async (id: number): Promise<{
    total_initiatives: number;
    production_count: number;
    pilot_count: number;
    pillar_count: number;
    goal_count: number;
    category_count: number;
  }> => {
    const response = await api.get(`/domains/${id}/stats`);
    return response.data;
  }
};

// User Preferences API
export const userPreferencesAPI = {
  getAll: async (): Promise<Record<string, string>> => {
    const response = await api.get('/user-preferences');
    return response.data;
  },

  get: async (key: string): Promise<string | null> => {
    const response = await api.get(`/user-preferences/${key}`);
    return response.data.value;
  },

  set: async (key: string, value: string): Promise<void> => {
    await api.post('/user-preferences', {
      preference_key: key,
      preference_value: value
    });
  },

  setBatch: async (preferences: Record<string, string>): Promise<void> => {
    await api.post('/user-preferences/batch', { preferences });
  },

  delete: async (key: string): Promise<void> => {
    await api.delete(`/user-preferences/${key}`);
  }
};

// Tasks API (renamed from Agents)
export const taskAPI = {
  getAll: async (filters?: TaskFilters & { limit?: number; offset?: number }): Promise<Task[]> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);

    // Handle legacy single-select filters
    if (filters?.status) params.append('status', filters.status);

    // Handle multi-select filters
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.initiative_ids && filters.initiative_ids.length > 0) {
      filters.initiative_ids.forEach(id => params.append('initiative_ids[]', id));
    }

    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.effort_level) params.append('effort_level', filters.effort_level);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await api.get(`/tasks?${params.toString()}`);
    return response.data;
  },

  getById: async (id: string): Promise<Task> => {
    const response = await api.get(`/tasks/${id}`);
    return response.data;
  },

  create: async (task: Partial<Task> & { selectedInitiatives: string[] }): Promise<{ id: string; message: string }> => {
    const response = await api.post('/tasks', task);
    return response.data;
  },

  update: async (id: string, task: Partial<Task> & { selectedInitiatives?: string[] }): Promise<void> => {
    await api.put(`/tasks/${id}`, task);
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/tasks/${id}`);
  },

  updateStatus: async (id: string, status: KanbanStatus): Promise<void> => {
    await api.put(`/tasks/${id}/kanban-status`, { kanban_pillar: status });
  },

  updateDeliveryDate: async (id: string, expected_delivery_date: string | null): Promise<void> => {
    await api.put(`/tasks/${id}/delivery-date`, { expected_delivery_date });
  },

  getStats: async (domainId?: number): Promise<any> => {
    const params = domainId ? `?domain_id=${domainId}` : '';
    const response = await api.get(`/tasks/stats/summary${params}`);
    return response.data;
  },

  // Get task statistics with filters (for pagination and counts)
  getStatsWithFilters: async (filters?: TaskFilters): Promise<{
    total_count: number;
    status_breakdown: Record<string, number>;
    filtered: boolean;
  }> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);

    // Handle multi-select filters
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.initiative_ids && filters.initiative_ids.length > 0) {
      filters.initiative_ids.forEach(id => params.append('initiative_ids[]', id));
    }

    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.effort_level) params.append('effort_level', filters.effort_level);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());

    const response = await api.get(`/tasks/stats?${params.toString()}`);
    return response.data;
  },

  // Get task statistics grouped by a field (for kanban/timeline views)
  getGroupedStats: async (
    groupBy: 'status' | 'expected_delivery_month',
    filters?: TaskFilters
  ): Promise<{
    groups: Record<string, { count: number }>;
    total_count: number;
    group_by: string;
  }> => {
    const params = new URLSearchParams();
    params.append('group_by', groupBy);

    if (filters?.search) params.append('search', filters.search);
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.initiative_ids && filters.initiative_ids.length > 0) {
      filters.initiative_ids.forEach(id => params.append('initiative_ids[]', id));
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.effort_level) params.append('effort_level', filters.effort_level);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());

    const response = await api.get(`/tasks/stats/grouped?${params.toString()}`);
    return response.data;
  }
};

// Task Initiative Associations API (renamed from Agent Associations)
export const taskAssociationsAPI = {
  getInitiativesForTask: async (taskId: string): Promise<TaskInitiativeAssociation[]> => {
    const response = await api.get(`/tasks/${taskId}/initiatives`);
    return response.data;
  },

  getTasksForInitiative: async (useCaseId: string): Promise<InitiativeTaskAssociation[]> => {
    const response = await api.get(`/use-cases/${useCaseId}/tasks`);
    return response.data;
  },

  createAssociation: async (taskId: string, useCaseId: string): Promise<TaskInitiativeAssociation> => {
    const response = await api.post(`/tasks/${taskId}/initiatives`, { use_case_id: useCaseId });
    return response.data;
  },

  deleteAssociation: async (associationId: number): Promise<void> => {
    await api.delete(`/associations/${associationId}`);
  }
};

// Task Likes API (renamed from Agent Likes)
export const taskLikesAPI = {
  getAll: async (taskId: string): Promise<TaskLike[]> => {
    const response = await api.get(`/tasks/${taskId}/likes`);
    return response.data;
  },

  getCount: async (taskId: string): Promise<{ count: number }> => {
    const response = await api.get(`/tasks/${taskId}/likes/count`);
    return response.data;
  },

  checkLiked: async (taskId: string): Promise<{ liked: boolean; likeId: number | null }> => {
    const response = await api.get(`/tasks/${taskId}/likes/check`);
    return response.data;
  },

  // Batch check if current user liked multiple tasks (fixes N+1 problem)
  batchCheckLiked: async (taskIds: string[]): Promise<{ liked_ids: string[] }> => {
    if (!taskIds || taskIds.length === 0) {
      return { liked_ids: [] };
    }
    const response = await api.post('/task-likes/batch-check', { task_ids: taskIds });
    return response.data;
  },

  toggle: async (taskId: string): Promise<{ liked: boolean; likeId: number | null; count: number }> => {
    const response = await api.post('/task-likes/toggle', { task_id: taskId });
    return response.data;
  },

  create: async (taskId: string): Promise<TaskLike> => {
    const response = await api.post('/task-likes', { task_id: taskId });
    return response.data;
  },

  delete: async (likeId: number): Promise<void> => {
    await api.delete(`/task-likes/${likeId}`);
  }
};

// Tags API
export const tagsAPI = {
  getAll: async (): Promise<Array<{ id: number; name: string }>> => {
    const response = await api.get('/tags');
    return response.data;
  },

  create: async (name: string): Promise<{ id: number; name: string }> => {
    const response = await api.post('/tags', { name });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/tags/${id}`);
  }
};

// Audit Logs API
export const auditLogsAPI = {
  getAll: async (params?: {
    limit?: number;
    offset?: number;
    search?: string;
    eventType?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<import('../types').AuditLogResponse> => {
    const response = await api.get('/audit-logs', { params });
    return response.data;
  },

  getStats: async (): Promise<Array<{ event_type: string; count: number }>> => {
    const response = await api.get('/audit-logs/stats');
    return response.data;
  }
};

// Analytics API
export interface VarianceData {
  period: {
    start: string;
    end: string;
    days: number;
  };
  previous_period: {
    start: string;
    end: string;
  };
  summary: {
    initiatives: {
      current: number;
      previous: number;
      variance: number;
      percent: number;
    };
    tasks: {
      current: number;
      previous: number;
      variance: number;
      percent: number;
    };
    ratio: number;
  };
  daily: Array<{
    date: string;
    initiatives: number;
    tasks: number;
  }>;
  breakdown: Array<{
    name: string;
    breakdown_type?: string;
    initiatives_current: number;
    initiatives_previous: number;
    initiatives_variance: number;
    tasks_current: number;
    tasks_previous: number;
    tasks_variance: number;
  }>;
}

export const analyticsAPI = {
  getVariance: async (params: {
    days?: number;
    start_date?: string;
    end_date?: string;
    domain_id: number;
    breakdown?: 'status' | 'impact' | 'category';
  }): Promise<VarianceData> => {
    const response = await api.get('/analytics/variance', { params });
    return response.data;
  }
};

// Admin Users API (admin only)
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'viewer' | 'contributor' | 'admin';
  status: 'active' | 'pending' | 'suspended';
  azure_ad_id?: string;
  created_date: string;
  updated_date: string;
}

export const adminUsersAPI = {
  getAll: async (): Promise<User[]> => {
    const response = await api.get('/admin/users');
    return response.data;
  },

  approve: async (userId: string): Promise<{ message: string; user: User }> => {
    const response = await api.put(`/admin/users/${userId}/approve`);
    return response.data;
  },

  suspend: async (userId: string): Promise<{ message: string; user: User }> => {
    const response = await api.put(`/admin/users/${userId}/suspend`);
    return response.data;
  },

  updateRole: async (userId: string, role: string): Promise<{ message: string; user: User }> => {
    const response = await api.put(`/admin/users/${userId}/role`, { role });
    return response.data;
  },

  delete: async (userId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/admin/users/${userId}`);
    return response.data;
  }
};

// Attachments API
export interface Attachment {
  id: number;
  entity_type: 'initiative' | 'task' | 'chat';
  entity_id: string;
  filename: string;
  file_path: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  created_by: string;
  created_date: string;
  downloadUrl?: string;
}

export const attachmentAPI = {
  // Get all attachments for an entity
  getAll: async (entityType: 'initiative' | 'task', entityId: string): Promise<Attachment[]> => {
    const response = await api.get(`/attachments/${entityType}/${entityId}`);
    return response.data;
  },

  // Upload a file attachment
  upload: async (entityType: 'initiative' | 'task', entityId: string, file: File): Promise<{ success: boolean; attachment: Attachment }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post(`/attachments/upload/${entityType}/${entityId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get download URL for an attachment
  getDownloadUrl: async (attachmentId: number): Promise<{ id: number; filename: string; mimeType: string; downloadUrl: string }> => {
    const response = await api.get(`/attachments/${attachmentId}/download`);
    return response.data;
  },

  // Delete an attachment
  delete: async (attachmentId: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/attachments/${attachmentId}`);
    return response.data;
  },

  // Check if attachment service is available
  getStatus: async (): Promise<{ configured: boolean; message: string }> => {
    const response = await api.get('/attachments/status');
    return response.data;
  },

  // Chat file upload methods
  uploadChatFile: async (file: File, sessionId?: string): Promise<{ success: boolean; attachment: Attachment }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (sessionId) {
      formData.append('sessionId', sessionId);
    }

    const response = await api.post('/attachments/chat/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // List all chat uploads for the current user
  listChatFiles: async (): Promise<Attachment[]> => {
    const response = await api.get('/attachments/chat/list');
    return response.data;
  },

  // Delete a chat upload
  deleteChatFile: async (attachmentId: number): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/attachments/chat/${attachmentId}`);
    return response.data;
  }
};

// Phone Verification Response Types
export interface PhoneStatus {
  success: boolean;
  service: {
    configured: boolean;
    whatsappEnabled: boolean;
  };
  user: {
    phone_number: string | null;
    phone_verified: boolean;
    phone_verified_date: string | null;
  };
}

export interface PhoneVerificationResponse {
  success: boolean;
  message?: string;
  phone_number?: string;
  error?: string;
}

export const phoneAPI = {
  // Get phone verification status
  getStatus: async (): Promise<PhoneStatus> => {
    const response = await api.get('/phone/status');
    return response.data;
  },

  // Send verification code via SMS
  sendVerification: async (phoneNumber: string, countryCode?: string): Promise<PhoneVerificationResponse> => {
    const response = await api.post('/phone/send-verification', {
      phone_number: phoneNumber,
      country_code: countryCode
    });
    return response.data;
  },

  // Verify the SMS code
  verifyCode: async (code: string): Promise<PhoneVerificationResponse> => {
    const response = await api.post('/phone/verify-code', { code });
    return response.data;
  },

  // Unlink phone from account
  unlink: async (): Promise<PhoneVerificationResponse> => {
    const response = await api.delete('/phone/unlink');
    return response.data;
  }
};

export default api;
