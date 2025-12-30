import { useEffect, useCallback } from 'react';
import { UseCase, StrategicGoal } from '../types';

export type ViewType = 'value_dashboard' | 'dashboard' | 'detail' | 'create' | 'edit' | 'login' | 'register' |
  'password_reset' | 'create_goal' | 'edit_goal' | 'goal_detail' |
  'strategic_goals' | 'import_export' | 'reference_data' | 'profile' | 'roadmap' | 'roadmap_timeline' | 'domain_management' |
  'agents' | 'agent_detail' | 'agent_create' | 'agent_edit' | 'audit_log';

interface NavigationState {
  view: ViewType;
  useCaseId?: number;
  goalId?: number;
  previousView?: ViewType;
}

interface UseHistoryNavigationProps {
  currentView: ViewType;
  selectedUseCase: UseCase | null;
  selectedStrategicGoal: StrategicGoal | null;
  onNavigate: (view: ViewType, useCase?: UseCase | null, goal?: StrategicGoal | null) => void;
}

export const useHistoryNavigation = ({
  currentView,
  selectedUseCase,
  selectedStrategicGoal,
  onNavigate
}: UseHistoryNavigationProps) => {
  
  // Parse state from URL
  const parseUrlState = useCallback((): NavigationState => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // Map paths to views
    if (path === '/' || path === '/dashboard') return { view: 'dashboard' };
    if (path === '/login') return { view: 'login' };
    if (path === '/register') return { view: 'register' };
    if (path === '/password-reset') return { view: 'password_reset' };
    if (path === '/strategic-goals') return { view: 'strategic_goals' };
    if (path === '/import-export') return { view: 'import_export' };
    if (path === '/profile') return { view: 'profile' };
    if (path === '/create') return { view: 'create' };
    if (path === '/create-goal') return { view: 'create_goal' };
    if (path === '/audit-log') return { view: 'audit_log' };
    
    // Handle parameterized routes
    if (path === '/use-case' || path.startsWith('/use-case/')) {
      const id = params.get('id') || path.split('/').pop();
      return { view: 'detail', useCaseId: id ? parseInt(id) : undefined };
    }
    
    if (path === '/edit-use-case' || path.startsWith('/edit-use-case/')) {
      const id = params.get('id') || path.split('/').pop();
      return { view: 'edit', useCaseId: id ? parseInt(id) : undefined };
    }
    
    if (path === '/goal' || path.startsWith('/goal/')) {
      const id = params.get('id') || path.split('/').pop();
      return { view: 'goal_detail', goalId: id ? parseInt(id) : undefined };
    }
    
    if (path === '/edit-goal' || path.startsWith('/edit-goal/')) {
      const id = params.get('id') || path.split('/').pop();
      return { view: 'edit_goal', goalId: id ? parseInt(id) : undefined };
    }
    
    // Default to dashboard
    return { view: 'dashboard' };
  }, []);

  // Update URL based on current state
  const updateUrl = useCallback((view: ViewType, useCase?: UseCase | null, goal?: StrategicGoal | null, previousView?: ViewType) => {
    let path = '/';
    const state: any = { view };

    // Store previous view in state for back navigation
    if (previousView) {
      state.previousView = previousView;
    }

    switch (view) {
      case 'dashboard':
        path = '/dashboard';
        break;
      case 'login':
        path = '/login';
        break;
      case 'register':
        path = '/register';
        break;
      case 'password_reset':
        path = '/password-reset';
        break;
      case 'strategic_goals':
        path = '/strategic-goals';
        break;
      case 'import_export':
        path = '/import-export';
        break;
      case 'profile':
        path = '/profile';
        break;
      case 'create':
        path = '/create';
        break;
      case 'create_goal':
        path = '/create-goal';
        break;
      case 'detail':
        if (useCase) {
          path = `/use-case?id=${useCase.id}`;
          state.useCaseId = useCase.id;
        }
        break;
      case 'edit':
        if (useCase) {
          path = `/edit-use-case?id=${useCase.id}`;
          state.useCaseId = useCase.id;
        }
        break;
      case 'goal_detail':
        if (goal) {
          path = `/goal?id=${goal.id}`;
          state.goalId = goal.id;
        }
        break;
      case 'edit_goal':
        if (goal) {
          path = `/edit-goal?id=${goal.id}`;
          state.goalId = goal.id;
        }
        break;
      case 'roadmap':
        path = '/roadmap';
        break;
      case 'roadmap_timeline':
        path = '/roadmap-timeline';
        break;
      case 'audit_log':
        path = '/audit-log';
        break;
    }

    // Only push to history if the URL actually changes
    if (window.location.pathname + window.location.search !== path) {
      window.history.pushState(state, '', path);
    }
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const navState = parseUrlState();
      
      // Navigate to the view indicated by the URL
      if (navState.view !== currentView) {
        // For views that require data, we'll need to handle loading
        if ((navState.view === 'detail' || navState.view === 'edit') && navState.useCaseId) {
          // The parent component should handle loading the use case by ID
          onNavigate(navState.view, { id: navState.useCaseId } as unknown as UseCase);
        } else if ((navState.view === 'goal_detail' || navState.view === 'edit_goal') && navState.goalId) {
          // The parent component should handle loading the goal by ID
          onNavigate(navState.view, null, { id: navState.goalId } as unknown as StrategicGoal);
        } else {
          onNavigate(navState.view);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentView, onNavigate, parseUrlState]);

  // Update URL when view changes
  useEffect(() => {
    // Get previous view from history state if available
    const previousView = (window.history.state?.previousView as ViewType) || undefined;
    updateUrl(currentView, selectedUseCase, selectedStrategicGoal, previousView);
  }, [currentView, selectedUseCase, selectedStrategicGoal, updateUrl]);

  // Initialize URL on mount and handle initial navigation
  useEffect(() => {
    // Check if we need to navigate based on the initial URL
    const initialState = parseUrlState();
    
    // If the URL indicates a different view than the current view, navigate to it
    if (initialState.view !== currentView || initialState.useCaseId || initialState.goalId) {
      if ((initialState.view === 'detail' || initialState.view === 'edit') && initialState.useCaseId) {
        onNavigate(initialState.view, { id: initialState.useCaseId } as unknown as UseCase);
      } else if ((initialState.view === 'goal_detail' || initialState.view === 'edit_goal') && initialState.goalId) {
        onNavigate(initialState.view, null, { id: initialState.goalId } as unknown as StrategicGoal);
      } else if (initialState.view !== currentView) {
        onNavigate(initialState.view);
      }
    } else if (window.location.pathname === '/') {
      // If we're on the root path, update to the current view
      updateUrl(currentView, selectedUseCase, selectedStrategicGoal);
    }
  }, []); // Run only on mount

  return {
    updateUrl,
    parseUrlState
  };
};