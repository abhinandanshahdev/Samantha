import React, { useState, useEffect, useRef } from 'react';
import { Book, Check, ChevronDown, ChevronUp, Sparkles, X, Paperclip, Upload } from 'lucide-react';
import { listSkills, getSkill, createSkill, Skill } from '../../services/skillsService';
import './SkillsBrowser.css';

interface SkillsBrowserProps {
  activeSkills: string[];
  onSkillToggle: (skillName: string, isActive: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
}

const SkillsBrowser: React.FC<SkillsBrowserProps> = ({
  activeSkills,
  onSkillToggle,
  isOpen,
  onClose
}) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillDetails, setSkillDetails] = useState<{ [key: string]: Skill }>({});
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadSkills();
    }
  }, [isOpen]);

  const loadSkills = async () => {
    try {
      setLoading(true);
      setError(null);
      const skillList = await listSkills();
      setSkills(skillList);
    } catch (err: any) {
      setError(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (skillName: string) => {
    if (expandedSkill === skillName) {
      setExpandedSkill(null);
      return;
    }

    setExpandedSkill(skillName);

    // Load skill details if not already loaded
    if (!skillDetails[skillName]) {
      try {
        const details = await getSkill(skillName);
        setSkillDetails(prev => ({ ...prev, [skillName]: details }));
      } catch (err) {
        console.error('Failed to load skill details:', err);
      }
    }
  };

  const handleToggle = (skillName: string) => {
    const isCurrentlyActive = activeSkills.includes(skillName);
    onSkillToggle(skillName, !isCurrentlyActive);
  };

  const handleAttachSkill = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type (markdown only)
    if (!file.name.endsWith('.md')) {
      setError('Please upload a Markdown (.md) file');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setUploadSuccess(null);

      // Read file content
      const content = await file.text();

      // Extract skill name from filename (remove .md extension)
      const skillName = file.name.replace(/\.md$/i, '').toLowerCase().replace(/\s+/g, '-');

      // Extract display title from first H1 in markdown or use filename
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const displayTitle = titleMatch ? titleMatch[1] : file.name.replace(/\.md$/i, '');

      // Create the skill
      await createSkill(skillName, content, displayTitle);

      // Reload skills list
      await loadSkills();

      setUploadSuccess(`Skill "${displayTitle}" added successfully!`);
      setTimeout(() => setUploadSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to upload skill');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="skills-browser-backdrop" onClick={onClose}>
      <div className="skills-browser-container" onClick={e => e.stopPropagation()}>
        <div className="skills-browser-header">
          <div className="skills-browser-title">
            <Book size={18} />
            <span>Samantha Skills</span>
          </div>
          <div className="skills-browser-header-actions">
            <button
              className="skills-attach-btn"
              onClick={handleAttachSkill}
              disabled={uploading}
              title="Attach a new skill (.md file)"
            >
              {uploading ? (
                <><Upload size={14} className="spinning" /> Uploading...</>
              ) : (
                <><Paperclip size={14} /> Attach Skill</>
              )}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".md"
              style={{ display: 'none' }}
            />
            <button className="skills-browser-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="skills-browser-content">
          {uploadSuccess && (
            <div className="skills-browser-success">
              <Check size={16} />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {loading && (
            <div className="skills-browser-loading">
              <div className="spinner"></div>
              <p>Loading skills...</p>
            </div>
          )}

          {error && (
            <div className="skills-browser-error">
              <p>{error}</p>
              <button onClick={loadSkills}>Retry</button>
            </div>
          )}

          {!loading && !error && skills.length === 0 && (
            <div className="skills-browser-empty">
              <Sparkles size={32} />
              <p>No skills available</p>
              <span>Skills extend Claude's capabilities with specialized instructions.</span>
            </div>
          )}

          {!loading && !error && skills.length > 0 && (
            <div className="skills-browser-list">
              {skills.map(skill => {
                const isActive = activeSkills.includes(skill.name);
                const isExpanded = expandedSkill === skill.name;
                const details = skillDetails[skill.name];

                return (
                  <div
                    key={skill.name}
                    className={`skill-card ${isActive ? 'active' : ''}`}
                  >
                    <div className="skill-card-header" onClick={() => toggleExpand(skill.name)}>
                      <div className="skill-card-info">
                        <div className="skill-card-title">
                          <Sparkles size={14} className="skill-icon" />
                          <span>{skill.displayTitle}</span>
                          {isActive && (
                            <span className="skill-active-badge">
                              <Check size={10} /> Active
                            </span>
                          )}
                        </div>
                        <p className="skill-card-description">{skill.description}</p>
                      </div>
                      <div className="skill-card-actions">
                        <button
                          className={`skill-toggle-btn ${isActive ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(skill.name);
                          }}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="skill-expand-btn">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="skill-card-details">
                        {skill.triggers.length > 0 && (
                          <div className="skill-triggers">
                            <strong>Triggers:</strong>
                            <ul>
                              {skill.triggers.map((trigger, idx) => (
                                <li key={idx}>"{trigger}"</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {details?.content && (
                          <div className="skill-content-preview">
                            <strong>Instructions Preview:</strong>
                            <pre>{details.content.slice(0, 500)}...</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="skills-browser-footer">
          <span>{activeSkills.length} skill{activeSkills.length !== 1 ? 's' : ''} active</span>
          {activeSkills.length > 0 && (
            <button
              className="skills-clear-all"
              onClick={() => activeSkills.forEach(s => onSkillToggle(s, false))}
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillsBrowser;
