import React, { useState, useEffect } from 'react';
import { FaArrowLeft, FaUserShield, FaUserCheck, FaUserTimes, FaTrash, FaUsers } from 'react-icons/fa';
import { adminUsersAPI, User } from '../../services/apiService';
import './UserManagement.css';

interface UserManagementProps {
  user?: any;
  onBackToDashboard: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ user, onBackToDashboard }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminUsersAPI.getAll();
      setUsers(data);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      setActionLoading(userId);
      const result = await adminUsersAPI.approve(userId);
      setUsers(users.map(u => u.id === userId ? result.user : u));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (userId: string) => {
    if (!window.confirm('Are you sure you want to suspend this user?')) return;
    try {
      setActionLoading(userId);
      const result = await adminUsersAPI.suspend(userId);
      setUsers(users.map(u => u.id === userId ? result.user : u));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to suspend user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setActionLoading(userId);
      const result = await adminUsersAPI.updateRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? result.user : u));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${email}? This cannot be undone.`)) return;
    try {
      setActionLoading(userId);
      await adminUsersAPI.delete(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="status-badge status-active">Active</span>;
      case 'pending':
        return <span className="status-badge status-pending">Pending</span>;
      case 'suspended':
        return <span className="status-badge status-suspended">Suspended</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="role-badge role-admin">Admin</span>;
      case 'contributor':
        return <span className="role-badge role-contributor">Contributor</span>;
      case 'viewer':
        return <span className="role-badge role-viewer">Viewer</span>;
      default:
        return <span className="role-badge">{role}</span>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeUsers = users.filter(u => u.status === 'active');
  const suspendedUsers = users.filter(u => u.status === 'suspended');

  return (
    <div className="user-management">
      <div className="user-management-header">
        <button className="back-button" onClick={onBackToDashboard}>
          <FaArrowLeft /> Back
        </button>
        <h1><FaUsers /> User Management</h1>
        <p className="subtitle">Manage user access and permissions</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={fetchUsers}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <>
          {/* Pending Users Section */}
          {pendingUsers.length > 0 && (
            <div className="user-section pending-section">
              <h2>Pending Approval ({pendingUsers.length})</h2>
              <div className="user-cards">
                {pendingUsers.map(u => (
                  <div key={u.id} className="user-card pending">
                    <div className="user-info">
                      <div className="user-name">{u.name}</div>
                      <div className="user-email">{u.email}</div>
                      <div className="user-date">Signed up: {formatDate(u.created_date)}</div>
                    </div>
                    <div className="user-badges">
                      {getStatusBadge(u.status)}
                      {getRoleBadge(u.role)}
                    </div>
                    <div className="user-actions">
                      <button
                        className="action-btn approve-btn"
                        onClick={() => handleApprove(u.id)}
                        disabled={actionLoading === u.id}
                      >
                        <FaUserCheck /> Approve
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => handleDelete(u.id, u.email)}
                        disabled={actionLoading === u.id}
                      >
                        <FaTrash /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Users Section */}
          <div className="user-section active-section">
            <h2>Active Users ({activeUsers.length})</h2>
            {activeUsers.length === 0 ? (
              <p className="no-users">No active users</p>
            ) : (
              <div className="user-table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUsers.map(u => (
                      <tr key={u.id} className={u.id === user?.id ? 'current-user' : ''}>
                        <td className="user-name-cell">
                          {u.name}
                          {u.id === user?.id && <span className="you-badge">(You)</span>}
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            disabled={actionLoading === u.id || u.id === user?.id}
                            className="role-select"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="contributor">Contributor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>{getStatusBadge(u.status)}</td>
                        <td>{formatDate(u.created_date)}</td>
                        <td className="actions-cell">
                          {u.id !== user?.id && (
                            <>
                              <button
                                className="action-btn-small suspend-btn"
                                onClick={() => handleSuspend(u.id)}
                                disabled={actionLoading === u.id}
                                title="Suspend user"
                              >
                                <FaUserTimes />
                              </button>
                              <button
                                className="action-btn-small delete-btn"
                                onClick={() => handleDelete(u.id, u.email)}
                                disabled={actionLoading === u.id}
                                title="Delete user"
                              >
                                <FaTrash />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Suspended Users Section */}
          {suspendedUsers.length > 0 && (
            <div className="user-section suspended-section">
              <h2>Suspended Users ({suspendedUsers.length})</h2>
              <div className="user-cards">
                {suspendedUsers.map(u => (
                  <div key={u.id} className="user-card suspended">
                    <div className="user-info">
                      <div className="user-name">{u.name}</div>
                      <div className="user-email">{u.email}</div>
                    </div>
                    <div className="user-badges">
                      {getStatusBadge(u.status)}
                    </div>
                    <div className="user-actions">
                      <button
                        className="action-btn approve-btn"
                        onClick={() => handleApprove(u.id)}
                        disabled={actionLoading === u.id}
                      >
                        <FaUserCheck /> Reactivate
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => handleDelete(u.id, u.email)}
                        disabled={actionLoading === u.id}
                      >
                        <FaTrash /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserManagement;
