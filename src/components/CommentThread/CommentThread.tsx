import React, { useState, useEffect } from 'react';
import { Comment } from '../../types';
import { commentsAPI } from '../../services/apiService';
import './CommentThread.css';

interface CommentThreadProps {
  useCaseId?: string;
  entityId?: string;
  entityType?: 'use_case' | 'agent';
  currentUserId: string;
  currentUserName: string;
  isAdmin?: boolean;
}

interface CommentWithReplies extends Comment {
  replies: CommentWithReplies[];
}

const CommentThread: React.FC<CommentThreadProps> = ({
  useCaseId,
  entityId,
  entityType = 'use_case',
  currentUserId,
  currentUserName,
  isAdmin = false
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCommentContent, setNewCommentContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Support both old useCaseId prop and new entityId/entityType props
  const actualEntityId = entityId || useCaseId || '';

  useEffect(() => {
    loadComments();
  }, [actualEntityId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const fetchedComments = await commentsAPI.getAll(actualEntityId, entityType);
      setComments(fetchedComments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildCommentTree = (comments: Comment[]): CommentWithReplies[] => {
    const commentMap = new Map<string, CommentWithReplies>();
    const rootComments: CommentWithReplies[] = [];

    // First pass: create map of all comments
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: build tree structure
    comments.forEach(comment => {
      const commentWithReplies = commentMap.get(comment.id)!;
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies.push(commentWithReplies);
        }
      } else {
        rootComments.push(commentWithReplies);
      }
    });

    return rootComments;
  };

  const handleCreateComment = async () => {
    if (!newCommentContent.trim() || !actualEntityId) return;

    try {
      setSubmitting(true);
      const commentData = entityType === 'agent'
        ? { agent_id: actualEntityId, content: newCommentContent.trim() }
        : { use_case_id: actualEntityId, content: newCommentContent.trim() };

      await commentsAPI.create(commentData);
      setNewCommentContent('');
      await loadComments();
    } catch (error) {
      console.error('Failed to create comment:', error);
      alert('Failed to create comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || !actualEntityId) return;

    try {
      setSubmitting(true);
      const commentData = entityType === 'agent'
        ? { agent_id: actualEntityId, parent_comment_id: parentId, content: replyContent.trim() }
        : { use_case_id: actualEntityId, parent_comment_id: parentId, content: replyContent.trim() };

      await commentsAPI.create(commentData);
      setReplyContent('');
      setReplyingTo(null);
      await loadComments();
    } catch (error) {
      console.error('Failed to reply to comment:', error);
      alert('Failed to reply. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      setSubmitting(true);
      await commentsAPI.update(commentId, editContent.trim());
      setEditingId(null);
      setEditContent('');
      await loadComments();
    } catch (error) {
      console.error('Failed to edit comment:', error);
      alert('Failed to edit comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment? This will also delete all replies.')) {
      return;
    }

    try {
      await commentsAPI.delete(commentId);
      await loadComments();
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderComment = (comment: CommentWithReplies, depth: number = 0) => {
    const isOwnComment = comment.user_id === currentUserId;
    const canEdit = isOwnComment || isAdmin;
    const isEditing = editingId === comment.id;
    const isReplying = replyingTo === comment.id;

    return (
      <div key={comment.id} className={`comment ${depth > 0 ? 'comment-reply' : ''}`} style={{ marginLeft: `${depth * 20}px` }}>
        <div className="comment-header">
          <div className="comment-author">
            <strong>{comment.user_name}</strong>
            <span className="comment-date">{formatDate(comment.created_date)}</span>
            {comment.is_edited && <span className="comment-edited">(edited)</span>}
          </div>
          {canEdit && !isEditing && (
            <div className="comment-actions">
              <button
                className="comment-action-btn"
                onClick={() => {
                  setEditingId(comment.id);
                  setEditContent(comment.content);
                }}
              >
                Edit
              </button>
              <button
                className="comment-action-btn comment-delete-btn"
                onClick={() => handleDelete(comment.id)}
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="comment-edit-form">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="comment-textarea"
            />
            <div className="comment-form-actions">
              <button
                onClick={() => handleEdit(comment.id)}
                disabled={submitting || !editContent.trim()}
                className="comment-submit-btn"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setEditContent('');
                }}
                disabled={submitting}
                className="comment-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="comment-content">{comment.content}</div>
        )}

        {!isEditing && (
          <div className="comment-footer">
            <button
              className="comment-reply-btn"
              onClick={() => {
                setReplyingTo(isReplying ? null : comment.id);
                setReplyContent('');
              }}
            >
              {isReplying ? 'Cancel' : 'Reply'}
            </button>
          </div>
        )}

        {isReplying && (
          <div className="comment-reply-form">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={`Reply to ${comment.user_name}...`}
              rows={3}
              className="comment-textarea"
              autoFocus
            />
            <div className="comment-form-actions">
              <button
                onClick={() => handleReply(comment.id)}
                disabled={submitting || !replyContent.trim()}
                className="comment-submit-btn"
              >
                {submitting ? 'Posting...' : 'Post Reply'}
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent('');
                }}
                disabled={submitting}
                className="comment-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map(reply => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="comment-thread-loading">Loading comments...</div>;
  }

  const commentTree = buildCommentTree(comments);

  return (
    <div className="comment-thread">
      <h3 className="comment-thread-title">Comments ({comments.length})</h3>

      <div className="comment-new-form">
        <div className="comment-new-header">
          <strong>{currentUserName}</strong>
        </div>
        <textarea
          value={newCommentContent}
          onChange={(e) => setNewCommentContent(e.target.value)}
          placeholder="Write a comment..."
          rows={3}
          className="comment-textarea"
        />
        <div className="comment-form-actions">
          <button
            onClick={handleCreateComment}
            disabled={submitting || !newCommentContent.trim()}
            className="comment-submit-btn"
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>

      <div className="comment-list">
        {commentTree.length === 0 ? (
          <div className="no-comments">No comments yet. Be the first to comment!</div>
        ) : (
          commentTree.map(comment => renderComment(comment))
        )}
      </div>
    </div>
  );
};

export default CommentThread;
