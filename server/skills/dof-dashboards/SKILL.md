---
name: Interactive Dashboard
description: Create interactive HTML dashboards with Chart.js visualizations, KPI cards, and data tables. Outputs downloadable self-contained HTML files.
triggers: create dashboard, make dashboard, dashboard, analytics dashboard, data visualization, create charts, visualize data, html dashboard
---

# DoF Interactive Dashboards

Create professional, interactive HTML dashboards with Chart.js visualizations following UAE Department of Finance (AI@DoF) brand guidelines. Outputs self-contained HTML files that can be downloaded and opened in any browser.

## Overview

This skill creates standalone HTML dashboard files with:
- Interactive Chart.js charts (line, bar, pie, doughnut, radar)
- KPI/metric cards with variance indicators
- Data tables with sorting capabilities
- DoF brand styling (sea green theme)
- Fully self-contained (all CSS and JS embedded)

## When to Use

Use this skill when:
- User asks for a "dashboard" or "data visualization"
- Creating analytics reports with charts
- Visualizing variance reports, statistics, or trends
- Building interactive data displays
- User wants downloadable HTML output

## CRITICAL: Output Format

**THIS SKILL CREATES HTML FILES, NOT POWERPOINT.**

- DO NOT use `create_pptx` - that is for the presentation skill
- DO NOT create slides - dashboards are single-page HTML documents
- Output is a self-contained `.html` file with embedded CSS and JavaScript
- The HTML file opens in any web browser and works offline

**Correct workflow:**
1. Build complete HTML with embedded Chart.js and CSS
2. Use `create_artifact` with type `dashboard` to create the downloadable file

**Correct create_artifact call:**
```javascript
create_artifact({
  type: "dashboard",  // MUST be "dashboard" for HTML output
  title: "Portfolio Analytics Dashboard",
  data: { content: htmlContent }  // Full HTML string
})
```

DO NOT use type "presentation" or "spreadsheet" - these will create PPTX/XLSX files!

## Design System

### Colors (DoF Brand)

```css
:root {
  --color-primary: #00A79D;       /* Sea Green - primary accent */
  --color-primary-light: #E6F7F6; /* Light teal background */
  --color-secondary: #C68D6D;     /* Earthy Brown - secondary */
  --color-gold: #B79546;          /* Primary Gold - highlights */
  --color-dark: #1a1a2e;          /* Dark text */
  --color-muted: #77787B;         /* Metal grey - secondary text */
  --color-surface: #ffffff;       /* White background */
  --color-surface-alt: #f8f9fa;   /* Light grey surface */
  --color-border: #e1e5e9;        /* Border color */
  --color-positive: #22c55e;      /* Green for positive variance */
  --color-negative: #ef4444;      /* Red for negative variance */
}
```

### Chart Colors Palette

Use these colors for chart datasets:
```javascript
const CHART_COLORS = {
  initiatives: '#00A79D',  // Sea Green
  agents: '#C68D6D',       // Earthy Brown
  gold: '#B79546',         // Primary Gold
  purple: '#8b5cf6',       // Purple accent
  blue: '#3b82f6',         // Blue accent
  orange: '#f97316',       // Orange accent
};
```

### Typography

- **Font**: Arial, -apple-system, sans-serif
- **No emojis** in dashboards
- **Sentence case** for all headers

## Dashboard Structure

### HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Dashboard Title] | AI@DoF</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    /* All CSS embedded here */
  </style>
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <!-- Title and period -->
    </header>

    <section class="kpi-cards">
      <!-- KPI metric cards -->
    </section>

    <section class="charts-grid">
      <!-- Chart containers -->
    </section>

    <section class="data-table">
      <!-- Optional data table -->
    </section>
  </div>

  <script>
    /* All JavaScript embedded here */
  </script>
</body>
</html>
```

### Base CSS

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, -apple-system, BlinkMacSystemFont, sans-serif;
  background: linear-gradient(135deg, rgba(0, 167, 157, 0.03) 0%, transparent 50%, rgba(198, 141, 109, 0.03) 100%), #f8f9fa;
  color: #1a1a2e;
  min-height: 100vh;
  padding: 24px;
}

.dashboard {
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  margin-bottom: 24px;
}

.dashboard-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1a1a2e;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-header h1::before {
  content: '';
  width: 4px;
  height: 28px;
  background: #00A79D;
  border-radius: 2px;
}

.dashboard-header .period {
  font-size: 0.9rem;
  color: #77787B;
  margin-top: 4px;
}
```

## Component Patterns

### Pattern 1: KPI Cards

Display key metrics with variance indicators:

```html
<section class="kpi-cards">
  <div class="kpi-card">
    <div class="kpi-label">Initiatives</div>
    <div class="kpi-value">47</div>
    <div class="kpi-variance positive">+9 (+23.7%)</div>
    <div class="kpi-sublabel">vs previous period</div>
  </div>

  <div class="kpi-card">
    <div class="kpi-label">Agents</div>
    <div class="kpi-value">12</div>
    <div class="kpi-variance negative">-2 (-14.3%)</div>
    <div class="kpi-sublabel">vs previous period</div>
  </div>

  <div class="kpi-card">
    <div class="kpi-label">Ratio</div>
    <div class="kpi-value">3.9:1</div>
    <div class="kpi-sublabel-large">Initiatives per Agent</div>
  </div>
</section>
```

```css
.kpi-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.kpi-card {
  background: linear-gradient(135deg, rgba(0, 167, 157, 0.06) 0%, transparent 50%, rgba(198, 141, 109, 0.06) 100%), rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(31, 38, 135, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.kpi-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #77787B;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1.2;
}

.kpi-variance {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-top: 8px;
}

.kpi-variance.positive {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.kpi-variance.negative {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.kpi-variance.neutral {
  color: #77787B;
  background: rgba(119, 120, 123, 0.1);
}

.kpi-sublabel {
  font-size: 0.75rem;
  color: #999;
  margin-top: 4px;
}

.kpi-sublabel-large {
  font-size: 0.875rem;
  color: #77787B;
  margin-top: 8px;
}
```

### Pattern 2: Chart Cards

Container for Chart.js charts:

```html
<section class="charts-grid">
  <div class="chart-card">
    <h3>Daily Trend</h3>
    <div class="chart-container">
      <canvas id="trendChart"></canvas>
    </div>
  </div>

  <div class="chart-card">
    <h3>Breakdown by Department</h3>
    <div class="chart-container">
      <canvas id="breakdownChart"></canvas>
    </div>
  </div>
</section>
```

```css
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.chart-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e1e5e9;
}

.chart-card h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.chart-container {
  position: relative;
  height: 300px;
}
```

### Pattern 3: Data Tables

Styled tables for detailed data:

```html
<section class="table-section">
  <div class="table-card">
    <h3>Breakdown Details</h3>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th>Current</th>
            <th>Previous</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="name-cell">Finance</td>
            <td>18</td>
            <td>14</td>
            <td class="positive">+4</td>
          </tr>
          <!-- More rows -->
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td><strong>47</strong></td>
            <td><strong>38</strong></td>
            <td class="positive"><strong>+9</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</section>
```

```css
.table-section {
  margin-bottom: 32px;
}

.table-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e1e5e9;
}

.table-card h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 16px;
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

th, td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #e1e5e9;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  color: #1a1a2e;
  white-space: nowrap;
}

td {
  color: #555;
}

td.name-cell {
  font-weight: 500;
  color: #1a1a2e;
}

tbody tr:hover {
  background: #f8f9fa;
}

tfoot td {
  background: #f8f9fa;
  border-top: 2px solid #e1e5e9;
}

td.positive {
  color: #22c55e;
}

td.negative {
  color: #ef4444;
}
```

## Chart.js Examples

### Line Chart (Trends)

```javascript
const trendChart = new Chart(document.getElementById('trendChart'), {
  type: 'line',
  data: {
    labels: ['Dec 19', 'Dec 20', 'Dec 21', 'Dec 22', 'Dec 23', 'Dec 24', 'Dec 25'],
    datasets: [
      {
        label: 'Initiatives',
        data: [5, 7, 6, 8, 4, 9, 8],
        borderColor: '#00A79D',
        backgroundColor: 'rgba(0, 167, 157, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Agents',
        data: [2, 1, 3, 2, 1, 2, 1],
        borderColor: '#C68D6D',
        backgroundColor: 'rgba(198, 141, 109, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, padding: 20 }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  }
});
```

### Bar Chart (Horizontal)

```javascript
const breakdownChart = new Chart(document.getElementById('breakdownChart'), {
  type: 'bar',
  data: {
    labels: ['Finance', 'Treasury', 'Budget', 'Procurement', 'IT'],
    datasets: [
      {
        label: 'Initiatives',
        data: [18, 14, 8, 5, 2],
        backgroundColor: '#00A79D',
        borderRadius: 4
      },
      {
        label: 'Agents',
        data: [5, 4, 2, 1, 0],
        backgroundColor: '#C68D6D',
        borderRadius: 4
      }
    ]
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, padding: 20 }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      },
      y: { grid: { display: false } }
    }
  }
});
```

### Doughnut Chart

```javascript
const pieChart = new Chart(document.getElementById('pieChart'), {
  type: 'doughnut',
  data: {
    labels: ['Concept', 'PoC', 'Validation', 'Pilot', 'Production'],
    datasets: [{
      data: [12, 8, 6, 15, 6],
      backgroundColor: [
        '#00A79D',
        '#C68D6D',
        '#B79546',
        '#8b5cf6',
        '#3b82f6'
      ],
      borderWidth: 0
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { usePointStyle: true, padding: 16 }
      }
    },
    cutout: '60%'
  }
});
```

## Workflow

1. **Get data**: Use `get_variance_report`, `get_use_case_statistics`, or other data tools
2. **Create HTML**: Build complete self-contained HTML file with embedded CSS and Chart.js
3. **Create artifact**: Use `create_artifact` with type `dashboard` to generate downloadable HTML

## Complete Example

Here's a complete dashboard HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portfolio Analytics Dashboard | AI@DoF</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, rgba(0, 167, 157, 0.03) 0%, transparent 50%, rgba(198, 141, 109, 0.03) 100%), #f8f9fa;
      color: #1a1a2e;
      min-height: 100vh;
      padding: 24px;
    }
    .dashboard { max-width: 1400px; margin: 0 auto; }
    .dashboard-header { margin-bottom: 24px; }
    .dashboard-header h1 {
      font-size: 1.75rem; font-weight: 600; color: #1a1a2e;
      display: flex; align-items: center; gap: 12px;
    }
    .dashboard-header h1::before {
      content: ''; width: 4px; height: 28px;
      background: #00A79D; border-radius: 2px;
    }
    .dashboard-header .period { font-size: 0.9rem; color: #77787B; margin-top: 4px; }

    .kpi-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px; margin-bottom: 32px;
    }
    .kpi-card {
      background: linear-gradient(135deg, rgba(0, 167, 157, 0.06) 0%, transparent 50%, rgba(198, 141, 109, 0.06) 100%), rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(16px);
      border-radius: 12px; padding: 24px; text-align: center;
      box-shadow: 0 4px 24px rgba(31, 38, 135, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.8);
    }
    .kpi-label {
      font-size: 0.875rem; font-weight: 500; color: #77787B;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .kpi-value { font-size: 2.5rem; font-weight: 700; color: #1a1a2e; line-height: 1.2; }
    .kpi-variance {
      display: inline-block; padding: 4px 12px; border-radius: 16px;
      font-size: 0.875rem; font-weight: 600; margin-top: 8px;
    }
    .kpi-variance.positive { color: #22c55e; background: rgba(34, 197, 94, 0.1); }
    .kpi-variance.negative { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
    .kpi-sublabel { font-size: 0.75rem; color: #999; margin-top: 4px; }
    .kpi-sublabel-large { font-size: 0.875rem; color: #77787B; margin-top: 8px; }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px; margin-bottom: 32px;
    }
    .chart-card {
      background: white; border-radius: 12px; padding: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); border: 1px solid #e1e5e9;
    }
    .chart-card h3 { font-size: 1rem; font-weight: 600; color: #1a1a2e; margin-bottom: 16px; }
    .chart-container { position: relative; height: 300px; }

    .table-card {
      background: white; border-radius: 12px; padding: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); border: 1px solid #e1e5e9;
    }
    .table-card h3 { font-size: 1rem; font-weight: 600; color: #1a1a2e; margin-bottom: 16px; }
    .table-container { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e1e5e9; }
    th { background: #f8f9fa; font-weight: 600; color: #1a1a2e; }
    td { color: #555; }
    td.name-cell { font-weight: 500; color: #1a1a2e; }
    tbody tr:hover { background: #f8f9fa; }
    tfoot td { background: #f8f9fa; border-top: 2px solid #e1e5e9; }
    td.positive, .positive { color: #22c55e; }
    td.negative, .negative { color: #ef4444; }

    .footer {
      text-align: center; padding: 24px; color: #77787B; font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Portfolio Analytics Dashboard</h1>
      <p class="period">Dec 19, 2025 - Dec 26, 2025 (7 days) vs previous period</p>
    </header>

    <section class="kpi-cards">
      <div class="kpi-card">
        <div class="kpi-label">Initiatives</div>
        <div class="kpi-value">47</div>
        <div class="kpi-variance positive">+9 (+23.7%)</div>
        <div class="kpi-sublabel">vs previous 7 days</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Agents</div>
        <div class="kpi-value">12</div>
        <div class="kpi-variance negative">-2 (-14.3%)</div>
        <div class="kpi-sublabel">vs previous 7 days</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Ratio</div>
        <div class="kpi-value">3.9:1</div>
        <div class="kpi-sublabel-large">Initiatives per Agent</div>
      </div>
    </section>

    <section class="charts-grid">
      <div class="chart-card">
        <h3>Daily Creation Trend</h3>
        <div class="chart-container">
          <canvas id="trendChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <h3>Breakdown by Department</h3>
        <div class="chart-container">
          <canvas id="breakdownChart"></canvas>
        </div>
      </div>
    </section>

    <section class="table-card">
      <h3>Department Details</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Init (Now)</th>
              <th>Init (Prev)</th>
              <th>Var</th>
              <th>Agents (Now)</th>
              <th>Agents (Prev)</th>
              <th>Var</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="name-cell">Finance</td>
              <td>18</td><td>14</td><td class="positive">+4</td>
              <td>5</td><td>4</td><td class="positive">+1</td>
            </tr>
            <tr>
              <td class="name-cell">Treasury</td>
              <td>14</td><td>12</td><td class="positive">+2</td>
              <td>4</td><td>4</td><td>0</td>
            </tr>
            <tr>
              <td class="name-cell">Budget</td>
              <td>8</td><td>7</td><td class="positive">+1</td>
              <td>2</td><td>3</td><td class="negative">-1</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>47</strong></td><td><strong>38</strong></td>
              <td class="positive"><strong>+9</strong></td>
              <td><strong>12</strong></td><td><strong>14</strong></td>
              <td class="negative"><strong>-2</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <footer class="footer">
      Generated by AI@DoF on Dec 26, 2025
    </footer>
  </div>

  <script>
    // Trend Chart
    new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: ['Dec 19', 'Dec 20', 'Dec 21', 'Dec 22', 'Dec 23', 'Dec 24', 'Dec 25'],
        datasets: [
          {
            label: 'Initiatives',
            data: [5, 7, 6, 8, 4, 9, 8],
            borderColor: '#00A79D',
            backgroundColor: 'rgba(0, 167, 157, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Agents',
            data: [2, 1, 3, 2, 1, 2, 1],
            borderColor: '#C68D6D',
            backgroundColor: 'rgba(198, 141, 109, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } },
          tooltip: { mode: 'index', intersect: false, backgroundColor: 'rgba(0, 0, 0, 0.8)', padding: 12, cornerRadius: 8 }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.05)' } }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });

    // Breakdown Chart
    new Chart(document.getElementById('breakdownChart'), {
      type: 'bar',
      data: {
        labels: ['Finance', 'Treasury', 'Budget', 'Procurement', 'IT'],
        datasets: [
          { label: 'Initiatives', data: [18, 14, 8, 5, 2], backgroundColor: '#00A79D', borderRadius: 4 },
          { label: 'Agents', data: [5, 4, 2, 1, 0], backgroundColor: '#C68D6D', borderRadius: 4 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
          y: { grid: { display: false } }
        }
      }
    });
  </script>
</body>
</html>
```

## Required Tools

| Tool | Purpose |
|------|---------|
| `create_artifact` | Create downloadable HTML dashboard (use type: "dashboard") |
| `get_variance_report` | Get analytics data for variance dashboards |
| `get_use_case_statistics` | Get initiative statistics |
| `get_agent_statistics` | Get agent statistics |

## Best Practices

### DO:
- Embed ALL CSS and JavaScript inline (self-contained HTML)
- Use Chart.js CDN link for charts
- Include responsive design for different screen sizes
- Add variance indicators with color coding
- Include a footer with generation timestamp
- Use semantic HTML structure

### DON'T:
- Use external CSS files (won't work when downloaded)
- Use emojis or icons that require external fonts
- Create overly complex layouts
- Forget to include Chart.js script tag
- Use dark mode (keep light theme for printability)

## Output Format

Create the dashboard using `create_artifact` with type `dashboard`:

```javascript
// After building the complete HTML content with embedded CSS and Chart.js
create_artifact({
  type: "dashboard",
  title: "Portfolio Analytics Dashboard",
  data: { content: htmlContent }
})
```

The artifact service will:
- Save the HTML file to the artifacts directory
- Return a download URL for the user
- The user can download and open the HTML file in any browser

**Important:** The HTML content must be a complete, self-contained document with:
- `<!DOCTYPE html>` declaration
- Embedded CSS in `<style>` tags
- Chart.js CDN link
- Embedded JavaScript for charts in `<script>` tags
