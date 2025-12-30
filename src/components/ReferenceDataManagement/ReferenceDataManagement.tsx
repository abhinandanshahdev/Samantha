import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaSave, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { departmentAPI, categoryAPI, agentTypeAPI } from '../../services/apiService';
import { Department, Category, AgentType } from '../../types';
import { useDomain } from '../../context/DomainContext';
import './ReferenceDataManagement.css';

interface ReferenceDataManagementProps {
  onBack: () => void;
}

type DataType = 'departments' | 'categories' | 'agent_types';

const ReferenceDataManagement: React.FC<ReferenceDataManagementProps> = ({ onBack }) => {
  const { activeDomain } = useDomain();
  const [activeTab, setActiveTab] = useState<DataType>('departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
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
      if (activeTab === 'departments') {
        const data = await departmentAPI.getAll(activeDomain.id);
        setDepartments(data as Department[]);
      } else if (activeTab === 'categories') {
        const data = await categoryAPI.getAll(activeDomain.id);
        setCategories(data as Category[]);
      } else if (activeTab === 'agent_types') {
        const data = await agentTypeAPI.getAll(activeDomain.id);
        setAgentTypes(data as AgentType[]);
      }
    } catch (error) {
      console.error(`Error loading ${activeTab}:`, error);
      alert(`Failed to load ${activeTab}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, activeDomain]);

  // Load data based on active tab
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
      if (activeTab === 'departments') {
        await departmentAPI.create({
          name: formData.name.trim(),
          domain_id: activeDomain.id
        });
      } else if (activeTab === 'categories') {
        await categoryAPI.create({
          name: formData.name.trim(),
          description: formData.description.trim(),
          domain_id: activeDomain.id
        });
      } else if (activeTab === 'agent_types') {
        await agentTypeAPI.create({
          name: formData.name.trim(),
          description: formData.description.trim(),
          domain_id: activeDomain.id
        });
      }

      setFormData({ name: '', description: '' });
      setIsCreating(false);
      loadData();
    } catch (error) {
      console.error(`Error creating ${activeTab.slice(0, -1)}:`, error);
      alert(`Failed to create ${activeTab.slice(0, -1)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleUpdate = async (id: string | number) => {
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }

    try {
      if (activeTab === 'departments') {
        await departmentAPI.update(id.toString(), { name: formData.name.trim() });
      } else if (activeTab === 'categories') {
        await categoryAPI.update(id.toString(), {
          name: formData.name.trim(),
          description: formData.description.trim()
        });
      } else if (activeTab === 'agent_types') {
        await agentTypeAPI.update(Number(id), {
          name: formData.name.trim(),
          description: formData.description.trim()
        });
      }

      setEditingItem(null);
      setFormData({ name: '', description: '' });
      loadData();
    } catch (error) {
      console.error(`Error updating ${activeTab.slice(0, -1)}:`, error);
      alert(`Failed to update ${activeTab.slice(0, -1)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string | number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (activeTab === 'departments') {
        await departmentAPI.delete(id.toString());
      } else if (activeTab === 'categories') {
        await categoryAPI.delete(id.toString());
      } else if (activeTab === 'agent_types') {
        await agentTypeAPI.delete(Number(id));
      }

      loadData();
    } catch (error) {
      console.error(`Error deleting ${activeTab.slice(0, -1)}:`, error);
      alert(`Failed to delete ${activeTab.slice(0, -1)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const startEdit = (item: Department | Category | AgentType) => {
    setEditingItem(item.id);
    setFormData({
      name: item.name,
      description: 'description' in item ? item.description : ''
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
        <h1>Manage References</h1>
      </div>

      <div className="reference-tabs">
        <button
          className={`tab-button ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          Departments
        </button>
        <button
          className={`tab-button ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
        <button
          className={`tab-button ${activeTab === 'agent_types' ? 'active' : ''}`}
          onClick={() => setActiveTab('agent_types')}
        >
          Agent Types
        </button>
      </div>

      <div className="reference-content">
        <div className="content-header">
          <h2>{activeTab === 'departments' ? 'Departments' : activeTab === 'categories' ? 'Categories' : 'Agent Types'}</h2>
          {!isCreating && (
            <button className="create-button" onClick={startCreate}>
              <FaPlus />
              Add {activeTab === 'departments' ? 'Department' : activeTab === 'categories' ? 'Category' : 'Agent Type'}
            </button>
          )}
        </div>

        {loading && (
          <div className="loading">Loading {activeTab}...</div>
        )}

        {isCreating && (
          <div className="edit-form create-form">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={`Enter ${activeTab === 'departments' ? 'department' : activeTab === 'categories' ? 'category' : 'agent type'} name`}
                autoFocus
              />
            </div>
            {(activeTab === 'categories' || activeTab === 'agent_types') && (
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={`Enter ${activeTab === 'categories' ? 'category' : 'agent type'} description`}
                  rows={3}
                />
              </div>
            )}
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
          {activeTab === 'departments' && departments.map((dept) => (
            <div key={dept.id} className="data-item">
              {editingItem === dept.id ? (
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
                  <div className="form-actions">
                    <button className="save-button" onClick={() => handleUpdate(dept.id)}>
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
                    <h3>{dept.name}</h3>
                  </div>
                  <div className="item-actions">
                    <button
                      className="edit-button"
                      onClick={() => startEdit(dept)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(dept.id, dept.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {activeTab === 'categories' && categories.map((cat) => (
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

          {activeTab === 'agent_types' && agentTypes.map((agentType) => (
            <div key={agentType.id} className="data-item">
              {editingItem === agentType.id ? (
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
                    <button className="save-button" onClick={() => handleUpdate(agentType.id)}>
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
                    <h3>{agentType.name}</h3>
                    {agentType.description && <p className="item-description">{agentType.description}</p>}
                  </div>
                  <div className="item-actions">
                    <button
                      className="edit-button"
                      onClick={() => startEdit(agentType)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(agentType.id, agentType.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {!loading && activeTab === 'departments' && departments.length === 0 && (
          <div className="empty-state">
            <p>No departments found. Click "Add Department" to create one.</p>
          </div>
        )}

        {!loading && activeTab === 'categories' && categories.length === 0 && (
          <div className="empty-state">
            <p>No categories found. Click "Add Category" to create one.</p>
          </div>
        )}

        {!loading && activeTab === 'agent_types' && agentTypes.length === 0 && (
          <div className="empty-state">
            <p>No agent types found. Click "Add Agent Type" to create one.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferenceDataManagement;