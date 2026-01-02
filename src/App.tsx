import React, { useState, useEffect, useCallback } from 'react';
import { UseCase, StrategicGoal, SearchFilters, Task, TaskFilters } from './types';
import { useCaseAPI, strategicGoalsAPI, associationsAPI, taskAPI, userPreferencesAPI } from './services/apiService';
import { useAuth } from './context/AuthContext';
import { useMsalAuth } from './context/DynamicMsalAuthContext';
import { useHistoryNavigation, ViewType } from './hooks/useHistoryNavigation';
import InitiativesList from './components/InitiativesList/InitiativesList';
import TasksList from './components/TasksList/TasksList';
import ValueFlowDashboard from './components/ValueFlowDashboard/ValueFlowDashboard';
import StrategyView from './components/StrategyView/StrategyView';
import ModernNavigation from './components/ModernNavigation/ModernNavigation';
import RoadmapKanban from './components/RoadmapKanban/RoadmapKanban';
import RoadmapTimeline from './components/RoadmapTimeline/RoadmapTimeline';
import AuditLog from './components/AuditLog/AuditLog';
import InitiativeDetail from './components/InitiativeDetail/InitiativeDetail';
import TaskDetail from './components/TaskDetail/TaskDetail';
import InitiativeForm from './components/InitiativeForm/InitiativeForm';
import TaskForm from './components/TaskForm/TaskForm';
import StrategicGoalFormSimple from './components/StrategicGoalFormSimple/StrategicGoalFormSimple';
import AuthSwitch from './components/Auth/AuthSwitch';
import AuthLoadingScreen from './components/Loading/AuthLoadingScreen';
import DomainDataTransfer from './components/DomainDataTransfer/DomainDataTransfer';
import UserProfile from './components/UserProfile/UserProfile';
import ReferenceDataManagement from './components/ReferenceDataManagement/ReferenceDataManagement';
import DomainManagement from './components/DomainManagement/DomainManagement';
import Header from './components/Header/Header';
import { ArtifactsBrowser } from './components/ArtifactsBrowser/ArtifactsBrowser';
import { FaTimes, FaUserCog, FaCog, FaSignOutAlt, FaDatabase, FaGlobe, FaClipboardList, FaFileDownload, FaMoon, FaChartPie } from 'react-icons/fa';
import './App.css';
import './styles/brand-colors.css';

interface AppState {
  currentView: ViewType;
  previousView?: ViewType;
  selectedUseCase: UseCase | null;
  selectedTask: Task | null;
  selectedStrategicGoal: StrategicGoal | null;
  useCases: UseCase[];
  strategicGoals: StrategicGoal[];
  searchQuery?: string;
  initialFilters?: SearchFilters | TaskFilters;
  currentFilters?: SearchFilters | TaskFilters;
}

function App() {
  const { user: traditionalUser, logout: traditionalLogout, updateUser: traditionalUpdateUser, isAuthenticated: traditionalAuth, isAdmin: traditionalAdmin, isLoading: traditionalLoading } = useAuth();
  const { user: msalUser, logout: msalLogout, updateUser: msalUpdateUser, isAuthenticated: msalAuth, isAdmin: msalAdmin, msalConfigured, isLoading: msalLoading } = useMsalAuth();
  
  // Use MSAL auth if configured and available, otherwise fall back to traditional auth
  const user = msalConfigured && msalAuth ? msalUser : traditionalUser;
  const logout = msalConfigured && msalAuth ? msalLogout : traditionalLogout;
  const updateUser = msalConfigured && msalAuth ? msalUpdateUser : traditionalUpdateUser;
  const isAuthenticated = msalConfigured ? msalAuth : traditionalAuth;
  const isAdmin = msalConfigured && msalAuth ? msalAdmin : traditionalAdmin;
  
  // Determine if we should show loading screen
  const isAuthLoading = msalConfigured ? msalLoading : traditionalLoading;

  // Initialize view based on authentication state and URL
  const getInitialView = (): ViewType => {
    if (!isAuthenticated) return 'login';
    
    // Check if there's a specific path in the URL
    const path = window.location.pathname;
    if (path && path !== '/') {
      // Let the history navigation hook handle the initial URL
      return 'value_dashboard'; // Default, will be overridden by hook
    }
    
    return 'value_dashboard';
  };

  const [appState, setAppState] = useState<AppState>({
    currentView: getInitialView(),
    selectedUseCase: null,
    selectedTask: null,
    selectedStrategicGoal: null,
    useCases: [],
    strategicGoals: [],
    searchQuery: ''
  });
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showArtifactsBrowser, setShowArtifactsBrowser] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [goalDisplayMode, setGoalDisplayMode] = useState<'completion' | 'initiatives'>('initiatives');

  // Load goal display mode preference
  useEffect(() => {
    (async () => {
      try {
        const mode = await userPreferencesAPI.get('goal_display_mode');
        if (mode === 'completion' || mode === 'initiatives') {
          setGoalDisplayMode(mode as 'completion' | 'initiatives');
        }
      } catch (err) {
        console.log('No goal display mode preference set, using default: initiatives');
      }
    })();
  }, []);

  // Toggle goal display mode
  const handleToggleGoalDisplayMode = async () => {
    const newMode = goalDisplayMode === 'completion' ? 'initiatives' : 'completion';
    setGoalDisplayMode(newMode);
    try {
      await userPreferencesAPI.set('goal_display_mode', newMode);
    } catch (err) {
      console.error('Failed to save goal display mode preference:', err);
    }
  };

  // Persist dark mode preference per user
  useEffect(() => {
    const key = `ui_dark_mode_${user?.id ?? 'anon'}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      setDarkMode(saved === 'true');
    }
  }, [user?.id]);

  useEffect(() => {
    const key = `ui_dark_mode_${user?.id ?? 'anon'}`;
    localStorage.setItem(key, darkMode ? 'true' : 'false');
    // Apply or remove dark-mode class on body
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode, user?.id]);

  // Persist "Hide animation" preference per user
  useEffect(() => {
    const key = `ui_hide_animation_${user?.id ?? 'anon'}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      setPresentation(saved === 'true');
    }
  }, [user?.id]);

  useEffect(() => {
    const key = `ui_hide_animation_${user?.id ?? 'anon'}`;
    localStorage.setItem(key, presentation ? 'true' : 'false');
  }, [presentation, user?.id]);


  // Auto-navigate to dashboard when authentication is successful
  useEffect(() => {
    if (isAuthenticated && appState.currentView === 'login' && !isAuthLoading) {
      console.log('Auto-navigating from login to value dashboard');
      // Add a small delay to ensure smooth transition from loading screen
      setTimeout(() => {
        setAppState(prev => ({ ...prev, currentView: 'value_dashboard' }));
      }, 300);
    }
  }, [isAuthenticated, appState.currentView, isAuthLoading]);

  // Store user data globally for chat services when user changes
  useEffect(() => {
    if (user) {
      (window as any).__APP_USER__ = user;
      localStorage.setItem('userProfile', JSON.stringify(user));
    } else {
      (window as any).__APP_USER__ = null;
      localStorage.removeItem('userProfile');
    }
  }, [user]);

  // Handle navigation with browser history support
  const handleNavigation = useCallback(async (view: ViewType, useCase?: UseCase | null, goal?: StrategicGoal | null) => {
    // If navigating to a detail/edit view with just an ID, load the full data
    if ((view === 'detail' || view === 'edit') && useCase && !useCase.title) {
      try {
        const fullUseCase = await useCaseAPI.getById(useCase.id.toString());
        setAppState(prev => ({
          ...prev,
          currentView: view,
          selectedUseCase: fullUseCase
        }));
        return;
      } catch (error) {
        console.error('Failed to load use case:', error);
        // Fall back to dashboard if loading fails
        setAppState(prev => ({
          ...prev,
          currentView: 'dashboard',
          selectedUseCase: null
        }));
        return;
      }
    }

    if ((view === 'goal_detail' || view === 'edit_goal') && goal && !goal.title) {
      try {
        const fullGoal = await strategicGoalsAPI.getById(goal.id.toString());
        setAppState(prev => ({
          ...prev,
          currentView: view,
          selectedStrategicGoal: fullGoal
        }));
        return;
      } catch (error) {
        console.error('Failed to load strategic goal:', error);
        // Fall back to strategic goals view if loading fails
        setAppState(prev => ({
          ...prev,
          currentView: 'strategic_goals',
          selectedStrategicGoal: null
        }));
        return;
      }
    }

    // Normal navigation
    setAppState(prev => ({
      ...prev,
      currentView: view,
      selectedUseCase: useCase || null,
      selectedStrategicGoal: goal || null
    }));
  }, []);

  // Set up browser history navigation
  useHistoryNavigation({
    currentView: appState.currentView,
    selectedUseCase: appState.selectedUseCase,
    selectedStrategicGoal: appState.selectedStrategicGoal,
    onNavigate: handleNavigation
  });

  // Load use cases from API
  useEffect(() => {
    const loadUseCases = async () => {
      if (isAuthenticated) {
        try {
          const useCases = await useCaseAPI.getAll();
          setAppState(prev => ({ ...prev, useCases }));
        } catch (error) {
          console.error('Failed to load use cases:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    loadUseCases();
  }, [isAuthenticated]);

  // Add keyboard shortcut for ESC to close menu
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Close menu on ESC key
      if (event.key === 'Escape' && showUserMenu) {
        setShowUserMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showUserMenu]);

  const handleUseCaseClick = (useCase: UseCase) => {
    setAppState(prev => ({
      ...prev,
      previousView: prev.currentView,
      currentView: 'detail',
      selectedUseCase: useCase
    }));
  };

  const handleCreateClick = () => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'create',
        selectedUseCase: null
      }));
    }
  };

  const handleEditClick = (useCase: UseCase) => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'edit',
        selectedUseCase: useCase
      }));
    }
  };

  const handleTaskClick = (task: Task) => {
    setAppState(prev => ({
      ...prev,
      previousView: prev.currentView,
      currentView: 'task_detail',
      selectedTask: task
    }));
  };

  const handleUseCaseClickById = async (useCaseId: string) => {
    try {
      // Fetch the use case by ID
      const useCase = await useCaseAPI.getById(useCaseId);
      if (useCase) {
        handleUseCaseClick(useCase);
      } else {
        console.error('Use case not found:', useCaseId);
      }
    } catch (error) {
      console.error('Failed to load use case:', error);
    }
  };

  const handleCreateTaskClick = () => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'task_create',
        selectedTask: null
      }));
    }
  };

  const handleEditTaskClick = (task: Task) => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'task_edit',
        selectedTask: task
      }));
    }
  };

  const handleCreateGoalClick = () => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'create_goal',
        selectedStrategicGoal: null
      }));
    }
  };

  const handleStrategicGoalsClick = () => {
    setAppState(prev => ({
      ...prev,
      currentView: 'strategic_goals',
      selectedUseCase: null,
      selectedStrategicGoal: null
    }));
  };

  const handleImportExportClick = () => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'import_export',
        selectedUseCase: null,
        selectedStrategicGoal: null
      }));
      setShowUserMenu(false);
    }
  };

  const handleProfileClick = () => {
    setAppState(prev => ({
      ...prev,
      currentView: 'profile',
      selectedUseCase: null,
      selectedStrategicGoal: null
    }));
    setShowUserMenu(false);
  };

  const handleReferenceDataClick = () => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'reference_data',
        selectedUseCase: null,
        selectedStrategicGoal: null
      }));
      setShowUserMenu(false);
    }
  };

  const handleDomainManagementClick = () => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'domain_management',
        selectedUseCase: null,
        selectedStrategicGoal: null
      }));
      setShowUserMenu(false);
    }
  };

  const handleAuditLogClick = () => {
    setAppState(prev => ({
      ...prev,
      currentView: 'audit_log',
      selectedUseCase: null,
      selectedStrategicGoal: null
    }));
    setShowUserMenu(false);
  };

  const handleUserUpdate = (updatedUser: any) => {
    // Update the user in the appropriate auth context
    updateUser(updatedUser);
    
    // Also store in global context for chat services
    (window as any).__APP_USER__ = updatedUser;
    
    // Store in localStorage for persistence
    localStorage.setItem('userProfile', JSON.stringify(updatedUser));
  };

  const handleEditGoalClick = (goal: StrategicGoal) => {
    if (isAdmin) {
      setAppState(prev => ({
        ...prev,
        currentView: 'edit_goal',
        selectedStrategicGoal: goal
      }));
    }
  };

  const handleGoalClick = (goal: StrategicGoal) => {
    setAppState(prev => ({
      ...prev,
      currentView: 'goal_detail',
      selectedStrategicGoal: goal
    }));
  };

  const handleBackToDashboard = () => {
    setAppState(prev => {
      const targetView = prev.previousView || 'dashboard';

      return {
        ...prev,
        currentView: targetView,
        previousView: undefined,
        // Only clear selectedUseCase if not going back to a detail view
        selectedUseCase: targetView === 'detail' ? prev.selectedUseCase : null,
        // Only clear selectedTask if not going back to task_detail view
        selectedTask: targetView === 'task_detail' ? prev.selectedTask : null,
        selectedStrategicGoal: null
      };
    });
  };

  const handleTopNavigation = (view: string) => {
    setAppState(prev => ({
      ...prev,
      currentView: view as ViewType,
      selectedUseCase: null,
      selectedStrategicGoal: null
    }));
  };

  const handleNavigateToInitiativesWithFilters = async (pillarId: number, goalLabel: string, goalIndex: number) => {
    try {
      // Find the strategic goal by pillar ID and goal label
      const goals = await strategicGoalsAPI.getAll({ strategic_pillar_id: pillarId });
      const matchingGoal = goals.find(goal => goal.title === goalLabel);

      // Navigate to AI Initiatives tab with filters, clearing any existing filters
      setAppState(prev => ({
        ...prev,
        currentView: 'dashboard',
        selectedUseCase: null,
        selectedStrategicGoal: null,
        currentFilters: undefined, // Clear existing filters
        initialFilters: {
          strategic_pillars: [pillarId],
          strategic_goals: matchingGoal ? [matchingGoal.id] : undefined,
        }
      }));

      // Clear the filters after a short delay to prevent them from persisting
      setTimeout(() => {
        setAppState(prev => ({
          ...prev,
          initialFilters: undefined
        }));
      }, 100);
    } catch (error) {
      console.error('Failed to load strategic goals for navigation:', error);
      // Fallback to just pillar filter
      setAppState(prev => ({
        ...prev,
        currentView: 'dashboard',
        selectedUseCase: null,
        selectedStrategicGoal: null,
        currentFilters: undefined, // Clear existing filters
        initialFilters: {
          strategic_pillars: [pillarId],
        }
      }));
    }
  };

  const handleSaveStrategicGoal = async (goalData: Partial<StrategicGoal>) => {
    try {
      if (appState.currentView === 'create_goal') {
        // Create new strategic goal via API
        const newGoal = await strategicGoalsAPI.create(goalData);
        setAppState(prev => ({
          ...prev,
          strategicGoals: [...prev.strategicGoals, newGoal],
          currentView: 'strategic_goals'
        }));
      } else if (appState.currentView === 'edit_goal' && appState.selectedStrategicGoal) {
        // Update existing strategic goal via API
        const updatedGoal = await strategicGoalsAPI.update(appState.selectedStrategicGoal.id, goalData);
        setAppState(prev => ({
          ...prev,
          strategicGoals: prev.strategicGoals.map(goal => 
            goal.id === appState.selectedStrategicGoal?.id ? updatedGoal : goal
          ),
          currentView: 'strategic_goals'
        }));
      }
    } catch (error) {
      console.error('Failed to save strategic goal:', error);
      alert('Failed to save strategic goal. Please try again.');
    }
  };


  const handleSaveUseCase = async (useCaseData: Partial<UseCase> & { selectedRelatedUseCases?: string[] }) => {
    try {
      if (appState.currentView === 'create') {
        // Create new use case via API
        const newUseCase = await useCaseAPI.create(useCaseData);

        // Create associations if any were selected
        if (useCaseData.selectedRelatedUseCases && useCaseData.selectedRelatedUseCases.length > 0) {
          try {
            await Promise.all(
              useCaseData.selectedRelatedUseCases.map(relatedId =>
                associationsAPI.create(newUseCase.id, relatedId)
              )
            );
            console.log('Successfully created associations for new use case');
          } catch (assocError) {
            console.error('Failed to create some associations:', assocError);
            // Don't fail the entire operation if associations fail
          }
        }

        setAppState(prev => ({
          ...prev,
          useCases: [...prev.useCases, newUseCase],
          currentView: 'dashboard'
        }));
      } else if (appState.currentView === 'edit' && appState.selectedUseCase) {
        // Update existing use case via API
        const updatedUseCase = await useCaseAPI.update(appState.selectedUseCase.id, useCaseData);
        setAppState(prev => ({
          ...prev,
          useCases: prev.useCases.map(uc =>
            uc.id === appState.selectedUseCase?.id ? updatedUseCase : uc
          ),
          currentView: 'dashboard'
        }));
      }
    } catch (error) {
      console.error('Failed to save use case:', error);
      // Re-throw error so form component can handle it with proper inline validation
      throw error;
    }
  };

  const handleDeleteUseCase = async (useCase: UseCase) => {
    if (window.confirm('Are you sure you want to delete this AI initiative?')) {
      try {
        console.log('Attempting to delete use case:', useCase.id, useCase.title);
        await useCaseAPI.delete(useCase.id);
        
        // Update state to remove the deleted use case
        setAppState(prev => ({
          ...prev,
          useCases: prev.useCases.filter(uc => uc.id !== useCase.id),
          currentView: 'dashboard',
          selectedUseCase: null
        }));
        
        console.log('Use case deleted successfully');
        
      } catch (error: any) {
        console.error('Failed to delete use case:', error);
        
        // Provide specific error messages based on the error type
        let errorMessage = 'Failed to delete AI initiative. Please try again.';
        
        if (error.response?.status === 401) {
          errorMessage = 'Your session has expired. Please log in again.';
        } else if (error.response?.status === 403) {
          errorMessage = 'You do not have permission to delete this AI initiative.';
        } else if (error.response?.status === 404) {
          errorMessage = 'AI initiative not found. It may have already been deleted.';
          // Remove from local state anyway
          setAppState(prev => ({
            ...prev,
            useCases: prev.useCases.filter(uc => uc.id !== useCase.id),
            currentView: 'value_dashboard',
            selectedUseCase: null
          }));
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        }
        
        alert(errorMessage);
      }
    }
  };

  const handleSaveTask = async (task: Task) => {
    try {
      if (appState.currentView === 'task_create') {
        setAppState(prev => ({
          ...prev,
          currentView: 'tasks'
        }));
      } else if (appState.currentView === 'task_edit') {
        setAppState(prev => ({
          ...prev,
          currentView: 'tasks'
        }));
      }
    } catch (error) {
      console.error('Failed to save task:', error);
      throw error;
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await taskAPI.delete(task.id);
        setAppState(prev => ({
          ...prev,
          currentView: 'tasks',
          selectedTask: null
        }));
      } catch (error: any) {
        console.error('Failed to delete task:', error);
        let errorMessage = 'Failed to delete task. Please try again.';

        if (error.response?.status === 401) {
          errorMessage = 'Your session has expired. Please log in again.';
        } else if (error.response?.status === 403) {
          errorMessage = 'You do not have permission to delete this task.';
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        }

        alert(errorMessage);
      }
    }
  };

  const handleSearch = (query: string) => {
    setAppState(prev => ({
      ...prev,
      searchQuery: query
    }));
  };

  const handleFiltersChange = (filters: SearchFilters | TaskFilters) => {
    setAppState(prev => ({
      ...prev,
      currentFilters: filters
    }));
  };

  const handleUserMenuClick = () => {
    if (isAuthenticated) {
      setShowUserMenu(prev => !prev);
    } else {
      setAppState(prev => ({ ...prev, currentView: 'login' }));
    }
  };

  const handleLogout = () => {
    logout();
    setAppState(prev => ({ ...prev, currentView: 'login' }));
    setShowUserMenu(false);
  };

  const handleAuthSuccess = () => {
    setAppState(prev => ({ ...prev, currentView: 'value_dashboard' }));
  };



  const renderCurrentView = () => {
    // Show loading screen while authentication is being determined
    if (isAuthLoading) {
      return <AuthLoadingScreen />;
    }

    // Note: 'pending' role removed in simplified RBAC system
    // All users are now either 'consumer' or 'admin'

    switch (appState.currentView) {
      case 'login':
        return <AuthSwitch onSuccess={handleAuthSuccess} />;
      case 'value_dashboard':
        return (
          <>
            <Header
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
              onChatClick={() => setShowAIChat(true)}
              userRole={user?.role}
            />
            <ModernNavigation
              currentView={appState.currentView}
              onNavigate={handleTopNavigation}
              onTogglePresentation={() => setPresentation(v => !v)}
              presentation={presentation}
              userRole={user?.role}
            />
            <ValueFlowDashboard
              presentation={presentation}
              userRole={user?.role}
              showAIChat={showAIChat}
              onCloseChatClick={() => setShowAIChat(false)}
              onNavigateToInitiatives={handleNavigateToInitiativesWithFilters}
              goalDisplayMode={goalDisplayMode}
            />
          </>
        );
      case 'dashboard':
        return (
          <>
            <Header 
              onSearch={handleSearch}
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
              onChatClick={() => setShowAIChat(true)}
              userRole={user?.role}
              initialSearchQuery={appState.searchQuery}
            />
            <ModernNavigation 
              currentView={appState.currentView} 
              onNavigate={handleTopNavigation}
              userRole={user?.role}
            />
            <InitiativesList
              onUseCaseClick={handleUseCaseClick}
              onCreateClick={handleCreateClick}
              onSearch={handleSearch}
              onUserMenuClick={handleUserMenuClick}
              searchQuery={appState.searchQuery}
              user={user || undefined}
              showAIChat={showAIChat}
              onCloseChatClick={() => setShowAIChat(false)}
              initialFilters={appState.initialFilters || appState.currentFilters}
              onFiltersChange={handleFiltersChange}
            />
          </>
        );
      case 'detail':
        return appState.selectedUseCase ? (
          <InitiativeDetail
            useCase={appState.selectedUseCase}
            onBack={handleBackToDashboard}
            onEdit={handleEditClick}
            onDelete={handleDeleteUseCase}
            canEdit={isAdmin}
            user={user || undefined}
            onUseCaseClick={handleUseCaseClick}
            onTaskClick={handleTaskClick}
            previousView={appState.previousView}
          />
        ) : null;
      case 'create':
        return (
          <InitiativeForm
            onSave={handleSaveUseCase}
            onCancel={handleBackToDashboard}
            isEditing={false}
          />
        );
      case 'edit':
        return appState.selectedUseCase ? (
          <InitiativeForm
            useCase={appState.selectedUseCase}
            onSave={handleSaveUseCase}
            onCancel={handleBackToDashboard}
            isEditing={true}
          />
        ) : null;
      case 'tasks':
        return (
          <>
            <Header
              onSearch={handleSearch}
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
              onChatClick={() => setShowAIChat(true)}
              userRole={user?.role}
              initialSearchQuery={appState.searchQuery}
            />
            <ModernNavigation
              currentView={appState.currentView}
              onNavigate={handleTopNavigation}
              userRole={user?.role}
            />
            <TasksList
              onTaskClick={handleTaskClick}
              onUseCaseClick={handleUseCaseClick}
              onCreateClick={handleCreateTaskClick}
              onSearch={handleSearch}
              onUserMenuClick={handleUserMenuClick}
              searchQuery={appState.searchQuery}
              user={user || undefined}
              showAIChat={showAIChat}
              onCloseChatClick={() => setShowAIChat(false)}
              initialFilters={appState.initialFilters as TaskFilters}
              onFiltersChange={handleFiltersChange}
            />
          </>
        );
      case 'task_detail':
        return appState.selectedTask ? (
          <TaskDetail
            task={appState.selectedTask}
            onBack={handleBackToDashboard}
            onEdit={handleEditTaskClick}
            onDelete={handleDeleteTask}
            canEdit={isAdmin}
            user={user || undefined}
            previousView={appState.previousView}
            onTaskClick={handleTaskClick}
            onInitiativeClick={handleUseCaseClickById}
          />
        ) : null;
      case 'task_create':
        return (
          <TaskForm
            onSave={handleSaveTask}
            onCancel={handleBackToDashboard}
            isEdit={false}
            user={user}
          />
        );
      case 'task_edit':
        return appState.selectedTask ? (
          <TaskForm
            task={appState.selectedTask}
            onSave={handleSaveTask}
            onCancel={handleBackToDashboard}
            isEdit={true}
            user={user}
          />
        ) : null;
      case 'create_goal':
        return (
          <StrategicGoalFormSimple
            onSave={handleSaveStrategicGoal}
            onCancel={handleStrategicGoalsClick}
            isEditing={false}
            user={user || undefined}
          />
        );
      case 'edit_goal':
        return appState.selectedStrategicGoal ? (
          <StrategicGoalFormSimple
            goal={appState.selectedStrategicGoal}
            onSave={handleSaveStrategicGoal}
            onCancel={handleStrategicGoalsClick}
            isEditing={true}
            user={user || undefined}
          />
        ) : null;
      case 'goal_detail':
        return appState.selectedStrategicGoal ? (
          <div>
            <h1>Strategic Goal Detail</h1>
            <p>TODO: Create StrategicGoalDetail component</p>
            <button onClick={handleStrategicGoalsClick}>Back to Goals</button>
          </div>
        ) : null;
      case 'strategic_goals':
        return (
          <>
            <Header 
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
              onChatClick={() => setShowAIChat(true)}
              userRole={user?.role}
            />
            <ModernNavigation 
              currentView={appState.currentView} 
              onNavigate={handleTopNavigation}
              userRole={user?.role}
            />
            <StrategyView
              onBackToDashboard={handleBackToDashboard}
              onCreateGoal={handleCreateGoalClick}
              onEditGoal={handleEditGoalClick}
              onGoalClick={handleGoalClick}
              user={user || undefined}
              showAIChat={showAIChat}
              onCloseChatClick={() => setShowAIChat(false)}
            />
          </>
        );
      case 'roadmap':
        return (
          <>
            <Header
              onSearch={handleSearch}
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
              onChatClick={() => setShowAIChat(true)}
              userRole={user?.role}
              initialSearchQuery={appState.searchQuery}
            />
            <ModernNavigation
              currentView={appState.currentView}
              onNavigate={handleTopNavigation}
              userRole={user?.role}
            />
            <RoadmapKanban
              onUseCaseClick={handleUseCaseClick}
              showAIChat={showAIChat}
              onCloseChatClick={() => setShowAIChat(false)}
              user={user || undefined}
              searchQuery={appState.searchQuery}
            />
          </>
        );
      case 'roadmap_timeline':
        return (
          <>
            <Header
              onSearch={handleSearch}
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
              onChatClick={() => setShowAIChat(true)}
              userRole={user?.role}
              initialSearchQuery={appState.searchQuery}
            />
            <ModernNavigation
              currentView={appState.currentView}
              onNavigate={handleTopNavigation}
              userRole={user?.role}
            />
            <RoadmapTimeline
              onUseCaseClick={handleUseCaseClick}
              showAIChat={showAIChat}
              onCloseChatClick={() => setShowAIChat(false)}
              user={user || undefined}
              searchQuery={appState.searchQuery}
            />
          </>
        );
      case 'audit_log':
        return (
          <AuditLog
            user={user || undefined}
            onUserMenuClick={handleUserMenuClick}
            onBackToDashboard={handleBackToDashboard}
          />
        );
      case 'import_export':
        return (
          <div>
            <Header
              onUserMenuClick={handleUserMenuClick}
              user={user || undefined}
            />
            <DomainDataTransfer onBack={handleBackToDashboard} />
          </div>
        );
      case 'profile':
        return user ? (
          <UserProfile
            user={user}
            onBack={handleBackToDashboard}
            onUserMenuClick={handleUserMenuClick}
            onUserUpdate={handleUserUpdate}
          />
        ) : null;
      case 'reference_data':
        return isAdmin ? (
          <ReferenceDataManagement
            onBack={handleBackToDashboard}
          />
        ) : null;
      case 'domain_management':
        return isAdmin ? (
          <DomainManagement onBack={handleBackToDashboard} />
        ) : null;
      default:
        return <div>Unknown view</div>;
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="App">
      {/* Main Content Container */}
      <div
        className={`main-content ${showUserMenu ? 'menu-open' : ''}`}
        style={{
          transform: showUserMenu ? 'translateX(-300px)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          width: '100%',
          minHeight: '100vh'
        }}
      >


        {renderCurrentView()}
      </div>

      {/* Slide-out Menu Panel */}
      <div
        className={`slide-menu ${showUserMenu ? 'open' : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          right: showUserMenu ? '0' : '-300px',
          width: '300px',
          height: '100vh',
          background: darkMode ? '#1F1E30' : 'white',
          boxShadow: showUserMenu ? (darkMode ? '-4px 0 20px rgba(0,0,0,0.4)' : '-4px 0 20px rgba(0,0,0,0.15)') : 'none',
          zIndex: 1001,
          transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease, background 0.3s ease',
          borderLeft: darkMode ? '1px solid #2D293C' : '1px solid #e9ecef'
        }}
      >
        {/* Menu Header */}
        <div style={{
          padding: '20px',
          borderBottom: darkMode ? '1px solid #2D293C' : '1px solid #e9ecef',
          background: darkMode ? '#252034' : '#f8f9fa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 'bold', color: darkMode ? '#EDECF3' : '#333', marginBottom: '8px', fontSize: '14px' }}>
              {user?.email}
            </div>
            <div style={{ 
              fontSize: '11px', 
              color: '#fff', 
              textTransform: 'uppercase',
              fontWeight: '600',
              padding: '4px 10px',
              background: user?.role === 'admin' ? '#D4AF37' : '#6c757d',
              borderRadius: '12px',
              display: 'inline-block',
              letterSpacing: '0.5px'
            }}>
              {user?.role}
            </div>
          </div>
          <button
            onClick={() => setShowUserMenu(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '4px',
              color: darkMode ? '#8E8AA6' : '#6c757d',
              fontSize: '16px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = darkMode ? '#2D293C' : '#e9ecef';
              (e.target as HTMLElement).style.color = darkMode ? '#EDECF3' : '#333';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
              (e.target as HTMLElement).style.color = darkMode ? '#8E8AA6' : '#6c757d';
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Menu Items */}
        <div style={{ padding: '20px 0' }}>
          <button
            onClick={handleProfileClick}
            style={{
              width: '100%',
              padding: '16px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              color: darkMode ? '#EDECF3' : '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <FaUserCog style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
            Profile Settings
          </button>

          <button
            onClick={() => {
              setShowUserMenu(false);
              handleTopNavigation('strategic_goals');
            }}
            style={{
              width: '100%',
              padding: '16px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              color: darkMode ? '#EDECF3' : '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <FaCog style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
            Manage Goals
          </button>

          {/* Hide Animation Toggle */}
          <div style={{
            width: '100%',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: darkMode ? '1px solid #2D293C' : '1px solid #e9ecef'
          }}>
            <span style={{ fontSize: '14px', color: darkMode ? '#EDECF3' : '#333' }}>Hide Dashboard Animation</span>
            <button
              aria-pressed={!!presentation}
              onClick={() => setPresentation(!presentation)}
              style={{
                border: darkMode ? '1px solid #3A3650' : '1px solid #E5E7EB',
                background: presentation ? '#B79546' : (darkMode ? '#252034' : '#fff'),
                width: '40px',
                height: '22px',
                borderRadius: '11px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              <span
                style={{
                  background: presentation ? 'white' : '#77787B',
                  transform: presentation ? 'translateX(18px)' : 'translateX(2px)',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '1px',
                  transition: 'transform 0.2s, background-color 0.2s',
                  display: 'block'
                }}
              />
            </button>
          </div>

          {/* Dark Mode Toggle */}
          <div style={{
            width: '100%',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: darkMode ? '1px solid #2D293C' : '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FaMoon style={{ fontSize: '16px', color: darkMode ? '#B79546' : '#6c757d' }} />
              <span style={{ fontSize: '14px', color: darkMode ? '#EDECF3' : '#333' }}>Dark Mode</span>
            </div>
            <button
              aria-pressed={!!darkMode}
              onClick={() => setDarkMode(!darkMode)}
              style={{
                border: darkMode ? '1px solid #3A3650' : '1px solid #E5E7EB',
                background: darkMode ? '#B79546' : '#fff',
                width: '40px',
                height: '22px',
                borderRadius: '11px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              <span
                style={{
                  background: darkMode ? 'white' : '#77787B',
                  transform: darkMode ? 'translateX(18px)' : 'translateX(2px)',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '1px',
                  transition: 'transform 0.2s, background-color 0.2s',
                  display: 'block'
                }}
              />
            </button>
          </div>

          {/* Show Initiatives Toggle */}
          <div style={{
            width: '100%',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: darkMode ? '1px solid #2D293C' : '1px solid #e9ecef'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FaChartPie style={{ fontSize: '16px', color: darkMode ? (goalDisplayMode === 'initiatives' ? '#B79546' : '#8E8AA6') : '#6c757d' }} />
              <span style={{ fontSize: '14px', color: darkMode ? '#EDECF3' : '#333' }}>Show Initiatives</span>
            </div>
            <button
              aria-pressed={goalDisplayMode === 'initiatives'}
              onClick={handleToggleGoalDisplayMode}
              style={{
                border: darkMode ? '1px solid #3A3650' : '1px solid #E5E7EB',
                background: goalDisplayMode === 'initiatives' ? '#B79546' : (darkMode ? '#252034' : '#fff'),
                width: '40px',
                height: '22px',
                borderRadius: '11px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              <span
                style={{
                  background: goalDisplayMode === 'initiatives' ? 'white' : '#77787B',
                  transform: goalDisplayMode === 'initiatives' ? 'translateX(18px)' : 'translateX(2px)',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '1px',
                  transition: 'transform 0.2s, background-color 0.2s',
                  display: 'block'
                }}
              />
            </button>
          </div>

          <button
            onClick={handleAuditLogClick}
            style={{
              width: '100%',
              padding: '16px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              color: darkMode ? '#EDECF3' : '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <FaClipboardList style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
            Audit Log
          </button>
                    <button
            onClick={() => {
              setShowUserMenu(false);
              setShowArtifactsBrowser(true);
            }}
            style={{
              width: '100%',
              padding: '16px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              color: darkMode ? '#EDECF3' : '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <FaFileDownload style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
            Artifacts Browser
          </button>
          {isAdmin && (
            <>
              <button
                onClick={handleImportExportClick}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: darkMode ? '#EDECF3' : '#333',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
              >
                <FaCog style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
                Import/Export Management
              </button>
              <button
                onClick={handleReferenceDataClick}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: darkMode ? '#EDECF3' : '#333',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
              >
                <FaDatabase style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
                Manage References
              </button>
              <button
                onClick={handleDomainManagementClick}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: darkMode ? '#EDECF3' : '#333',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
              >
                <FaGlobe style={{ fontSize: '16px', color: darkMode ? '#8E8AA6' : '#6c757d' }} />
                Domain Management
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '16px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '14px',
              color: '#dc3545',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.backgroundColor = darkMode ? '#252034' : '#f8f9fa'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.backgroundColor = 'transparent'}
          >
            <FaSignOutAlt style={{ fontSize: '16px' }} />
            Logout
          </button>

          {/* Version Tag */}
          <div style={{
            padding: '20px',
            display: 'flex',
            justifyContent: 'center',
            marginTop: 'auto'
          }}>
            <div style={{
              background: darkMode ? '#252034' : '#e9ecef',
              color: darkMode ? '#8E8AA6' : '#6c757d',
              fontSize: '11px',
              fontWeight: '500',
              padding: '4px 12px',
              borderRadius: '12px',
              display: 'inline-block'
            }}>
              Voyagers v1.0
            </div>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {showUserMenu && (
        <div
          onClick={() => setShowUserMenu(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: showUserMenu ? '300px' : '0',
            bottom: 0,
            background: darkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
            zIndex: 1000,
            transition: 'all 0.3s ease',
            opacity: showUserMenu ? 1 : 0
          }}
        />
      )}

      {/* Artifacts Browser Modal */}
      <ArtifactsBrowser
        isOpen={showArtifactsBrowser}
        onClose={() => setShowArtifactsBrowser(false)}
      />
    </div>
  );
}

export default App;
