import { UseCase, Category } from '../types';

export const emptyUseCases: UseCase[] = [];

export const emptyCategories: Category[] = [];

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
  noTasks: {
    title: "No Tasks Found",
    message: "Get started by creating your first task.",
    actionText: "Create Task"
  },
  filteredTasks: {
    title: "No Tasks Found",
    message: "Try adjusting your filters or search terms.",
    actionText: "Clear Filters"
  }
};