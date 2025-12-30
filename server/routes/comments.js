const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin, requireAdmin } = require('../middleware/roleMiddleware');
const { createAuditLog } = require('../services/auditLogService');
const { v4: uuidv4 } = require('uuid');

// Get all comments for a use case (threaded)
router.get('/use-cases/:useCaseId/comments', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { useCaseId } = req.params;

  const query = `
    SELECT
      c.id,
      c.use_case_id,
      c.user_id,
      c.parent_comment_id,
      c.content,
      c.is_edited,
      c.created_date,
      c.updated_date,
      u.name as user_name,
      u.email as user_email
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.use_case_id = ?
    ORDER BY c.created_date ASC
  `;

  db.query(query, [useCaseId], (err, results) => {
    if (err) {
      console.error('Error fetching comments:', err);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }

    // Transform results to include user info
    const comments = results.map(row => ({
      id: row.id,
      use_case_id: row.use_case_id,
      user_id: row.user_id,
      user_name: row.user_name,
      user_email: row.user_email,
      parent_comment_id: row.parent_comment_id,
      content: row.content,
      is_edited: !!row.is_edited,
      created_date: row.created_date,
      updated_date: row.updated_date
    }));

    res.json(comments);
  });
});

// Get all comments for an agent (threaded)
router.get('/agents/:agentId/comments', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { agentId } = req.params;

  const query = `
    SELECT
      c.id,
      c.agent_id,
      c.user_id,
      c.parent_comment_id,
      c.content,
      c.is_edited,
      c.created_date,
      c.updated_date,
      u.name as user_name,
      u.email as user_email
    FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.agent_id = ?
    ORDER BY c.created_date ASC
  `;

  db.query(query, [agentId], (err, results) => {
    if (err) {
      console.error('Error fetching agent comments:', err);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }

    // Transform results to include user info
    const comments = results.map(row => ({
      id: row.id,
      agent_id: row.agent_id,
      user_id: row.user_id,
      user_name: row.user_name,
      user_email: row.user_email,
      parent_comment_id: row.parent_comment_id,
      content: row.content,
      is_edited: !!row.is_edited,
      created_date: row.created_date,
      updated_date: row.updated_date
    }));

    res.json(comments);
  });
});

// Create a new comment
router.post('/comments', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { use_case_id, agent_id, parent_comment_id, content } = req.body;
  const user_id = req.user.id;

  // Must have either use_case_id or agent_id
  if ((!use_case_id && !agent_id) || !content) {
    return res.status(400).json({ error: 'Either use_case_id or agent_id is required, along with content' });
  }

  // Cannot have both
  if (use_case_id && agent_id) {
    return res.status(400).json({ error: 'Cannot specify both use_case_id and agent_id' });
  }

  const verifyEntity = (callback) => {
    if (use_case_id) {
      // Verify use case exists
      db.query('SELECT id FROM use_cases WHERE id = ?', [use_case_id], (err, results) => {
        if (err) {
          console.error('Error checking use case:', err);
          return res.status(500).json({ error: 'Failed to verify use case' });
        }
        if (results.length === 0) {
          return res.status(404).json({ error: 'Use case not found' });
        }
        callback();
      });
    } else if (agent_id) {
      // Verify agent exists
      db.query('SELECT id FROM agents WHERE id = ?', [agent_id], (err, results) => {
        if (err) {
          console.error('Error checking agent:', err);
          return res.status(500).json({ error: 'Failed to verify agent' });
        }
        if (results.length === 0) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        callback();
      });
    }
  };

  verifyEntity(() => {
    // If parent_comment_id is provided, verify it exists
    if (parent_comment_id) {
      db.query('SELECT id FROM comments WHERE id = ?', [parent_comment_id], (err, parentResults) => {
        if (err) {
          console.error('Error checking parent comment:', err);
          return res.status(500).json({ error: 'Failed to verify parent comment' });
        }

        if (parentResults.length === 0) {
          return res.status(404).json({ error: 'Parent comment not found' });
        }

        insertComment();
      });
    } else {
      insertComment();
    }

    function insertComment() {
      const commentId = uuidv4();
      const insertQuery = `
        INSERT INTO comments (id, use_case_id, agent_id, user_id, parent_comment_id, content)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.query(insertQuery, [commentId, use_case_id || null, agent_id || null, user_id, parent_comment_id || null, content], (err, result) => {
        if (err) {
          console.error('Error creating comment:', err);
          return res.status(500).json({ error: 'Failed to create comment' });
        }

        // Update entity's updated_date
        if (use_case_id) {
          db.query('UPDATE use_cases SET updated_date = CURRENT_TIMESTAMP WHERE id = ?', [use_case_id], (updateErr) => {
            if (updateErr) {
              console.error('Error updating use case updated_date:', updateErr);
            }
          });
        } else if (agent_id) {
          db.query('UPDATE agents SET updated_date = CURRENT_TIMESTAMP WHERE id = ?', [agent_id], (updateErr) => {
            if (updateErr) {
              console.error('Error updating agent updated_date:', updateErr);
            }
          });
        }

        // Fetch the complete comment with user info
        const selectQuery = `
          SELECT
            c.id,
            c.use_case_id,
            c.agent_id,
            c.user_id,
            c.parent_comment_id,
            c.content,
            c.is_edited,
            c.created_date,
            c.updated_date,
            u.name as user_name,
            u.email as user_email
          FROM comments c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.id = ?
        `;

        db.query(selectQuery, [commentId], (err, selectResults) => {
          if (err) {
            console.error('Error fetching created comment:', err);
            return res.status(500).json({ error: 'Failed to fetch created comment' });
          }

          const row = selectResults[0];
          const comment = {
            id: row.id,
            use_case_id: row.use_case_id,
            agent_id: row.agent_id,
            user_id: row.user_id,
            user_name: row.user_name,
            user_email: row.user_email,
            parent_comment_id: row.parent_comment_id,
            content: row.content,
            is_edited: !!row.is_edited,
            created_date: row.created_date,
            updated_date: row.updated_date
          };

          // Fetch entity title and create audit log
          const entityType = use_case_id ? 'use_case' : 'agent';
          const entityId = use_case_id || agent_id;
          const entityTable = use_case_id ? 'use_cases' : 'agents';

          db.query(`SELECT title FROM ${entityTable} WHERE id = ?`, [entityId], (err, entityResults) => {
            const entityTitle = entityResults && entityResults.length > 0 ? entityResults[0].title : 'Unknown';

            // Audit log for comment
            createAuditLog({
              eventType: 'comment_added',
              entityType: entityType,
              entityId: entityId,
              entityTitle: entityTitle,
              userId: req.user.id,
              userName: req.user.name,
              newValue: content.substring(0, 100)
            }).catch(err => console.error('Failed to create audit log:', err));

            res.status(201).json(comment);
          });
        });
      });
    }
  });
});

// Update a comment (own comment or admin)
router.put('/comments/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const user_id = req.user.id;
  const is_admin = req.user.role === 'admin';

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  // Check if comment exists and user has permission
  db.query('SELECT user_id FROM comments WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking comment:', err);
      return res.status(500).json({ error: 'Failed to check comment' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = results[0];

    // Check permission: own comment or admin
    if (comment.user_id !== user_id && !is_admin) {
      return res.status(403).json({ error: 'You do not have permission to edit this comment' });
    }

    // Update comment
    const updateQuery = `
      UPDATE comments
      SET content = ?, is_edited = TRUE, updated_date = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.query(updateQuery, [content, id], (err, result) => {
      if (err) {
        console.error('Error updating comment:', err);
        return res.status(500).json({ error: 'Failed to update comment' });
      }

      // Fetch updated comment
      const selectQuery = `
        SELECT
          c.id,
          c.use_case_id,
          c.user_id,
          c.parent_comment_id,
          c.content,
          c.is_edited,
          c.created_date,
          c.updated_date,
          u.name as user_name,
          u.email as user_email
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `;

      db.query(selectQuery, [id], (err, selectResults) => {
        if (err) {
          console.error('Error fetching updated comment:', err);
          return res.status(500).json({ error: 'Failed to fetch updated comment' });
        }

        const row = selectResults[0];
        const updatedComment = {
          id: row.id,
          use_case_id: row.use_case_id,
          user_id: row.user_id,
          user_name: row.user_name,
          user_email: row.user_email,
          parent_comment_id: row.parent_comment_id,
          content: row.content,
          is_edited: !!row.is_edited,
          created_date: row.created_date,
          updated_date: row.updated_date
        };

        res.json(updatedComment);
      });
    });
  });
});

// Delete a comment (own comment or admin)
router.delete('/comments/:id', verifyToken, requireConsumerOrAdmin, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  const is_admin = req.user.role === 'admin';

  // Check if comment exists and user has permission
  db.query('SELECT user_id FROM comments WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error checking comment:', err);
      return res.status(500).json({ error: 'Failed to check comment' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = results[0];

    // Check permission: own comment or admin
    if (comment.user_id !== user_id && !is_admin) {
      return res.status(403).json({ error: 'You do not have permission to delete this comment' });
    }

    // Get use_case_id before deleting
    db.query('SELECT use_case_id FROM comments WHERE id = ?', [id], (err, commentResults) => {
      if (err) {
        console.error('Error fetching comment:', err);
        return res.status(500).json({ error: 'Failed to fetch comment' });
      }

      const use_case_id = commentResults[0]?.use_case_id;

      // Delete comment (CASCADE will delete child comments)
      db.query('DELETE FROM comments WHERE id = ?', [id], (err, result) => {
        if (err) {
          console.error('Error deleting comment:', err);
          return res.status(500).json({ error: 'Failed to delete comment' });
        }

        // Update use_cases.updated_date if we have the use_case_id
        if (use_case_id) {
          db.query('UPDATE use_cases SET updated_date = CURRENT_TIMESTAMP WHERE id = ?', [use_case_id], (updateErr) => {
            if (updateErr) {
              console.error('Error updating use case updated_date:', updateErr);
              // Don't fail the request, just log the error
            }
          });
        }

        res.json({ message: 'Comment deleted successfully' });
      });
    });
  });
});

module.exports = router;
