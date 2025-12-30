import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaArrowLeft, FaSearch } from 'react-icons/fa';
import { auditLogsAPI } from '../../services/apiService';
import './AuditLog.css';

interface AuditLogProps {
  user?: any;
  onUserMenuClick?: () => void;
  onBackToDashboard: () => void;
}

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  event_type: string;
  entity_type: string;
  entity_id: string;
  entity_title: string | null;
  user_id: string | null;
  user_name: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata?: any;
  created_date: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  kanban_change: '#3B82F6',
  status_change: '#A855F7',
  roadmap_change: '#10B981',
  comment_added: '#EAB308',
  like_added: '#EC4899',
  use_case_created: '#06B6D4',
  agent_created: '#D946EF',
};

const AuditLog: React.FC<AuditLogProps> = ({ user, onUserMenuClick, onBackToDashboard }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);

  const ITEMS_PER_PAGE = 50;

  // Fetch initial audit logs
  useEffect(() => {
    fetchAuditLogs(1, true);
  }, []);

  // Fetch audit logs from API
  const fetchAuditLogs = async (pageNum: number, isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Calculate offset based on page number
      const offset = (pageNum - 1) * ITEMS_PER_PAGE;

      // Use auditLogsAPI to fetch logs
      const response = await auditLogsAPI.getAll({
        limit: ITEMS_PER_PAGE,
        offset: offset
      });

      if (response && response.logs) {
        const newLogs = response.logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.created_date),
        }));

        if (isInitial) {
          setLogs(newLogs);
          setFilteredLogs(newLogs);
        } else {
          setLogs((prev) => [...prev, ...newLogs]);
          setFilteredLogs((prev) => [...prev, ...newLogs]);
        }

        setHasMore(newLogs.length === ITEMS_PER_PAGE);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Handle infinite scroll
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasMore && !loadingMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchAuditLogs(nextPage);
    }
  }, [hasMore, loadingMore, loading, page]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0.1,
    });

    const element = observerTarget.current;
    if (element) observer.observe(element);

    return () => {
      if (element) observer.unobserve(element);
    };
  }, [handleObserver]);

  // Apply filters and search
  useEffect(() => {
    let result = [...logs];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(
        (log) =>
          (log.user_name && log.user_name.toLowerCase().includes(searchLower)) ||
          (log.event_type && log.event_type.toLowerCase().includes(searchLower)) ||
          (log.entity_type && log.entity_type.toLowerCase().includes(searchLower)) ||
          (log.entity_title && log.entity_title.toLowerCase().includes(searchLower)) ||
          (log.old_value && log.old_value.toLowerCase().includes(searchLower)) ||
          (log.new_value && log.new_value.toLowerCase().includes(searchLower))
      );
    }

    // Apply event type filter
    if (eventTypeFilter !== 'all') {
      result = result.filter((log) => log.event_type === eventTypeFilter);
    }

    // Apply entity type filter
    if (entityTypeFilter !== 'all') {
      result = result.filter((log) => log.entity_type === entityTypeFilter);
    }

    setFilteredLogs(result);
  }, [searchTerm, eventTypeFilter, entityTypeFilter, logs]);

  // Format date with relative time
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const formattedTime = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    let relativeTime = '';
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      relativeTime = diffInMinutes === 0 ? 'Just now' : diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      relativeTime = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (diffInHours < 48) {
      relativeTime = 'Yesterday';
    }

    return relativeTime
      ? `${formattedDate} ${formattedTime} (${relativeTime})`
      : `${formattedDate} ${formattedTime}`;
  };

  // Format changes column
  const formatChanges = (log: AuditLogEntry): string => {
    if (!log.old_value && !log.new_value) return '-';

    const oldVal = log.old_value || 'null';
    const newVal = log.new_value || 'null';

    // If both values are the same, just show the value (e.g., for new creations)
    if (oldVal === 'null' && newVal !== 'null') {
      return newVal;
    }

    return `${oldVal} → ${newVal}`;
  };

  // Get unique event types for filter
  const uniqueEventTypes = Array.from(new Set(logs.map((log) => log.event_type)));
  const uniqueEntityTypes = Array.from(new Set(logs.map((log) => log.entity_type)));

  // Get badge color for event type
  const getBadgeColor = (eventType: string): string => {
    return EVENT_TYPE_COLORS[eventType] || '#6B7280';
  };

  return (
    <div className="audit-log-page">
      <div className="audit-log-header">
        <button className="back-button" onClick={onBackToDashboard}>
          <FaArrowLeft />
          Back
        </button>
        <h1>Audit Log</h1>
        <p>Track all changes and activities across the platform</p>
      </div>

      <div className="audit-log-content">
        <div className="audit-filters">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Type to search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-dropdowns">
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Event Types</option>
              {uniqueEventTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>

            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Entity Types</option>
              {uniqueEntityTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="empty-state">
            <h3>No Audit Logs Found</h3>
            <p>
              {searchTerm || eventTypeFilter !== 'all' || entityTypeFilter !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'No activity has been logged yet'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="audit-log-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Event Type</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, index) => (
                  <tr key={log.id} className="audit-log-row">
                    <td className="date-cell">{formatDate(log.timestamp)}</td>
                    <td className="event-type-cell">
                      <span
                        className="event-badge"
                        style={{ backgroundColor: getBadgeColor(log.event_type) }}
                      >
                        {log.event_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </td>
                    <td className="entity-cell">
                      <div>{log.entity_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</div>
                      <div style={{ fontSize: '0.85em', color: '#6B7280' }}>{log.entity_title}</div>
                    </td>
                    <td className="user-cell">{log.user_name || 'System'}</td>
                    <td className="changes-cell">{formatChanges(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div ref={observerTarget} className="observer-target">
              {loadingMore && (
                <div className="loading-more">
                  <div className="spinner-small"></div>
                  <p>Loading more...</p>
                </div>
              )}
              {!hasMore && filteredLogs.length > 0 && (
                <div className="no-more-logs">
                  <p>No more logs to load</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
