const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireAdmin } = require('../middleware/roleMiddleware');

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const [users] = await db.promise().query(`
      SELECT
        id,
        email,
        name,
        role,
        status,
        azure_ad_id,
        created_date,
        updated_date
      FROM users
      ORDER BY
        CASE status
          WHEN 'pending' THEN 0
          WHEN 'active' THEN 1
          WHEN 'suspended' THEN 2
        END,
        created_date DESC
    `);

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PUT /api/admin/users/:id/approve
 * Approve a pending user (set status to active)
 */
router.put('/:id/approve', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.promise().query(
      'UPDATE users SET status = ?, updated_date = NOW() WHERE id = ?',
      ['active', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get updated user
    const [users] = await db.promise().query('SELECT * FROM users WHERE id = ?', [id]);

    console.log(`User ${users[0]?.email} approved by admin`);
    res.json({ message: 'User approved successfully', user: users[0] });
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

/**
 * PUT /api/admin/users/:id/suspend
 * Suspend a user (set status to suspended)
 */
router.put('/:id/suspend', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  // Prevent self-suspension
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Cannot suspend yourself' });
  }

  try {
    const [result] = await db.promise().query(
      'UPDATE users SET status = ?, updated_date = NOW() WHERE id = ?',
      ['suspended', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [users] = await db.promise().query('SELECT * FROM users WHERE id = ?', [id]);

    console.log(`User ${users[0]?.email} suspended by admin`);
    res.json({ message: 'User suspended successfully', user: users[0] });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Update user role (admin only)
 */
router.put('/:id/role', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  // Validate role
  const validRoles = ['viewer', 'contributor', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  // Prevent self-demotion from admin
  if (req.user.id === id && role !== 'admin') {
    return res.status(400).json({ error: 'Cannot demote yourself from admin' });
  }

  try {
    const [result] = await db.promise().query(
      'UPDATE users SET role = ?, updated_date = NOW() WHERE id = ?',
      [role, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [users] = await db.promise().query('SELECT * FROM users WHERE id = ?', [id]);

    console.log(`User ${users[0]?.email} role changed to ${role} by admin`);
    res.json({ message: 'User role updated successfully', user: users[0] });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user (admin only)
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  try {
    // Get user info before deletion
    const [users] = await db.promise().query('SELECT email FROM users WHERE id = ?', [id]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.promise().query('DELETE FROM users WHERE id = ?', [id]);

    console.log(`User ${users[0].email} deleted by admin`);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
