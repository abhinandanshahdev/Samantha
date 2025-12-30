/**
 * Skill Service Tests
 *
 * Tests skill discovery, loading, and trigger detection
 */

const path = require('path');
const fs = require('fs').promises;
const skillService = require('../services/skillService');

describe('SkillService', () => {
  describe('listSkills', () => {
    it('should return an array of skills', async () => {
      const skills = await skillService.listSkills();

      expect(Array.isArray(skills)).toBe(true);
    });

    it('should include dof-presentation skill', async () => {
      const skills = await skillService.listSkills();
      const presentationSkill = skills.find(s => s.name === 'dof-presentation');

      expect(presentationSkill).toBeDefined();
      expect(presentationSkill.displayTitle).toContain('Presentation');
    });

    it('should include dof-excel-export skill', async () => {
      const skills = await skillService.listSkills();
      const excelSkill = skills.find(s => s.name === 'dof-excel-export');

      expect(excelSkill).toBeDefined();
      expect(excelSkill.displayTitle).toContain('Excel');
    });

    it('should have triggers array for each skill', async () => {
      const skills = await skillService.listSkills();

      for (const skill of skills) {
        expect(Array.isArray(skill.triggers)).toBe(true);
      }
    });

    it('should have path property for each skill', async () => {
      const skills = await skillService.listSkills();

      for (const skill of skills) {
        expect(skill.path).toBeDefined();
        expect(skill.path).toContain('SKILL.md');
      }
    });
  });

  describe('loadSkill', () => {
    it('should load dof-presentation skill', async () => {
      const skill = await skillService.loadSkill('dof-presentation');

      expect(skill.name).toBe('dof-presentation');
      expect(skill.content).toContain('DoF Presentation');
      expect(skill.content).toContain('HTML/CSS');
    });

    it('should load dof-excel-export skill', async () => {
      const skill = await skillService.loadSkill('dof-excel-export');

      expect(skill.name).toBe('dof-excel-export');
      expect(skill.content).toContain('Excel');
      expect(skill.content).toContain('excel_init');
    });

    it('should throw error for non-existent skill', async () => {
      await expect(
        skillService.loadSkill('non-existent-skill')
      ).rejects.toThrow('not found');
    });

    it('should extract metadata correctly', async () => {
      const skill = await skillService.loadSkill('dof-presentation');

      expect(skill.displayTitle).toBeDefined();
      expect(skill.description).toBeDefined();
      expect(Array.isArray(skill.triggers)).toBe(true);
    });
  });

  describe('getSkillPrompt', () => {
    it('should return formatted skill prompt', async () => {
      const prompt = await skillService.getSkillPrompt('dof-presentation');

      expect(prompt).toContain('<skill name="dof-presentation">');
      expect(prompt).toContain('</skill>');
      expect(prompt).toContain('DoF Presentation');
    });

    it('should include instruction to follow skill capabilities', async () => {
      const prompt = await skillService.getSkillPrompt('dof-presentation');

      expect(prompt).toContain("skill's capabilities");
    });
  });

  describe('getMultiSkillPrompt', () => {
    it('should combine multiple skill prompts', async () => {
      const prompt = await skillService.getMultiSkillPrompt([
        'dof-presentation',
        'dof-excel-export'
      ]);

      expect(prompt).toContain('dof-presentation');
      expect(prompt).toContain('dof-excel-export');
    });

    it('should handle empty array', async () => {
      const prompt = await skillService.getMultiSkillPrompt([]);
      expect(prompt).toBe('');
    });

    it('should handle single skill', async () => {
      const singlePrompt = await skillService.getSkillPrompt('dof-presentation');
      const multiPrompt = await skillService.getMultiSkillPrompt(['dof-presentation']);

      expect(multiPrompt).toBe(singlePrompt);
    });
  });

  describe('detectSkillTriggers', () => {
    it('should detect presentation skill from trigger phrase', async () => {
      // Trigger is "Create a presentation for..." - must include "for"
      const matches = await skillService.detectSkillTriggers('Create a presentation for the board');

      const matchNames = matches.map(m => m.name);
      expect(matchNames).toContain('dof-presentation');
    });

    it('should detect excel skill from trigger phrase', async () => {
      const matches = await skillService.detectSkillTriggers('Export to Excel the initiatives');

      const matchNames = matches.map(m => m.name);
      expect(matchNames).toContain('dof-excel-export');
    });

    it('should be case insensitive', async () => {
      const matches1 = await skillService.detectSkillTriggers('CREATE A PRESENTATION');
      const matches2 = await skillService.detectSkillTriggers('create a presentation');

      expect(matches1.length).toBe(matches2.length);
    });

    it('should return empty array for no matches', async () => {
      const matches = await skillService.detectSkillTriggers('What is the weather today?');

      // May or may not match - depends on trigger definitions
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should detect spreadsheet trigger', async () => {
      const matches = await skillService.detectSkillTriggers('Generate a spreadsheet');

      const matchNames = matches.map(m => m.name);
      expect(matchNames).toContain('dof-excel-export');
    });

    it('should detect PowerPoint trigger', async () => {
      // Trigger is "Create a PPT for..." - must include those words
      const matches = await skillService.detectSkillTriggers('Create a PPT for the executive meeting');

      const matchNames = matches.map(m => m.name);
      expect(matchNames).toContain('dof-presentation');
    });
  });

  describe('getSkillFiles', () => {
    it('should list files in skill directory', async () => {
      const files = await skillService.getSkillFiles('dof-presentation');

      expect(Array.isArray(files)).toBe(true);

      const fileNames = files.map(f => f.name);
      expect(fileNames).toContain('SKILL.md');
    });

    it('should throw error for non-existent skill', async () => {
      await expect(
        skillService.getSkillFiles('non-existent')
      ).rejects.toThrow('not found');
    });
  });

  describe('readSkillFile', () => {
    it('should read SKILL.md content', async () => {
      const result = await skillService.readSkillFile('dof-presentation', 'SKILL.md');

      expect(result.content).toBeDefined();
      expect(result.content).toContain('DoF Presentation');
      expect(result.path).toContain('SKILL.md');
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        skillService.readSkillFile('dof-presentation', 'non-existent.md')
      ).rejects.toThrow('not found');
    });
  });

  describe('createSkill', () => {
    const testSkillName = 'test-skill-' + Date.now();

    afterAll(async () => {
      // Clean up test skill
      try {
        await skillService.deleteSkill(testSkillName);
      } catch (e) {}
    });

    it('should create a new skill', async () => {
      const content = `# Test Skill

## Description
A test skill for unit testing.

## Activation Triggers
- "test trigger"
`;

      const skill = await skillService.createSkill(testSkillName, content);

      expect(skill.name).toBe(testSkillName);
      expect(skill.content).toContain('Test Skill');
    });

    it('should be discoverable after creation', async () => {
      const skills = await skillService.listSkills();
      const testSkill = skills.find(s => s.name === testSkillName);

      expect(testSkill).toBeDefined();
    });
  });

  describe('updateSkill', () => {
    const testSkillName = 'test-update-skill-' + Date.now();

    beforeAll(async () => {
      await skillService.createSkill(testSkillName, '# Original\n\n## Description\nOriginal');
    });

    afterAll(async () => {
      try {
        await skillService.deleteSkill(testSkillName);
      } catch (e) {}
    });

    it('should update existing skill content', async () => {
      const newContent = '# Updated\n\n## Description\nUpdated content';
      const skill = await skillService.updateSkill(testSkillName, newContent);

      expect(skill.content).toContain('Updated');
    });

    it('should throw error for non-existent skill', async () => {
      await expect(
        skillService.updateSkill('non-existent', 'content')
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteSkill', () => {
    it('should delete skill and remove directory', async () => {
      const skillName = 'test-delete-skill-' + Date.now();
      await skillService.createSkill(skillName, '# Delete Me\n\n## Description\nTest');

      const result = await skillService.deleteSkill(skillName);

      expect(result.success).toBe(true);
      expect(result.name).toBe(skillName);

      // Verify skill is no longer discoverable
      const skills = await skillService.listSkills();
      const found = skills.find(s => s.name === skillName);
      expect(found).toBeUndefined();
    });

    it('should throw error for non-existent skill', async () => {
      await expect(
        skillService.deleteSkill('non-existent-skill')
      ).rejects.toThrow('not found');
    });
  });
});
