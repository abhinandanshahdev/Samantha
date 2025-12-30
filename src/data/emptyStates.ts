import { UseCase, Category, Department } from '../types';

export const emptyUseCases: UseCase[] = [];

export const emptyCategories: Category[] = [];

export const emptyDepartments: Department[] = [];

// Empty state messages
export const emptyStateMessages = {
  useCases: {
    title: "No Initiatives Found",
    message: "Get started by creating your first initiative.",
    actionText: "Create Initiative"
  },
  filteredUseCases: {
    title: "No Results Found",
    message: "Try adjusting your filters or search terms.",
    actionText: "Clear Filters"
  },
  categories: {
    title: "No Categories Available",
    message: "Categories help organize your initiatives.",
    actionText: "Add Category"
  },
  departments: {
    title: "No Departments Available",
    message: "Departments help track initiatives by organization.",
    actionText: "Add Department"
  },
  noAgents: {
    title: "No Agents Found",
    message: "Get started by creating your first agent.",
    actionText: "Create Agent"
  },
  filteredAgents: {
    title: "No Agents Found",
    message: "Try adjusting your filters or search terms.",
    actionText: "Clear Filters"
  },
  agentTypes: {
    title: "No Agent Types Available",
    message: "Agent types help categorize your agents.",
    actionText: "Add Agent Type"
  }
};