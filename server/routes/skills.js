/**
 * Skills Routes
 *
 * API endpoints for managing Claude Skills in Hekmah.
 */

const express = require('express');
const router = express.Router();
const skillService = require('../services/skillService');

/**
 * GET /api/skills
 * List all available skills
 */
router.get('/', async (req, res) => {
  try {
    const skills = await skillService.listSkills();
    res.json({
      success: true,
      skills: skills,
      count: skills.length
    });
  } catch (error) {
    console.error('Error listing skills:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list skills',
      message: error.message
    });
  }
});

/**
 * GET /api/skills/:name
 * Get a specific skill's details
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const skill = await skillService.loadSkill(name);

    res.json({
      success: true,
      skill: {
        name: skill.name,
        displayTitle: skill.displayTitle,
        description: skill.description,
        triggers: skill.triggers,
        content: skill.content
      }
    });
  } catch (error) {
    console.error('Error loading skill:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to load skill',
      message: error.message
    });
  }
});

/**
 * GET /api/skills/:name/files
 * List files in a skill's directory
 */
router.get('/:name/files', async (req, res) => {
  try {
    const { name } = req.params;
    const files = await skillService.getSkillFiles(name);

    res.json({
      success: true,
      skillName: name,
      files: files
    });
  } catch (error) {
    console.error('Error listing skill files:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to list skill files',
      message: error.message
    });
  }
});

/**
 * GET /api/skills/:name/files/:fileName
 * Read a specific file from a skill
 */
router.get('/:name/files/*', async (req, res) => {
  try {
    const { name } = req.params;
    const fileName = req.params[0]; // Capture the rest of the path

    const { content, path } = await skillService.readSkillFile(name, fileName);

    res.json({
      success: true,
      skillName: name,
      fileName: fileName,
      content: content
    });
  } catch (error) {
    console.error('Error reading skill file:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to read skill file',
      message: error.message
    });
  }
});

/**
 * POST /api/skills
 * Create a new skill
 */
router.post('/', async (req, res) => {
  try {
    const { name, content, displayTitle } = req.body;

    if (!name || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Both name and content are required'
      });
    }

    // Validate skill name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid skill name',
        message: 'Skill name can only contain letters, numbers, hyphens, and underscores'
      });
    }

    const skill = await skillService.createSkill(name, content, displayTitle);

    res.status(201).json({
      success: true,
      message: 'Skill created successfully',
      skill: {
        name: skill.name,
        displayTitle: skill.displayTitle,
        description: skill.description,
        triggers: skill.triggers
      }
    });
  } catch (error) {
    console.error('Error creating skill:', error);

    if (error.code === 'EEXIST') {
      return res.status(409).json({
        success: false,
        error: 'Skill already exists',
        message: `A skill named '${req.body.name}' already exists`
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create skill',
      message: error.message
    });
  }
});

/**
 * PUT /api/skills/:name
 * Update an existing skill
 */
router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'Content is required'
      });
    }

    const skill = await skillService.updateSkill(name, content);

    res.json({
      success: true,
      message: 'Skill updated successfully',
      skill: {
        name: skill.name,
        displayTitle: skill.displayTitle,
        description: skill.description,
        triggers: skill.triggers
      }
    });
  } catch (error) {
    console.error('Error updating skill:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update skill',
      message: error.message
    });
  }
});

/**
 * DELETE /api/skills/:name
 * Delete a skill
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await skillService.deleteSkill(name);

    res.json({
      success: true,
      message: 'Skill deleted successfully',
      name: result.name
    });
  } catch (error) {
    console.error('Error deleting skill:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete skill',
      message: error.message
    });
  }
});

/**
 * POST /api/skills/detect
 * Detect which skills would be triggered by a query
 */
router.post('/detect', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'Query is required'
      });
    }

    const matchedSkills = await skillService.detectSkillTriggers(query);

    res.json({
      success: true,
      query: query,
      matchedSkills: matchedSkills.map(s => ({
        name: s.name,
        displayTitle: s.displayTitle,
        description: s.description
      }))
    });
  } catch (error) {
    console.error('Error detecting skills:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect skills',
      message: error.message
    });
  }
});

module.exports = router;
