const express = require('express');
const router = express.Router();
const db = require('../config/database-mysql-compat');
const { verifyToken } = require('./auth');
const { requireConsumerOrAdmin } = require('../middleware/roleMiddleware');

// GET /analytics/variance - Get variance report for initiatives and agents
router.get('/variance', verifyToken, requireConsumerOrAdmin, async (req, res) => {
  try {
    const {
      days = 7,
      start_date,
      end_date,
      domain_id,
      breakdown = 'status'
    } = req.query;

    if (!domain_id) {
      return res.status(400).json({ error: 'domain_id is required' });
    }

    // Calculate date ranges
    let currentEnd, currentStart, previousEnd, previousStart;
    const now = new Date();

    if (start_date && end_date) {
      // Custom date range
      currentEnd = new Date(end_date);
      currentStart = new Date(start_date);
      const daysDiff = Math.ceil((currentEnd - currentStart) / (1000 * 60 * 60 * 24));
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - daysDiff);
    } else {
      // Preset days
      const daysNum = parseInt(days);
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - daysNum);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - daysNum);
    }

    const formatDate = (d) => d.toISOString().split('T')[0];
    const currentStartStr = formatDate(currentStart);
    const currentEndStr = formatDate(currentEnd);
    const previousStartStr = formatDate(previousStart);
    const previousEndStr = formatDate(previousEnd);

    // Get summary counts
    const summaryQuery = `
      SELECT
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
        (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
        (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as tasks_current,
        (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?) as tasks_previous
    `;

    const summaryParams = [
      domain_id, currentStartStr, currentEndStr,
      domain_id, previousStartStr, previousEndStr,
      domain_id, currentStartStr, currentEndStr,
      domain_id, previousStartStr, previousEndStr
    ];

    // Get daily breakdown for trend chart
    const dailyQuery = `
      SELECT
        DATE(created_date) as date,
        'initiative' as type,
        COUNT(*) as count
      FROM use_cases
      WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
      GROUP BY DATE(created_date)
      UNION ALL
      SELECT
        DATE(created_date) as date,
        'task' as type,
        COUNT(*) as count
      FROM tasks
      WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
      GROUP BY DATE(created_date)
      ORDER BY date ASC
    `;

    const dailyParams = [
      domain_id, currentStartStr, currentEndStr,
      domain_id, currentStartStr, currentEndStr
    ];

    // Build breakdown query based on breakdown type
    let breakdownQuery;
    let breakdownParams;

    switch (breakdown) {
      case 'status':
        breakdownQuery = `
          SELECT
            status as name,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as tasks_current,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND status = s.status AND DATE(created_date) BETWEEN ? AND ?) as tasks_previous
          FROM (
            SELECT DISTINCT status FROM use_cases WHERE domain_id = ?
            UNION
            SELECT DISTINCT status FROM tasks WHERE domain_id = ?
          ) s
          ORDER BY FIELD(status, 'integration', 'implementation', 'commitment', 'experimentation', 'intention', 'blocked', 'slow_burner', 'on_hold', 'de_prioritised')
        `;
        breakdownParams = [
          domain_id, currentStartStr, currentEndStr,
          domain_id, previousStartStr, previousEndStr,
          domain_id, currentStartStr, currentEndStr,
          domain_id, previousStartStr, previousEndStr,
          domain_id, domain_id
        ];
        break;

      case 'impact':
        breakdownQuery = `
          SELECT
            impact as name,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as initiatives_current,
            (SELECT COUNT(*) FROM use_cases WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as initiatives_previous,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as tasks_current,
            (SELECT COUNT(*) FROM tasks WHERE domain_id = ? AND strategic_impact = i.impact AND DATE(created_date) BETWEEN ? AND ?) as tasks_previous
          FROM (
            SELECT 'High' as impact UNION SELECT 'Medium' UNION SELECT 'Low'
          ) i
          ORDER BY FIELD(impact, 'High', 'Medium', 'Low')
        `;
        breakdownParams = [
          domain_id, currentStartStr, currentEndStr,
          domain_id, previousStartStr, previousEndStr,
          domain_id, currentStartStr, currentEndStr,
          domain_id, previousStartStr, previousEndStr
        ];
        break;

      case 'category':
        breakdownQuery = `
          SELECT
            COALESCE(c.name, at.name) as name,
            'category' as breakdown_type,
            COALESCE(uc_current.count, 0) as initiatives_current,
            COALESCE(uc_previous.count, 0) as initiatives_previous,
            0 as tasks_current,
            0 as tasks_previous
          FROM categories c
          LEFT JOIN (
            SELECT category_id, COUNT(*) as count
            FROM use_cases
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY category_id
          ) uc_current ON c.id = uc_current.category_id
          LEFT JOIN (
            SELECT category_id, COUNT(*) as count
            FROM use_cases
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY category_id
          ) uc_previous ON c.id = uc_previous.category_id
          WHERE c.domain_id = ?
          HAVING initiatives_current > 0 OR initiatives_previous > 0

          UNION ALL

          SELECT
            at.name as name,
            'agent_type' as breakdown_type,
            0 as initiatives_current,
            0 as initiatives_previous,
            COALESCE(ag_current.count, 0) as tasks_current,
            COALESCE(ag_previous.count, 0) as tasks_previous
          FROM agent_types at
          LEFT JOIN (
            SELECT agent_type_id, COUNT(*) as count
            FROM tasks
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY agent_type_id
          ) ag_current ON at.id = ag_current.agent_type_id
          LEFT JOIN (
            SELECT agent_type_id, COUNT(*) as count
            FROM tasks
            WHERE domain_id = ? AND DATE(created_date) BETWEEN ? AND ?
            GROUP BY agent_type_id
          ) ag_previous ON at.id = ag_previous.agent_type_id
          WHERE at.domain_id = ?
          HAVING tasks_current > 0 OR tasks_previous > 0

          ORDER BY (initiatives_current + tasks_current) DESC
        `;
        breakdownParams = [
          domain_id, currentStartStr, currentEndStr,
          domain_id, previousStartStr, previousEndStr,
          domain_id,
          domain_id, currentStartStr, currentEndStr,
          domain_id, previousStartStr, previousEndStr,
          domain_id
        ];
        break;

      default:
        return res.status(400).json({ error: 'Invalid breakdown type' });
    }

    // Execute all queries
    const [summaryResults] = await db.promise().query(summaryQuery, summaryParams);
    const [dailyResults] = await db.promise().query(dailyQuery, dailyParams);
    const [breakdownResults] = await db.promise().query(breakdownQuery, breakdownParams);

    const summary = summaryResults[0];

    // Calculate variances
    const initiativesVariance = summary.initiatives_current - summary.initiatives_previous;
    const initiativesPercent = summary.initiatives_previous > 0
      ? ((initiativesVariance / summary.initiatives_previous) * 100).toFixed(1)
      : (summary.initiatives_current > 0 ? 100 : 0);

    const agentsVariance = summary.tasks_current - summary.tasks_previous;
    const agentsPercent = summary.tasks_previous > 0
      ? ((agentsVariance / summary.tasks_previous) * 100).toFixed(1)
      : (summary.tasks_current > 0 ? 100 : 0);

    const ratio = summary.tasks_current > 0
      ? (summary.initiatives_current / summary.tasks_current).toFixed(1)
      : summary.initiatives_current;

    // Process daily data into a more usable format
    const dailyMap = {};
    dailyResults.forEach(row => {
      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date;
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, initiatives: 0, agents: 0 };
      }
      if (row.type === 'initiative') {
        dailyMap[dateStr].initiatives = row.count;
      } else {
        dailyMap[dateStr].agents = row.count;
      }
    });

    // Fill in missing dates with zeros
    const daily = [];
    const cursor = new Date(currentStart);
    while (cursor <= currentEnd) {
      const dateStr = formatDate(cursor);
      daily.push(dailyMap[dateStr] || { date: dateStr, initiatives: 0, agents: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Process breakdown data
    const breakdownData = breakdownResults.map(row => ({
      name: row.name,
      breakdown_type: row.breakdown_type || breakdown,
      initiatives_current: row.initiatives_current || 0,
      initiatives_previous: row.initiatives_previous || 0,
      initiatives_variance: (row.initiatives_current || 0) - (row.initiatives_previous || 0),
      tasks_current: row.tasks_current || 0,
      tasks_previous: row.tasks_previous || 0,
      agents_variance: (row.tasks_current || 0) - (row.tasks_previous || 0)
    }));

    res.json({
      period: {
        start: currentStartStr,
        end: currentEndStr,
        days: parseInt(days)
      },
      previous_period: {
        start: previousStartStr,
        end: previousEndStr
      },
      summary: {
        initiatives: {
          current: summary.initiatives_current,
          previous: summary.initiatives_previous,
          variance: initiativesVariance,
          percent: parseFloat(initiativesPercent)
        },
        agents: {
          current: summary.tasks_current,
          previous: summary.tasks_previous,
          variance: agentsVariance,
          percent: parseFloat(agentsPercent)
        },
        ratio: parseFloat(ratio)
      },
      daily,
      breakdown: breakdownData
    });

  } catch (error) {
    console.error('Error fetching variance data:', error);
    res.status(500).json({ error: 'Failed to fetch variance data' });
  }
});

module.exports = router;
