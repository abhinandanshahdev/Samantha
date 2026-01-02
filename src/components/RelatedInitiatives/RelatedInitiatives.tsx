import React, { useState, useEffect } from 'react';
import { UseCaseAssociation, UseCase } from '../../types';
import { associationsAPI, useCaseAPI } from '../../services/apiService';
import { useActiveDomainId } from '../../context/DomainContext';
import './RelatedInitiatives.css';

interface RelatedInitiativesProps {
  useCaseId: string;
  currentUseCaseTitle: string;
  onNavigate: (useCaseId: string) => void;
}

const RelatedInitiatives: React.FC<RelatedInitiativesProps> = ({
  useCaseId,
  currentUseCaseTitle,
  onNavigate
}) => {
  const activeDomainId = useActiveDomainId();
  const [associations, setAssociations] = useState<UseCaseAssociation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [allUseCases, setAllUseCases] = useState<UseCase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUseCaseIds, setSelectedUseCaseIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAssociations();
    loadAllUseCases();
  }, [useCaseId, activeDomainId]);

  const loadAssociations = async () => {
    try {
      setLoading(true);
      const fetchedAssociations = await associationsAPI.getAll(useCaseId);
      setAssociations(fetchedAssociations);
    } catch (error) {
      console.error('Failed to load associations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUseCases = async () => {
    try {
      const filters: any = { limit: 1000 };
      if (activeDomainId) {
        filters.domain_id = activeDomainId;
      }
      const useCases = await useCaseAPI.getAll(filters);
      // Filter out the current use case and already associated ones
      setAllUseCases(useCases);
    } catch (error) {
      console.error('Failed to load use cases:', error);
    }
  };

  const handleAddAssociation = async () => {
    if (selectedUseCaseIds.length === 0) return;

    try {
      setSubmitting(true);
      // Add all selected associations
      const promises = selectedUseCaseIds.map(id =>
        associationsAPI.create(useCaseId, id)
      );
      await Promise.all(promises);
      setShowAddForm(false);
      setSelectedUseCaseIds([]);
      setSearchTerm('');
      await loadAssociations();
    } catch (error: any) {
      console.error('Failed to add association:', error);
      const errorMessage = error.response?.data?.error || 'Failed to add association(s)';
      alert(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAssociation = async (associationId: number) => {
    if (!window.confirm('Are you sure you want to remove this association?')) {
      return;
    }

    try {
      await associationsAPI.delete(associationId);
      await loadAssociations();
    } catch (error) {
      console.error('Failed to remove association:', error);
      alert('Failed to remove association. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'intention':
        return '#77787B';
      case 'experimentation':
        return '#9B59B6';
      case 'commitment':
        return '#C68D6D';
      case 'implementation':
        return '#4A90E2';
      case 'integration':
        return '#00A79D';
      case 'blocked':
        return '#E74C3C';
      case 'slow_burner':
        return '#F59E0B';
      case 'de_prioritised':
        return '#9e9e9e';
      case 'on_hold':
        return '#6366F1';
      default:
        return '#77787B';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'intention':
        return 'Intention';
      case 'experimentation':
        return 'Experimentation';
      case 'commitment':
        return 'Commitment';
      case 'implementation':
        return 'Implementation';
      case 'integration':
        return 'Integration';
      case 'blocked':
        return 'Blocked';
      case 'slow_burner':
        return 'Slow Burner';
      case 'de_prioritised':
        return 'De-prioritised';
      case 'on_hold':
        return 'On Hold';
      default:
        return status;
    }
  };

  // Filter available use cases based on search and exclusions
  const availableUseCases = allUseCases.filter(uc => {
    // Exclude current use case
    if (uc.id === useCaseId) return false;

    // Exclude already associated use cases
    if (associations.some(assoc => assoc.use_case_id === uc.id)) return false;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        uc.title.toLowerCase().includes(searchLower) ||
        uc.description.toLowerCase().includes(searchLower) ||
        uc.category.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  if (loading) {
    return <div className="related-loading">Loading related initiatives...</div>;
  }

  return (
    <div className="related-use-cases">
      <div className="related-header">
        <h3 className="related-title">Related Initiatives ({associations.length})</h3>
        <button
          type="button"
          className="related-add-btn"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add Related Initiative'}
        </button>
      </div>

      {showAddForm && (
        <div className="related-add-form">
          <h4>Link a Related Initiative</h4>
          <p className="related-add-description">
            Create bidirectional association with "{currentUseCaseTitle}"
          </p>

          <div className="related-search">
            <input
              type="text"
              placeholder="Search initiatives..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="related-search-input"
            />
          </div>

          <div className="related-select-list">
            {availableUseCases.length === 0 ? (
              <div className="no-available-cases">
                {searchTerm ? 'No initiatives match your search.' : 'No initiatives available to link.'}
              </div>
            ) : (
              availableUseCases.slice(0, 10).map(useCase => (
                <div
                  key={useCase.id}
                  className={`related-select-item ${selectedUseCaseIds.includes(useCase.id) ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedUseCaseIds(prev =>
                      prev.includes(useCase.id)
                        ? prev.filter(id => id !== useCase.id)
                        : [...prev, useCase.id]
                    );
                  }}
                >
                  <div className="related-select-info">
                    <div className="related-select-title">{useCase.title}</div>
                    <div className="related-select-meta">
                      <span className="related-category">{useCase.category}</span>
                      <span
                        className="related-status"
                        style={{ backgroundColor: getStatusColor(useCase.status) }}
                      >
                        {getStatusLabel(useCase.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
            {availableUseCases.length > 10 && (
              <div className="related-more-available">
                ... and {availableUseCases.length - 10} more. Refine your search to see them.
              </div>
            )}
          </div>

          <div className="related-form-actions">
            <button
              type="button"
              onClick={handleAddAssociation}
              disabled={selectedUseCaseIds.length === 0 || submitting}
              className="related-submit-btn"
            >
              {submitting
                ? 'Adding...'
                : selectedUseCaseIds.length > 0
                ? `Add ${selectedUseCaseIds.length} Association${selectedUseCaseIds.length > 1 ? 's' : ''}`
                : 'Add Association'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setSelectedUseCaseIds([]);
                setSearchTerm('');
              }}
              disabled={submitting}
              className="related-cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="related-list">
        {associations.length === 0 ? (
          <div className="no-related">
            No related initiatives yet. Link related initiatives to help users discover connections.
          </div>
        ) : (
          associations.map(association => (
            <div key={association.association_id} className="related-card">
              <div className="related-card-content" onClick={() => onNavigate(association.use_case_id)}>
                <div className="related-card-header">
                  <h4 className="related-card-title">{association.title}</h4>
                  <div className="related-card-badges">
                    <span
                      className="related-status-badge"
                      style={{ backgroundColor: getStatusColor(association.status) }}
                    >
                      {getStatusLabel(association.status)}
                    </span>
                  </div>
                </div>

                <p className="related-card-description">
                  {association.description.substring(0, 150)}
                  {association.description.length > 150 ? '...' : ''}
                </p>

                <div className="related-card-meta">
                  <span className="related-card-category">{association.category}</span>
                </div>
              </div>

              <button
                type="button"
                className="related-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveAssociation(association.association_id);
                }}
                title="Remove association"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RelatedInitiatives;
