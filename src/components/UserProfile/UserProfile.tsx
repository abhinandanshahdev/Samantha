import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { authAPI } from '../../services/apiService';
import Header from '../Header/Header';
import PhoneVerification from '../PhoneVerification/PhoneVerification';
import { FaUser, FaEdit, FaSave, FaTimes, FaArrowLeft } from 'react-icons/fa';
import './UserProfile.css';

interface UserProfileProps {
  user: User;
  onBack: () => void;
  onUserMenuClick: () => void;
  onUserUpdate: (updatedUser: User) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ 
  user, 
  onBack, 
  onUserMenuClick,
  onUserUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Clear messages after some time
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDisplayName(user.name); // Reset to original value
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    if (displayName === user.name) {
      setIsEditing(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedUser = await authAPI.updateProfile({ name: displayName.trim() });
      onUserUpdate(updatedUser);
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      setError(error.response?.data?.error || 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#6366F1';
      case 'consumer': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="user-profile">
      <Header 
        onSearch={() => {}} 
        onUserMenuClick={onUserMenuClick}
        user={{ name: user.name, role: user.role }}
      />
      
      <div className="profile-container">
        <div className="profile-header">
          <button className="back-button" onClick={onBack}>
            <FaArrowLeft />
            <span>Back to Family Goals</span>
          </button>
        </div>

        <div className="profile-content">
          <div className="profile-card">
            <div className="profile-avatar">
              <FaUser />
            </div>

            <div className="profile-info">
              <div className="profile-field">
                <label>Display Name</label>
                <div className="name-field">
                  {isEditing ? (
                    <div className="edit-name-group">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="name-input"
                        placeholder="Enter your display name"
                        disabled={loading}
                        autoFocus
                        maxLength={100}
                      />
                      <div className="edit-actions">
                        <button 
                          className="save-btn"
                          onClick={handleSave}
                          disabled={loading}
                          title="Save changes (Enter)"
                        >
                          <FaSave />
                        </button>
                        <button 
                          className="cancel-btn"
                          onClick={handleCancel}
                          disabled={loading}
                          title="Cancel changes (Escape)"
                        >
                          <FaTimes />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="display-name-group">
                      <span className="display-name">{user.name}</span>
                      <button 
                        className="edit-btn"
                        onClick={handleEdit}
                        title="Edit display name"
                      >
                        <FaEdit />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="profile-field">
                <label>Email Address</label>
                <div className="field-value readonly">
                  <span>{user.email}</span>
                  <small className="field-note">Email cannot be changed (SSO managed)</small>
                </div>
              </div>

              <div className="profile-field">
                <label>Role</label>
                <div className="field-value">
                  <span 
                    className="role-badge"
                    style={{ backgroundColor: getRoleColor(user.role) }}
                  >
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                  <small className="field-note">Role is assigned by administrators</small>
                </div>
              </div>

              <div className="profile-field">
                <label>Member Since</label>
                <div className="field-value">
                  <span>{formatDate(user.created_date)}</span>
                </div>
              </div>

              <div className="profile-field">
                <label>Email Verified</label>
                <div className="field-value">
                  <span className={`verification-status ${user.email_verified ? 'verified' : 'unverified'}`}>
                    {user.email_verified ? '✓ Verified' : '✗ Not Verified'}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Messages */}
            {error && (
              <div className="message error-message">
                <span>{error}</span>
              </div>
            )}
            
            {success && (
              <div className="message success-message">
                <span>{success}</span>
              </div>
            )}

            {loading && (
              <div className="loading-overlay">
                <div className="loading-spinner"></div>
                <span>Updating profile...</span>
              </div>
            )}
          </div>

          <div className="profile-help">
            <h3>About Your Profile</h3>
            <ul>
              <li><strong>Display Name:</strong> This is how your name appears throughout the application</li>
              <li><strong>Email:</strong> Your email is managed by Single Sign-On (SSO) and cannot be changed here</li>
              <li><strong>Role:</strong> Your role determines what actions you can perform in the system</li>
            </ul>

            <h4>Role Permissions:</h4>
            <ul>
              <li><strong>Viewer:</strong> Can view initiatives and strategic goals</li>
              <li><strong>Contributor:</strong> Can create and edit initiatives and strategic goals</li>
              <li><strong>Admin:</strong> Full access including user management and system settings</li>
            </ul>
          </div>

          {/* Phone Verification / WhatsApp Integration */}
          <PhoneVerification />
        </div>
      </div>
    </div>
  );
};

export default UserProfile;