const { v4: uuidv4 } = require('uuid');
const db = require('../config/database-mysql-compat');

/**
 * Create an audit log entry
 * @param {Object} params - Audit log parameters
 * @param {string} params.eventType - Type of event (kanban_change, roadmap_change, status_change, use_case_created, agent_created, comment_added, like_added)
 * @param {string} params.entityType - Type of entity (use_case, agent)
 * @param {string} params.entityId - ID of the entity
 * @param {string} params.entityTitle - Title of the entity
 * @param {string} [params.userId] - ID of the user who made the change
 * @param {string} [params.userName] - Name of the user who made the change
 * @param {string} [params.oldValue] - Previous value
 * @param {string} [params.newValue] - New value
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Promise<string>} - ID of the created audit log entry
 */
async function createAuditLog({
  eventType,
  entityType,
  entityId,
  entityTitle,
  userId = null,
  userName = null,
  oldValue = null,
  newValue = null,
  metadata = null
}) {
  const id = uuidv4();

  // If userId is provided but userName is not, fetch the username from the database
  let finalUserName = userName;

  if (userId && !userName) {
    try {
      const userResult = await new Promise((resolve, reject) => {
        db.query('SELECT name FROM users WHERE id = ?', [userId], (err, results) => {
          if (err) {
            console.error('Error fetching user name for audit log:', err);
            reject(err);
          } else {
            resolve(results);
          }
        });
      });

      if (userResult && userResult.length > 0) {
        finalUserName = userResult[0].name;
      }
    } catch (err) {
      console.error('Failed to fetch user name, continuing with null:', err);
      // Continue with null userName if fetch fails
    }
  }

  const query = `
    INSERT INTO audit_logs (
      id, event_type, entity_type, entity_id, entity_title,
      user_id, user_name, old_value, new_value, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  return new Promise((resolve, reject) => {
    db.query(
      query,
      [id, eventType, entityType, entityId, entityTitle, userId, finalUserName, oldValue, newValue, metadataJson],
      (err) => {
        if (err) {
          console.error('Error creating audit log:', err);
          reject(err);
        } else {
          resolve(id);
        }
      }
    );
  });
}

module.exports = {
  createAuditLog
};
