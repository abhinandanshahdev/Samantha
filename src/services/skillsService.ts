/**
 * Skills Service
 *
 * Frontend service for interacting with the Skills API.
 */

const API_BASE = '/api/skills';

export interface Skill {
  name: string;
  displayTitle: string;
  description: string;
  triggers: string[];
  path?: string;
  content?: string;
}

export interface SkillFile {
  name: string;
  path: string;
}

/**
 * List all available skills
 */
export const listSkills = async (): Promise<Skill[]> => {
  const response = await fetch(API_BASE);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to list skills');
  }

  return data.skills;
};

/**
 * Get a specific skill's details including full content
 */
export const getSkill = async (name: string): Promise<Skill> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(name)}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to get skill');
  }

  return data.skill;
};

/**
 * Get files in a skill's directory
 */
export const getSkillFiles = async (name: string): Promise<SkillFile[]> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(name)}/files`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to get skill files');
  }

  return data.files;
};

/**
 * Read a specific file from a skill
 */
export const readSkillFile = async (skillName: string, fileName: string): Promise<string> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(skillName)}/files/${fileName}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to read skill file');
  }

  return data.content;
};

/**
 * Create a new skill
 */
export const createSkill = async (
  name: string,
  content: string,
  displayTitle?: string
): Promise<Skill> => {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, content, displayTitle }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to create skill');
  }

  return data.skill;
};

/**
 * Update an existing skill
 */
export const updateSkill = async (name: string, content: string): Promise<Skill> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to update skill');
  }

  return data.skill;
};

/**
 * Delete a skill
 */
export const deleteSkill = async (name: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to delete skill');
  }
};

/**
 * Detect which skills would be triggered by a query
 */
export const detectSkills = async (query: string): Promise<Skill[]> => {
  const response = await fetch(`${API_BASE}/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to detect skills');
  }

  return data.matchedSkills;
};

export default {
  listSkills,
  getSkill,
  getSkillFiles,
  readSkillFile,
  createSkill,
  updateSkill,
  deleteSkill,
  detectSkills,
};
