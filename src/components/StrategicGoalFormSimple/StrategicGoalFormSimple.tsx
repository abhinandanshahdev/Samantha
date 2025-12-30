import React, { useState, useEffect } from 'react';
import { StrategicGoal, StrategicPillar } from '../../types';
import { strategicPillarsAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import Header from '../Header/Header';
import { FaArrowLeft, FaSave, FaTimes } from 'react-icons/fa';
import './StrategicGoalFormSimple.css';

interface StrategicGoalFormSimpleProps {
  goal?: StrategicGoal;
  onSave: (goalData: Partial<StrategicGoal>) => void;
  onCancel: () => void;
  isEditing: boolean;
  user?: {
    name: string;
    role: string;
  };
}

const StrategicGoalFormSimple: React.FC<StrategicGoalFormSimpleProps> = ({
  goal,
  onSave,
  onCancel,
  isEditing,
  user
}) => {
  const activeDomainId = useActiveDomainId();
  const [formData, setFormData] = useState<Partial<StrategicGoal>>({
    title: '',
    description: '',
    strategic_pillar_id: 0,
    priority: 'Medium',
    status: 'active',
    completion_percentage: 0,
    display_order: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [strategicPillars, setStrategicPillars] = useState<StrategicPillar[]>([]);

  // Load strategic pillars filtered by active domain
  useEffect(() => {
    const loadStrategicPillars = async () => {
      try {
        const pillars = await strategicPillarsAPI.getAll(activeDomainId);
        setStrategicPillars(pillars);
      } catch (error) {
        console.error('Failed to load strategic pillars:', error);
        setStrategicPillars([]);
      }
    };

    loadStrategicPillars();
  }, [activeDomainId]);

  // Initialize form data for editing
  useEffect(() => {
    if (goal) {
      setFormData({
        title: goal.title,
        description: goal.description,
        strategic_pillar_id: goal.strategic_pillar_id,
        priority: goal.priority,
        status: goal.status,
        completion_percentage: goal.completion_percentage ?? 0,
        display_order: goal.display_order,
      });
    }
  }, [goal]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let parsedValue: string | number = value;

    if (name === 'strategic_pillar_id' || name === 'completion_percentage' || name === 'display_order') {
      parsedValue = parseInt(value) || 0;
    }

    setFormData(prev => ({
      ...prev,
      [name]: parsedValue
    }));

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.description?.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.strategic_pillar_id || formData.strategic_pillar_id === 0) {
      newErrors.strategic_pillar_id = 'Strategic pillar is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSave(formData);
    } catch (error) {
      console.error('Failed to save strategic goal:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="strategic-goal-form-simple">
      <Header 
        onSearch={() => {}} 
        onUserMenuClick={() => {}}
        user={user}
      />
      
      <div className="form-container">
        <div className="form-header">
          <h1>{isEditing ? 'Edit Strategic Goal' : 'Create Strategic Goal'}</h1>
        </div>

        <form onSubmit={handleSubmit} className="goal-form">
          <div className="form-group">
            <label htmlFor="title">Goal Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              className={errors.title ? 'error' : ''}
              placeholder="Enter goal title"
            />
            {errors.title && <span className="error-message">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description *</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className={errors.description ? 'error' : ''}
              placeholder="Describe the strategic goal"
              rows={4}
            />
            {errors.description && <span className="error-message">{errors.description}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="strategic_pillar_id">Strategic Pillar *</label>
            <select
              id="strategic_pillar_id"
              name="strategic_pillar_id"
              value={formData.strategic_pillar_id}
              onChange={handleInputChange}
              className={errors.strategic_pillar_id ? 'error' : ''}
            >
              <option value={0}>Select a strategic pillar</option>
              {strategicPillars.map(pillar => (
                <option key={pillar.id} value={pillar.id}>
                  {pillar.name}
                </option>
              ))}
            </select>
            {errors.strategic_pillar_id && <span className="error-message">{errors.strategic_pillar_id}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="completion_percentage">Completion Percentage</label>
              <input
                type="number"
                id="completion_percentage"
                name="completion_percentage"
                value={formData.completion_percentage}
                onChange={handleInputChange}
                min="0"
                max="100"
                placeholder="0-100"
              />
              <small className="field-hint">Enter a value between 0 and 100</small>
            </div>

            <div className="form-group">
              <label htmlFor="display_order">Display Order</label>
              <input
                type="number"
                id="display_order"
                name="display_order"
                value={formData.display_order}
                onChange={handleInputChange}
                min="0"
                placeholder="0"
              />
              <small className="field-hint">Lower numbers appear first within the pillar</small>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              <FaTimes />
              Cancel
            </button>
            <button
              type="submit"
              className="btn-save"
              disabled={isSubmitting}
            >
              <FaSave />
              {isSubmitting ? 'Saving...' : (isEditing ? 'Update Goal' : 'Create Goal')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StrategicGoalFormSimple;