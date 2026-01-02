import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaSave, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { categoryAPI } from '../../services/apiService';
import { Category } from '../../types';
import { useDomain } from '../../context/DomainContext';
import './ReferenceDataManagement.css';

interface ReferenceDataManagementProps {
  onBack: () => void;
}

const ReferenceDataManagement: React.FC<ReferenceDataManagementProps> = ({ onBack }) => {
  const { activeDomain } = useDomain();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<string | number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const loadData = useCallback(async () => {
    if (!activeDomain) {
      console.warn('No active domain selected');
      return;
    }

    setLoading(true);
    try {
      const data = await categoryAPI.getAll(activeDomain.id);
      setCategories(data as Category[]);
    } catch (error) {
      console.error('Error loading categories:', error);
      alert('Failed to load categories. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeDomain]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    if (!activeDomain) {
      alert('No active domain selected');
      return;
    }

    try {
      await categoryAPI.create({
        name: formData.name.trim(),
        description: formData.description.trim(),
        domain_id: activeDomain.id
      });

      setFormData({ name: '', description: '' });
      setIsCreating(false);
      loadData();
    } catch (error) {
      console.error('Error creating category:', error);
      alert(`Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleUpdate = async (id: string | number) => {
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    try {
      await categoryAPI.update(id.toString(), {
        name: formData.name.trim(),
        description: formData.description.trim()
      });

      setEditingItem(null);
      setFormData({ name: '', description: '' });
      loadData();
    } catch (error) {
      console.error('Error updating category:', error);
      alert(`Failed to update category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string | number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await categoryAPI.delete(id.toString());
      loadData();
    } catch (error) {
      console.error('Error deleting category:', error);
      alert(`Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const startEdit = (item: Category) => {
    setEditingItem(item.id);
    setFormData({
      name: item.name,
      description: item.description || ''
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setIsCreating(false);
    setFormData({ name: '', description: '' });
  };

  const startCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', description: '' });
  };

  return (
    <div className="reference-data-management">
      <div className="reference-header">
        <button className="back-button" onClick={onBack}>
          <FaArrowLeft />
          Back
        </button>
        <h1>Manage Categories</h1>
      </div>

      <div className="reference-content">
        <div className="content-header">
          <h2>Categories</h2>
          {!isCreating && (
            <button className="create-button" onClick={startCreate}>
              <FaPlus />
              Add Category
            </button>
          )}
        </div>

        {loading && (
          <div className="loading">Loading categories...</div>
        )}

        {isCreating && (
          <div className="edit-form create-form">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter category name"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter category description"
                rows={3}
              />
            </div>
            <div className="form-actions">
              <button className="save-button" onClick={handleCreate}>
                <FaSave />
                Create
              </button>
              <button className="cancel-button" onClick={cancelEdit}>
                <FaTimes />
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="data-list">
          {categories.map((cat) => (
            <div key={cat.id} className="data-item">
              {editingItem === cat.id ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="save-button" onClick={() => handleUpdate(cat.id)}>
                      <FaSave />
                      Save
                    </button>
                    <button className="cancel-button" onClick={cancelEdit}>
                      <FaTimes />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="item-content">
                  <div className="item-info">
                    <h3>{cat.name}</h3>
                    {cat.description && <p className="item-description">{cat.description}</p>}
                  </div>
                  <div className="item-actions">
                    <button
                      className="edit-button"
                      onClick={() => startEdit(cat)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(cat.id, cat.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {!loading && categories.length === 0 && (
          <div className="empty-state">
            <p>No categories found. Click "Add Category" to create one.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferenceDataManagement;
