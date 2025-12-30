/**
 * Skill Service
 *
 * Manages Claude Skills for the Hekmah platform.
 * Skills are organized folders containing SKILL.md instruction files
 * and optional templates, examples, and scripts.
 */

const fs = require('fs').promises;
const path = require('path');

// Skills directory location
const SKILLS_DIR = path.join(__dirname, '../skills');

/**
 * Ensure skills directory exists (for Docker/container environments)
 */
const ensureSkillsDir = async () => {
  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('Failed to create skills directory:', err);
    }
  }
};

// Initialize skills directory on module load
ensureSkillsDir().catch(err => console.error('Skills dir init error:', err));

/**
 * Skill metadata structure
 */
class Skill {
  constructor(name, content, metadata = {}) {
    this.name = name;
    this.content = content;
    this.displayTitle = metadata.displayTitle || name;
    this.description = metadata.description || '';
    this.triggers = metadata.triggers || [];
    this.isActive = false;
    this.loadedAt = null;
  }
}

/**
 * Parse YAML frontmatter from skill content
 */
const parseYamlFrontmatter = (content) => {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) return null;

  const frontmatter = {};
  const lines = frontmatterMatch[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return frontmatter;
};

/**
 * Parse SKILL.md content to extract metadata
 * Supports both YAML frontmatter and markdown section parsing
 */
const parseSkillMetadata = (content, skillName) => {
  const metadata = {
    displayTitle: skillName,
    description: '',
    triggers: []
  };

  // First try YAML frontmatter
  const frontmatter = parseYamlFrontmatter(content);
  if (frontmatter) {
    if (frontmatter.name) {
      metadata.displayTitle = frontmatter.name;
    }
    if (frontmatter.description) {
      metadata.description = frontmatter.description;
    }
    if (frontmatter.triggers) {
      // Handle comma-separated or array triggers
      metadata.triggers = frontmatter.triggers.split(',').map(t => t.trim());
    }
  }

  // Fallback to markdown parsing if no frontmatter or missing fields
  if (!frontmatter || !frontmatter.name) {
    // Extract title from first H1
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      metadata.displayTitle = titleMatch[1].trim();
    }
  }

  if (!frontmatter || !frontmatter.description) {
    // Extract description from ## Description section
    const descMatch = content.match(/##\s+Description\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (descMatch) {
      metadata.description = descMatch[1].trim().split('\n')[0]; // First line only
    }
  }

  // Extract activation triggers from markdown if not in frontmatter
  if (metadata.triggers.length === 0) {
    const triggerMatch = content.match(/##\s+Activation Triggers?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (triggerMatch) {
      const triggerLines = triggerMatch[1].trim().split('\n');
      metadata.triggers = triggerLines
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('"'))
        .map(line => line.replace(/^[\s-]*["']?/, '').replace(/["']?[\s.]*$/, '').trim())
        .filter(t => t.length > 0);
    }
  }

  return metadata;
};

/**
 * List all available skills
 */
const listSkills = async () => {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
        try {
          const content = await fs.readFile(skillPath, 'utf-8');
          const metadata = parseSkillMetadata(content, entry.name);
          skills.push({
            name: entry.name,
            displayTitle: metadata.displayTitle,
            description: metadata.description,
            triggers: metadata.triggers,
            path: skillPath
          });
        } catch (err) {
          // Skill directory exists but no SKILL.md - skip
          console.warn(`Skill directory ${entry.name} missing SKILL.md`);
        }
      }
    }

    return skills;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Skills directory doesn't exist yet
      return [];
    }
    throw err;
  }
};

/**
 * Load a specific skill by name
 */
const loadSkill = async (skillName) => {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

  try {
    const content = await fs.readFile(skillPath, 'utf-8');
    const metadata = parseSkillMetadata(content, skillName);

    return new Skill(skillName, content, metadata);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Skill '${skillName}' not found`);
    }
    throw err;
  }
};

/**
 * Get skill content as system prompt addition
 */
const getSkillPrompt = async (skillName) => {
  const skill = await loadSkill(skillName);

  return `
<skill name="${skill.name}">
${skill.content}
</skill>

When the user's request matches this skill's capabilities, follow the instructions in the skill above.
`;
};

/**
 * Load multiple skills and combine their prompts
 */
const getMultiSkillPrompt = async (skillNames) => {
  const prompts = await Promise.all(
    skillNames.map(name => getSkillPrompt(name))
  );

  return prompts.join('\n\n');
};

/**
 * Check if a user message matches any skill triggers
 */
const detectSkillTriggers = async (userMessage) => {
  const skills = await listSkills();
  const matchedSkills = [];
  const lowerMessage = userMessage.toLowerCase();

  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      // Simple substring matching for triggers
      const lowerTrigger = trigger.toLowerCase()
        .replace('...', '')
        .replace(/['"]/g, '')
        .trim();

      if (lowerMessage.includes(lowerTrigger) ||
          lowerTrigger.split(' ').every(word => lowerMessage.includes(word))) {
        matchedSkills.push(skill);
        break; // Only match each skill once
      }
    }
  }

  return matchedSkills;
};

/**
 * Get list of files in a skill's directory
 */
const getSkillFiles = async (skillName) => {
  const skillDir = path.join(SKILLS_DIR, skillName);

  try {
    const files = await fs.readdir(skillDir, { withFileTypes: true });
    const fileList = [];

    for (const file of files) {
      if (file.isFile()) {
        fileList.push({
          name: file.name,
          path: path.join(skillDir, file.name)
        });
      } else if (file.isDirectory()) {
        // Recurse into subdirectories
        const subFiles = await getSkillFilesRecursive(path.join(skillDir, file.name), file.name);
        fileList.push(...subFiles);
      }
    }

    return fileList;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Skill '${skillName}' not found`);
    }
    throw err;
  }
};

const getSkillFilesRecursive = async (dirPath, prefix) => {
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  const fileList = [];

  for (const file of files) {
    const relativePath = `${prefix}/${file.name}`;
    if (file.isFile()) {
      fileList.push({
        name: relativePath,
        path: path.join(dirPath, file.name)
      });
    } else if (file.isDirectory()) {
      const subFiles = await getSkillFilesRecursive(
        path.join(dirPath, file.name),
        relativePath
      );
      fileList.push(...subFiles);
    }
  }

  return fileList;
};

/**
 * Read a specific file from a skill
 */
const readSkillFile = async (skillName, fileName) => {
  const filePath = path.join(SKILLS_DIR, skillName, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, path: filePath };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`File '${fileName}' not found in skill '${skillName}'`);
    }
    throw err;
  }
};

/**
 * Create a new skill
 */
const createSkill = async (skillName, skillContent, displayTitle = null) => {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');

  // Create skill directory
  await fs.mkdir(skillDir, { recursive: true });

  // Write SKILL.md
  await fs.writeFile(skillPath, skillContent, 'utf-8');

  return await loadSkill(skillName);
};

/**
 * Update an existing skill
 */
const updateSkill = async (skillName, skillContent) => {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

  // Verify skill exists
  try {
    await fs.access(skillPath);
  } catch {
    throw new Error(`Skill '${skillName}' not found`);
  }

  // Update SKILL.md
  await fs.writeFile(skillPath, skillContent, 'utf-8');

  return await loadSkill(skillName);
};

/**
 * Delete a skill
 */
const deleteSkill = async (skillName) => {
  const skillDir = path.join(SKILLS_DIR, skillName);

  try {
    await fs.rm(skillDir, { recursive: true });
    return { success: true, name: skillName };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Skill '${skillName}' not found`);
    }
    throw err;
  }
};

module.exports = {
  listSkills,
  loadSkill,
  getSkillPrompt,
  getMultiSkillPrompt,
  detectSkillTriggers,
  getSkillFiles,
  readSkillFile,
  createSkill,
  updateSkill,
  deleteSkill,
  SKILLS_DIR
};
