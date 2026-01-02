import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { analyticsAPI, VarianceData } from '../../services/apiService';
import { useDomain } from '../../context/DomainContext';
import './VarianceReport.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface VarianceReportProps {
  onClose: () => void;
}

type BreakdownType = 'status' | 'impact' | 'category';
type TimeRange = 7 | 14 | 30 | 90;

const COLORS = {
  initiatives: '#00A79D', // Sea Green
  tasks: '#C68D6D',       // Earthy Brown
  gold: '#B79546',        // Primary Gold
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#77787B'
};

const VarianceReport: React.FC<VarianceReportProps> = ({ onClose }) => {
  const { activeDomain } = useDomain();
  const [data, setData] = useState<VarianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [breakdown, setBreakdown] = useState<BreakdownType>('status');
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!activeDomain?.id) {
      setError('No domain selected');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await analyticsAPI.getVariance({
        days: timeRange,
        domain_id: activeDomain.id,
        breakdown
      });
      setData(result);
    } catch (err) {
      console.error('Failed to fetch variance data:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [activeDomain?.id, timeRange, breakdown]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportPDF = async () => {
    try {
      // Dynamic import to reduce bundle size
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      if (!reportRef.current) return;

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`portfolio-analytics-${timeRange}days-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to export PDF. Please try again.');
    }
  };

  const formatVariance = (variance: number, percent: number) => {
    const sign = variance >= 0 ? '+' : '';
    return `${sign}${variance} (${sign}${percent}%)`;
  };

  const getVarianceClass = (variance: number) => {
    if (variance > 0) return 'variance-positive';
    if (variance < 0) return 'variance-negative';
    return 'variance-neutral';
  };

  // Prepare chart data
  const trendChartData = data ? {
    labels: data.daily.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Initiatives',
        data: data.daily.map(d => d.initiatives),
        borderColor: COLORS.initiatives,
        backgroundColor: `${COLORS.initiatives}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Tasks',
        data: data.daily.map(d => d.tasks),
        borderColor: COLORS.tasks,
        backgroundColor: `${COLORS.tasks}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  } : null;

  const breakdownChartData = data ? {
    labels: data.breakdown.map(b => b.name),
    datasets: [
      {
        label: 'Initiatives',
        data: data.breakdown.map(b => b.initiatives_current),
        backgroundColor: COLORS.initiatives,
        borderRadius: 4
      },
      {
        label: 'Tasks',
        data: data.breakdown.map(b => b.tasks_current),
        backgroundColor: COLORS.tasks,
        borderRadius: 4
      }
    ]
  } : null;

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  };

  const breakdownChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      y: {
        grid: {
          display: false
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="variance-report-overlay">
        <div className="variance-report-modal">
          <div className="variance-report-loading">
            <div className="loading-spinner"></div>
            <p>Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="variance-report-overlay">
        <div className="variance-report-modal">
          <div className="variance-report-error">
            <p>{error}</p>
            <button onClick={fetchData} className="retry-button">Retry</button>
            <button onClick={onClose} className="close-button">Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="variance-report-overlay">
      <div className="variance-report-modal">
        <div className="variance-report-header">
          <div className="header-left">
            <h2>Portfolio Analytics</h2>
            {data && (
              <span className="period-label">
                {data.period.start} to {data.period.end}
              </span>
            )}
          </div>
          <div className="header-right">
            <div className="time-range-selector">
              {([7, 14, 30, 90] as TimeRange[]).map(days => (
                <button
                  key={days}
                  className={`time-range-btn ${timeRange === days ? 'active' : ''}`}
                  onClick={() => setTimeRange(days)}
                >
                  {days}d
                </button>
              ))}
            </div>
            <button onClick={handleExportPDF} className="export-btn">
              Export PDF
            </button>
            <button onClick={onClose} className="close-btn">
              &times;
            </button>
          </div>
        </div>

        <div className="variance-report-content" ref={reportRef}>
          {/* Summary Cards */}
          {data && (
            <div className="summary-cards">
              <div className="stat-card">
                <div className="stat-label">Initiatives</div>
                <div className="stat-value">{data.summary.initiatives.current}</div>
                <div className={`stat-variance ${getVarianceClass(data.summary.initiatives.variance)}`}>
                  {formatVariance(data.summary.initiatives.variance, data.summary.initiatives.percent)}
                </div>
                <div className="stat-sublabel">vs previous {timeRange} days</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Tasks</div>
                <div className="stat-value">{data.summary.tasks.current}</div>
                <div className={`stat-variance ${getVarianceClass(data.summary.tasks.variance)}`}>
                  {formatVariance(data.summary.tasks.variance, data.summary.tasks.percent)}
                </div>
                <div className="stat-sublabel">vs previous {timeRange} days</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Ratio</div>
                <div className="stat-value">{data.summary.ratio}:1</div>
                <div className="stat-sublabel-large">Tasks per Initiative</div>
              </div>
            </div>
          )}

          {/* Trend Chart */}
          <div className="chart-container">
            <h3>Daily Creation Trend</h3>
            <div className="chart-wrapper">
              {trendChartData && (
                <Line data={trendChartData} options={trendChartOptions} />
              )}
            </div>
          </div>

          {/* Breakdown Tabs */}
          <div className="breakdown-section">
            <div className="breakdown-tabs">
              {(['status', 'impact', 'category'] as BreakdownType[]).map(type => (
                <button
                  key={type}
                  className={`breakdown-tab ${breakdown === type ? 'active' : ''}`}
                  onClick={() => setBreakdown(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* Breakdown Chart */}
            <div className="breakdown-chart-container">
              <h3>Breakdown by {breakdown.charAt(0).toUpperCase() + breakdown.slice(1)}</h3>
              <div className="breakdown-chart-wrapper">
                {breakdownChartData && breakdownChartData.labels.length > 0 ? (
                  <Bar data={breakdownChartData} options={breakdownChartOptions} />
                ) : (
                  <div className="no-data-message">No data for selected breakdown</div>
                )}
              </div>
            </div>

            {/* Breakdown Table */}
            {data && data.breakdown.length > 0 && (
              <div className="breakdown-table-container">
                <table className="breakdown-table">
                  <thead>
                    <tr>
                      <th>{breakdown.charAt(0).toUpperCase() + breakdown.slice(1)}</th>
                      <th>Init (Now)</th>
                      <th>Init (Prev)</th>
                      <th>Var</th>
                      <th>Tasks (Now)</th>
                      <th>Tasks (Prev)</th>
                      <th>Var</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((row, idx) => (
                      <tr key={idx}>
                        <td className="breakdown-name">{row.name}</td>
                        <td>{row.initiatives_current}</td>
                        <td>{row.initiatives_previous}</td>
                        <td className={getVarianceClass(row.initiatives_variance)}>
                          {row.initiatives_variance > 0 ? '+' : ''}{row.initiatives_variance}
                        </td>
                        <td>{row.tasks_current}</td>
                        <td>{row.tasks_previous}</td>
                        <td className={getVarianceClass(row.tasks_variance)}>
                          {row.tasks_variance > 0 ? '+' : ''}{row.tasks_variance}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>Total</strong></td>
                      <td><strong>{data.summary.initiatives.current}</strong></td>
                      <td><strong>{data.summary.initiatives.previous}</strong></td>
                      <td className={getVarianceClass(data.summary.initiatives.variance)}>
                        <strong>{data.summary.initiatives.variance > 0 ? '+' : ''}{data.summary.initiatives.variance}</strong>
                      </td>
                      <td><strong>{data.summary.tasks.current}</strong></td>
                      <td><strong>{data.summary.tasks.previous}</strong></td>
                      <td className={getVarianceClass(data.summary.tasks.variance)}>
                        <strong>{data.summary.tasks.variance > 0 ? '+' : ''}{data.summary.tasks.variance}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VarianceReport;
