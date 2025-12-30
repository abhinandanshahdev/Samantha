import axios from 'axios';
import { UseCase, Category, Department, SearchFilters, StrategicPillar, StrategicGoal, StrategicGoalsFilters, UseCaseGoalAlignment, Outcome, Comment, UseCaseAssociation, Like, Domain, Agent, AgentType, AgentFilters, AgentLike, AgentInitiativeAssociation, InitiativeAgentAssociation, ExportPreviewResponse, ImportValidationResponse, ImportResponse } from '../types';

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

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
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
      // Token expired or invalid, clear tokens and show alert
      localStorage.removeItem('msal_jwt_token');
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('jwt_token');
      
      // Show user-friendly message
      const errorMessage = error.response?.data?.error || 'Your session has expired. Please log in again.';
      alert(errorMessage);
      
      // Only reload if not already on login page
      if (!window.location.pathname.includes('login')) {
        window.location.reload();
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
    if (filters?.department) params.append('department', filters.department);
    
    // Handle multi-select filters (proper implementation)
    if (filters?.categories && filters.categories.length > 0) {
      filters.categories.forEach(category => params.append('categories[]', category));
    }
    if (filters?.departments && filters.departments.length > 0) {
      filters.departments.forEach(department => params.append('departments[]', department));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.data_sensitivity && filters.data_sensitivity.length > 0) {
      filters.data_sensitivity.forEach(level => params.append('data_sensitivity[]', level));
    }
    if (filters?.agent_types && filters.agent_types.length > 0) {
      filters.agent_types.forEach(type => params.append('agent_types[]', type));
    }

    if (filters?.strategic_pillar_id) params.append('strategic_pillar_id', filters.strategic_pillar_id.toString());
    if (filters?.strategic_goal_id) params.append('strategic_goal_id', filters.strategic_goal_id);

    // Handle multi-select strategic pillars and goals
    if (filters?.strategic_pillars && filters.strategic_pillars.length > 0) {
      // For now, use the first pillar for API compatibility (backend expects single pillar)
      params.append('strategic_pillar_id', filters.strategic_pillars[0].toString());
    }
    if (filters?.strategic_goals && filters.strategic_goals.length > 0) {
      // For now, use the first goal for API compatibility (backend expects single goal)  
      params.append('strategic_goal_id', filters.strategic_goals[0]);
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.kanban_pillar) params.append('kanban_pillar', filters.kanban_pillar);
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
    if (filters?.department) params.append('department', filters.department);
    
    // Handle multi-select filters (proper implementation)
    if (filters?.categories && filters.categories.length > 0) {
      filters.categories.forEach(category => params.append('categories[]', category));
    }
    if (filters?.departments && filters.departments.length > 0) {
      filters.departments.forEach(department => params.append('departments[]', department));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.data_sensitivity && filters.data_sensitivity.length > 0) {
      filters.data_sensitivity.forEach(level => params.append('data_sensitivity[]', level));
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

    const response = await api.get(`/use-cases/stats?${params.toString()}`);
    return response.data;
  },

  // Get use case statistics grouped by a field (for kanban/timeline views)
  getGroupedStats: async (
    groupBy: 'kanban_pillar' | 'expected_delivery_month' | 'status',
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
    if (filters?.departments && filters.departments.length > 0) {
      filters.departments.forEach(department => params.append('departments[]', department));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.data_sensitivity && filters.data_sensitivity.length > 0) {
      filters.data_sensitivity.forEach(level => params.append('data_sensitivity[]', level));
    }
    if (filters?.agent_types && filters.agent_types.length > 0) {
      filters.agent_types.forEach(type => params.append('agent_types[]', type));
    }
    if (filters?.strategic_pillar_id) params.append('strategic_pillar_id', filters.strategic_pillar_id.toString());
    if (filters?.strategic_goal_id) params.append('strategic_goal_id', filters.strategic_goal_id);
    // Handle multi-select strategic pillars and goals (same as getAll)
    if (filters?.strategic_pillars && filters.strategic_pillars.length > 0) {
      params.append('strategic_pillar_id', filters.strategic_pillars[0].toString());
    }
    if (filters?.strategic_goals && filters.strategic_goals.length > 0) {
      params.append('strategic_goal_id', filters.strategic_goals[0]);
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
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

  updateKanbanStatus: async (id: string, kanban_pillar: string): Promise<UseCase> => {
    const response = await api.put(`/use-cases/${id}/kanban-status`, { kanban_pillar });
    return response.data;
  },

  updateDeliveryDate: async (id: string, expected_delivery_date: string | null | undefined): Promise<UseCase> => {
    // Use dedicated delivery-date endpoint - only send the date, month and year are derived from it
    const response = await api.put(`/use-cases/${id}/delivery-date`, {
      expected_delivery_date: expected_delivery_date || null
    });
    return response.data;
  },

  getAlignments: async (id: string): Promise<UseCaseGoalAlignment[]> => {
    const response = await api.get(`/use-cases/${id}/alignments`);
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

  // JSON Export/Import functions (New domain-based system)
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

// Departments API
export const departmentAPI = {
  getAll: async (domainId?: number): Promise<Department[]> => {
    const params = new URLSearchParams();
    if (domainId) {
      params.append('domain_id', domainId.toString());
    }
    const response = await api.get(`/departments${params.toString() ? '?' + params.toString() : ''}`);
    return response.data;
  },

  create: async (department: Omit<Department, 'id'> & { domain_id: number }): Promise<Department> => {
    const response = await api.post('/departments', department);
    return response.data;
  },

  update: async (id: string, department: Omit<Department, 'id'>): Promise<Department> => {
    const response = await api.put(`/departments/${id}`, department);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/departments/${id}`);
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

  generateAgentFromPrompt: async (prompt: string, domainId?: number | null): Promise<any> => {
    const response = await api.post('/chat/generate-agent', {
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
  getAll: async (entityId: string, entityType: 'use_case' | 'agent' = 'use_case'): Promise<Comment[]> => {
    const endpoint = entityType === 'agent'
      ? `/agents/${entityId}/comments`
      : `/use-cases/${entityId}/comments`;
    const response = await api.get(endpoint);
    return response.data;
  },

  create: async (data: { use_case_id?: string; agent_id?: string; parent_comment_id?: string | null; content: string }): Promise<Comment> => {
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

// Agents API
export const agentAPI = {
  getAll: async (filters?: AgentFilters & { limit?: number; offset?: number }): Promise<Agent[]> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);

    // Handle legacy single-select filters
    if (filters?.agent_type) params.append('agent_type', filters.agent_type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.department) params.append('department', filters.department);

    // Handle multi-select filters
    if (filters?.agent_types && filters.agent_types.length > 0) {
      filters.agent_types.forEach(type => params.append('agent_types[]', type));
    }
    if (filters?.departments && filters.departments.length > 0) {
      filters.departments.forEach(department => params.append('departments[]', department));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.data_sensitivity && filters.data_sensitivity.length > 0) {
      filters.data_sensitivity.forEach(level => params.append('data_sensitivity[]', level));
    }
    if (filters?.initiative_ids && filters.initiative_ids.length > 0) {
      filters.initiative_ids.forEach(id => params.append('initiative_ids[]', id));
    }

    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.kanban_pillar) params.append('kanban_pillar', filters.kanban_pillar);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await api.get(`/agents?${params.toString()}`);
    return response.data;
  },

  getById: async (id: string): Promise<Agent> => {
    const response = await api.get(`/agents/${id}`);
    return response.data;
  },

  create: async (agent: Partial<Agent> & { selectedInitiatives: string[] }): Promise<{ id: string; message: string }> => {
    const response = await api.post('/agents', agent);
    return response.data;
  },

  update: async (id: string, agent: Partial<Agent> & { selectedInitiatives?: string[] }): Promise<void> => {
    await api.put(`/agents/${id}`, agent);
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/agents/${id}`);
  },

  updateKanbanStatus: async (id: string, kanban_pillar: string): Promise<void> => {
    await api.put(`/agents/${id}/kanban-status`, { kanban_pillar });
  },

  updateDeliveryDate: async (id: string, expected_delivery_date: string | null): Promise<void> => {
    await api.put(`/agents/${id}/delivery-date`, { expected_delivery_date });
  },

  getStats: async (domainId?: number): Promise<any> => {
    const params = domainId ? `?domain_id=${domainId}` : '';
    const response = await api.get(`/agents/stats/summary${params}`);
    return response.data;
  },

  // Get agent statistics with filters (for pagination and counts)
  getStatsWithFilters: async (filters?: AgentFilters): Promise<{
    total_count: number;
    status_breakdown: Record<string, number>;
    filtered: boolean;
  }> => {
    const params = new URLSearchParams();

    if (filters?.search) params.append('search', filters.search);

    // Handle multi-select filters
    if (filters?.agent_types && filters.agent_types.length > 0) {
      filters.agent_types.forEach(type => params.append('agent_types[]', type));
    }
    if (filters?.departments && filters.departments.length > 0) {
      filters.departments.forEach(department => params.append('departments[]', department));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.data_sensitivity && filters.data_sensitivity.length > 0) {
      filters.data_sensitivity.forEach(level => params.append('data_sensitivity[]', level));
    }
    if (filters?.initiative_ids && filters.initiative_ids.length > 0) {
      filters.initiative_ids.forEach(id => params.append('initiative_ids[]', id));
    }

    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.kanban_pillar) params.append('kanban_pillar', filters.kanban_pillar);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());

    const response = await api.get(`/agents/stats?${params.toString()}`);
    return response.data;
  },

  // Get agent statistics grouped by a field (for kanban/timeline views)
  getGroupedStats: async (
    groupBy: 'kanban_pillar' | 'expected_delivery_month' | 'status',
    filters?: AgentFilters
  ): Promise<{
    groups: Record<string, { count: number }>;
    total_count: number;
    group_by: string;
  }> => {
    const params = new URLSearchParams();
    params.append('group_by', groupBy);

    if (filters?.search) params.append('search', filters.search);
    if (filters?.agent_types && filters.agent_types.length > 0) {
      filters.agent_types.forEach(type => params.append('agent_types[]', type));
    }
    if (filters?.departments && filters.departments.length > 0) {
      filters.departments.forEach(department => params.append('departments[]', department));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      filters.statuses.forEach(status => params.append('statuses[]', status));
    }
    if (filters?.tags && filters.tags.length > 0) {
      filters.tags.forEach(tag => params.append('tags[]', tag));
    }
    if (filters?.data_sensitivity && filters.data_sensitivity.length > 0) {
      filters.data_sensitivity.forEach(level => params.append('data_sensitivity[]', level));
    }
    if (filters?.initiative_ids && filters.initiative_ids.length > 0) {
      filters.initiative_ids.forEach(id => params.append('initiative_ids[]', id));
    }
    if (filters?.strategic_impact) params.append('strategic_impact', filters.strategic_impact);
    if (filters?.expected_delivery_year) params.append('expected_delivery_year', filters.expected_delivery_year.toString());
    if (filters?.expected_delivery_month) params.append('expected_delivery_month', filters.expected_delivery_month);
    if (filters?.domain_id) params.append('domain_id', filters.domain_id.toString());

    const response = await api.get(`/agents/stats/grouped?${params.toString()}`);
    return response.data;
  }
};

// Agent Types API
export const agentTypeAPI = {
  getAll: async (domainId?: number): Promise<AgentType[]> => {
    const params = domainId ? `?domain_id=${domainId}` : '';
    const response = await api.get(`/agent-types${params}`);
    return response.data;
  },

  create: async (agentType: Omit<AgentType, 'id' | 'created_date' | 'updated_date'>): Promise<AgentType> => {
    const response = await api.post('/agent-types', agentType);
    return response.data;
  },

  update: async (id: number, agentType: Partial<AgentType>): Promise<void> => {
    await api.put(`/agent-types/${id}`, agentType);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/agent-types/${id}`);
  }
};

// Agent Initiative Associations API
export const agentAssociationsAPI = {
  getInitiativesForAgent: async (agentId: string): Promise<AgentInitiativeAssociation[]> => {
    const response = await api.get(`/agents/${agentId}/initiatives`);
    return response.data;
  },

  getAgentsForInitiative: async (useCaseId: string): Promise<InitiativeAgentAssociation[]> => {
    const response = await api.get(`/use-cases/${useCaseId}/agents`);
    return response.data;
  },

  createAssociation: async (agentId: string, useCaseId: string): Promise<AgentInitiativeAssociation> => {
    const response = await api.post(`/agents/${agentId}/initiatives`, { use_case_id: useCaseId });
    return response.data;
  },

  deleteAssociation: async (associationId: number): Promise<void> => {
    await api.delete(`/associations/${associationId}`);
  }
};

// Agent Likes API
export const agentLikesAPI = {
  getAll: async (agentId: string): Promise<AgentLike[]> => {
    const response = await api.get(`/agents/${agentId}/likes`);
    return response.data;
  },

  getCount: async (agentId: string): Promise<{ count: number }> => {
    const response = await api.get(`/agents/${agentId}/likes/count`);
    return response.data;
  },

  checkLiked: async (agentId: string): Promise<{ liked: boolean; likeId: number | null }> => {
    const response = await api.get(`/agents/${agentId}/likes/check`);
    return response.data;
  },

  // Batch check if current user liked multiple agents (fixes N+1 problem)
  batchCheckLiked: async (agentIds: string[]): Promise<{ liked_ids: string[] }> => {
    if (!agentIds || agentIds.length === 0) {
      return { liked_ids: [] };
    }
    const response = await api.post('/agent-likes/batch-check', { agent_ids: agentIds });
    return response.data;
  },

  toggle: async (agentId: string): Promise<{ liked: boolean; likeId: number | null; count: number }> => {
    const response = await api.post('/agent-likes/toggle', { agent_id: agentId });
    return response.data;
  },

  create: async (agentId: string): Promise<AgentLike> => {
    const response = await api.post('/agent-likes', { agent_id: agentId });
    return response.data;
  },

  delete: async (likeId: number): Promise<void> => {
    await api.delete(`/agent-likes/${likeId}`);
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

// Data Sensitivity Levels API
export const dataSensitivityLevelsAPI = {
  getAll: async (): Promise<Array<{ id: number; name: string; description: string; display_order: number }>> => {
    const response = await api.get('/data-sensitivity-levels');
    return response.data;
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
    agents: {
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
    agents: number;
  }>;
  breakdown: Array<{
    name: string;
    breakdown_type?: string;
    initiatives_current: number;
    initiatives_previous: number;
    initiatives_variance: number;
    agents_current: number;
    agents_previous: number;
    agents_variance: number;
  }>;
}

export const analyticsAPI = {
  getVariance: async (params: {
    days?: number;
    start_date?: string;
    end_date?: string;
    domain_id: number;
    breakdown?: 'department' | 'status' | 'impact' | 'category' | 'kanban';
  }): Promise<VarianceData> => {
    const response = await api.get('/analytics/variance', { params });
    return response.data;
  }
};

export default api;