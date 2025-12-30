import React, { useEffect, useState } from 'react';
import { Bubble } from 'react-chartjs-2';
import { Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend } from 'chart.js';
import { UseCase } from '../../types';
import './PrioritizationMatrix.css';
import { useCallback } from 'react';

// Register chart components
ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

interface PrioritizationMatrixProps {
  useCases: UseCase[];
  onUseCaseClick: (useCase: UseCase) => void;
}

const PrioritizationMatrix: React.FC<PrioritizationMatrixProps> = ({ useCases, onUseCaseClick }) => {
  // Detect dark mode
  const [isDarkMode, setIsDarkMode] = useState(() => document.body.classList.contains('dark-mode'));
  
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.body.classList.contains('dark-mode'));
        }
      });
    });
    
    observer.observe(document.body, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Dark mode colors
  const darkModeColors = {
    text: '#EDECF3',
    textSecondary: '#C2C0D1',
    gridLine: 'rgba(157, 122, 234, 0.1)',
    tooltipBg: 'rgba(31, 30, 48, 0.95)',
    tooltipBorder: '#2D293C'
  };

  const lightModeColors = {
    text: '#333',
    textSecondary: '#666',
    gridLine: 'rgba(0, 0, 0, 0.05)',
    tooltipBg: 'rgba(0, 0, 0, 0.85)',
    tooltipBorder: '#ddd'
  };

  const colors = isDarkMode ? darkModeColors : lightModeColors;

  // Define enhanced color functions with gradients and variations
  const getCategoryColors = (category: string) => {
    const colorSchemes: { [key: string]: { primary: string, gradient: string, border: string } } = {
      'Internally deploy LLMs': {
        primary: '#7FCDCD',
        gradient: 'radial-gradient(circle at 30% 30%, #9FE0E0 0%, #7FCDCD 40%, #6AB8B8 100%)',
        border: '#5FA8A8'
      },
      'Leverage Vendor embedded solutions': {
        primary: '#E29C4A',
        gradient: 'radial-gradient(circle at 30% 30%, #F0B870 0%, #E29C4A 40%, #D08835 100%)',
        border: '#C07820'
      },
      'Leverage Copilot': {
        primary: '#4A90E2',
        gradient: 'radial-gradient(circle at 30% 30%, #6BA8F5 0%, #4A90E2 40%, #357ACC 100%)',
        border: '#2060B0'
      },
      'Leverage DGE': {
        primary: '#DAB78E',
        gradient: 'radial-gradient(circle at 30% 30%, #E5CAA8 0%, #DAB78E 40%, #C8A275 100%)',
        border: '#B08860'
      },
      'Build ML': {
        primary: '#4D75A3',
        gradient: 'radial-gradient(circle at 30% 30%, #6D95C3 0%, #4D75A3 40%, #3D5583 100%)',
        border: '#2D4563'
      },
    };
    
    // If category matches predefined schemes, use it
    if (colorSchemes[category]) {
      return colorSchemes[category];
    }
    
    // Generate consistent colors for custom categories based on string hash
    const generateColorFromString = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Generate vibrant colors using HSL with good saturation and lightness
      const hue = Math.abs(hash) % 360;
      const saturation = 55 + (Math.abs(hash >> 8) % 20); // 55-75%
      const lightness = 50 + (Math.abs(hash >> 16) % 15);  // 50-65%
      
      // Convert HSL to hex
      const hslToHex = (h: number, s: number, l: number) => {
        s /= 100;
        l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => {
          const k = (n + h / 30) % 12;
          const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
          return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
      };
      
      const primary = hslToHex(hue, saturation, lightness);
      const lighter = hslToHex(hue, saturation - 10, lightness + 15);
      const darker = hslToHex(hue, saturation + 5, lightness - 15);
      const border = hslToHex(hue, saturation + 10, lightness - 20);
      
      return {
        primary,
        gradient: `radial-gradient(circle at 30% 30%, ${lighter} 0%, ${primary} 40%, ${darker} 100%)`,
        border
      };
    };
    
    return generateColorFromString(category || 'Unknown');
  };

  // Calculate bubble size based on strategic impact and goal alignment count
  const calculateBubbleSize = (strategicImpact: string, goalCount: number, minWeight: number, maxWeight: number): number => {
    const MIN_SIZE = 8;
    const MAX_SIZE = 24;
    
    // Strategic impact weights
    const impactWeights: { [key: string]: number } = {
      'High': 3.0,
      'Medium': 2.0,
      'Low': 1.0
    };
    
    // Calculate total weight: impact weight + (0.5 per goal)
    const impactWeight = impactWeights[strategicImpact] || 2.0;
    const totalWeight = impactWeight + (goalCount * 0.5);
    
    // Handle edge cases
    if (maxWeight === minWeight) return MIN_SIZE + (MAX_SIZE - MIN_SIZE) / 2;
    
    // Linear scaling between min and max
    const ratio = (totalWeight - minWeight) / (maxWeight - minWeight);
    return Math.round(MIN_SIZE + (ratio * (MAX_SIZE - MIN_SIZE)));
  };

  // Calculate feasibility based on data and integration complexity
  const calculateFeasibility = (dataComplexity?: string, integrationComplexity?: string): string => {
    const data = dataComplexity || 'Medium';
    const integration = integrationComplexity || 'Medium';
    
    // Both low = high feasibility
    if (data === 'Low' && integration === 'Low') return 'High';
    
    // Any high = low feasibility 
    if (data === 'High' || integration === 'High') return 'Low';
    
    // Everything else = medium feasibility
    return 'Medium';
  };

  // Calculate min and max weights for scaling
  const impactWeights: { [key: string]: number } = {
    'High': 3.0,
    'Medium': 2.0,
    'Low': 1.0
  };
  
  const weights = useCases.map(uc => {
    const impactWeight = impactWeights[uc.strategic_impact] || 2.0;
    return impactWeight + ((uc.goal_alignment_count || 0) * 0.5);
  });
  
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);

  // Create gradient generator function
  const createGradient = (ctx: CanvasRenderingContext2D, category: string) => {
    const colors = getCategoryColors(category);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    
    // Parse the primary color to create gradient stops
    if (category === 'Internally deploy LLMs') {
      gradient.addColorStop(0, '#9FE0E0');
      gradient.addColorStop(0.5, '#7FCDCD');
      gradient.addColorStop(1, '#6AB8B8');
    } else if (category === 'Leverage Vendor embedded solutions') {
      gradient.addColorStop(0, '#F0B870');
      gradient.addColorStop(0.5, '#E29C4A');
      gradient.addColorStop(1, '#D08835');
    } else if (category === 'Leverage Copilot') {
      gradient.addColorStop(0, '#6BA8F5');
      gradient.addColorStop(0.5, '#4A90E2');
      gradient.addColorStop(1, '#357ACC');
    } else if (category === 'Leverage DGE') {
      gradient.addColorStop(0, '#E5CAA8');
      gradient.addColorStop(0.5, '#DAB78E');
      gradient.addColorStop(1, '#C8A275');
    } else if (category === 'Build ML') {
      gradient.addColorStop(0, '#6D95C3');
      gradient.addColorStop(0.5, '#4D75A3');
      gradient.addColorStop(1, '#3D5583');
    } else {
      gradient.addColorStop(0, '#DDDDDD');
      gradient.addColorStop(0.5, '#CCCCCC');
      gradient.addColorStop(1, '#AAAAAA');
    }
    
    return gradient;
  };

  // Create bubble chart data with improved clustering algorithm
  const datasets: { [key: string]: any } = {};
  const positionClusters: { [key: string]: Array<{x: number, y: number, r: number}> } = {}; // Track positioned bubbles for collision detection
  
  useCases.forEach((uc) => {
    const cat = uc.category;
    if (!datasets[cat]) {
      const colors = getCategoryColors(cat);
      datasets[cat] = {
        label: cat,
        data: [],
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const {ctx} = chart;
          // Store the category for gradient creation
          return colors.primary + 'DD'; // Add transparency for depth
        },
        borderColor: colors.border,
        borderWidth: 1.5,
        hoverBorderWidth: 2.5,
        hoverBorderColor: colors.border,
        hoverBackgroundColor: colors.primary,
      };
    }
    
    // Convert levels to numeric values
    const impactScores: { [key: string]: number } = { 'Low': 1, 'Medium': 2, 'High': 3 };
    const feasibilityScores: { [key: string]: number } = { 'Low': 1, 'Medium': 2, 'High': 3 };
    
    const feasibility = calculateFeasibility(uc.complexity?.data_complexity, uc.complexity?.integration_complexity);
    
    const baseX = impactScores[uc.strategic_impact] || 2;
    const baseY = feasibilityScores[feasibility] || 2;
    const bubbleRadius = calculateBubbleSize(uc.strategic_impact, uc.goal_alignment_count || 0, minWeight, maxWeight);
    
    // Create position key for overlap detection
    const positionKey = `${baseX}-${baseY}`;
    
    // Initialize cluster if it doesn't exist
    if (!positionClusters[positionKey]) {
      positionClusters[positionKey] = [];
    }
    
    // Find a non-overlapping position using spiral placement
    let finalX = baseX;
    let finalY = baseY;
    let positioned = false;
    let attempts = 0;
    const maxAttempts = 50;
    
    // Check if position is available (no collision with existing bubbles)
    const isPositionAvailable = (x: number, y: number, r: number) => {
      // Also check if position is within chart bounds
      if (x < 0.7 || x > 3.3 || y < 0.7 || y > 3.3) {
        return false;
      }
      
      return !positionClusters[positionKey].some(existing => {
        const distance = Math.sqrt(Math.pow(x - existing.x, 2) + Math.pow(y - existing.y, 2));
        const minDistance = (r + existing.r) / 350 + 0.005; // Convert pixel radius to chart units (nearly touching with tiny gap)
        return distance < minDistance;
      });
    };
    
    // Try to place bubble in a tight hexagonal/circular pattern around the base position
    while (!positioned && attempts < maxAttempts) {
      if (attempts === 0) {
        // First bubble goes to exact position
        if (isPositionAvailable(finalX, finalY, bubbleRadius)) {
          positioned = true;
        }
      } else {
        // Place bubbles in concentric rings for tight clustering
        const ring = Math.ceil(Math.sqrt(attempts / 3)); // Which ring this bubble is in
        const angleInRing = (attempts % (ring * 6)) * (2 * Math.PI / (ring * 6)); // Position in the ring
        const ringRadius = ring * 0.04; // Slightly more spacing between rings
        
        finalX = baseX + Math.cos(angleInRing) * ringRadius;
        finalY = baseY + Math.sin(angleInRing) * ringRadius;
        
        if (isPositionAvailable(finalX, finalY, bubbleRadius)) {
          positioned = true;
        }
      }
      attempts++;
    }
    
    // Record the positioned bubble
    positionClusters[positionKey].push({x: finalX, y: finalY, r: bubbleRadius});
    
    datasets[cat].data.push({
      x: finalX, // X-axis: strategic impact with clustering offset
      y: finalY, // Y-axis: feasibility with clustering offset
      r: bubbleRadius, // Weighted bubble size based on impact and goal alignments
      useCase: uc,
      feasibility: feasibility // Store for tooltip
    });
  });
  const data = { datasets: Object.values(datasets) };

  // Chart options with enhanced styling - now with dark mode support
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: { 
          display: true, 
          text: 'Strategic Impact',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
          color: colors.text
        },
        min: 0.5,
        max: 3.5,
        grid: {
          color: colors.gridLine,
          lineWidth: 1,
        },
        ticks: {
          stepSize: 1,
          font: {
            size: 12,
          },
          color: colors.textSecondary,
          callback: function(value: any) {
            const labels = { 1: 'Low', 2: 'Medium', 3: 'High' };
            return labels[value as keyof typeof labels] || value;
          }
        }
      },
      y: {
        title: { 
          display: true, 
          text: 'Feasibility',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
          color: colors.text
        },
        min: 0.5,
        max: 3.5,
        grid: {
          color: colors.gridLine,
          lineWidth: 1,
        },
        ticks: {
          stepSize: 1,
          font: {
            size: 12,
          },
          color: colors.textSecondary,
          callback: function(value: any) {
            const labels = { 1: 'Low', 2: 'Medium', 3: 'High' };
            return labels[value as keyof typeof labels] || value;
          }
        }
      },
    },
    plugins: {
      title: { display: false },
      legend: { 
        display: true,
        position: 'top' as const,
        labels: {
          padding: 15,
          font: {
            size: 12,
            weight: 'bold' as const,
          },
          color: colors.text,
          usePointStyle: true,
          pointStyle: 'circle',
          generateLabels: (chart: any) => {
            const datasets = chart.data.datasets;
            return datasets.map((dataset: any, i: number) => {
              const catColors = getCategoryColors(dataset.label);
              return {
                text: dataset.label,
                fillStyle: catColors.primary,
                strokeStyle: catColors.border,
                lineWidth: 2,
                hidden: !chart.isDatasetVisible(i),
                index: i,
                pointStyle: 'circle',
                fontColor: colors.text,
              };
            });
          }
        }
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (context: any) => {
            const uc = context.dataset.data[context.dataIndex].useCase;
            const strategicImpact = uc.strategic_impact || 'Unknown';
            const feasibility = context.dataset.data[context.dataIndex].feasibility || 'Unknown';
            const dataComplexity = uc.complexity?.data_complexity || 'Unknown';
            const integrationComplexity = uc.complexity?.integration_complexity || 'Unknown';
            const goalCount = uc.goal_alignment_count || 0;
            return [
              `${uc.title}`,
              `Strategic Impact: ${strategicImpact}`,
              `Feasibility: ${feasibility}`,
              `Data Complexity: ${dataComplexity}`,
              `Integration Complexity: ${integrationComplexity}`,
              `Goal Alignments: ${goalCount}`
            ];
          },
        },
      },
    },
    onClick: (event: any, elements: any[]) => {
      if (elements.length > 0) {
        const el = elements[0];
        const uc = (data.datasets[el.datasetIndex].data[el.index] as any).useCase;
        onUseCaseClick(uc);
      }
    },
  };

  // Create debug data for table
  const debugData = useCases.map(uc => {
    const feasibility = calculateFeasibility(uc.complexity?.data_complexity, uc.complexity?.integration_complexity);
    const impactWeight = impactWeights[uc.strategic_impact] || 2.0;
    const totalWeight = impactWeight + ((uc.goal_alignment_count || 0) * 0.5);
    const bubbleSize = calculateBubbleSize(uc.strategic_impact, uc.goal_alignment_count || 0, minWeight, maxWeight);
    
    return {
      title: uc.title,
      strategicImpact: uc.strategic_impact,
      feasibility: feasibility,
      goalAlignments: uc.goal_alignment_count || 0,
      impactWeight: impactWeight,
      totalWeight: totalWeight,
      bubbleSize: bubbleSize,
      category: uc.category
    };
  }).sort((a, b) => b.bubbleSize - a.bubbleSize); // Sort by bubble size descending

  return (
    <div className="prioritization-matrix">
      <div style={{ height: '400px' }}>
        <Bubble data={data} options={options} />
      </div>
      <div className="matrix-legend">
        <p><strong>X-axis:</strong> Strategic Impact (Low, Medium, High)</p>
        <p><strong>Y-axis:</strong> Feasibility (derived from Data + Integration complexity)</p>
        <p><strong>Bubble Size:</strong> Weighted by Strategic Impact (High=3, Med=2, Low=1) + Goal Alignments (0.5 each) | 8-24px scale</p>
        <p><strong>Feasibility Logic:</strong> Both Low = High | Any High = Low | Otherwise = Medium</p>
        <p><strong>Colors:</strong> Initiative Categories</p>
      </div>
      
      {/* Debug Table */}
      <div className="debug-table-container" style={{ marginTop: '20px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Initiative</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Strategic Impact</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Feasibility</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}># Goal Alignments</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Impact Weight</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Total Weight</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Bubble Size (px)</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Category</th>
            </tr>
          </thead>
          <tbody>
            {debugData.map((row, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.title}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{row.strategicImpact}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{row.feasibility}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{row.goalAlignments}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{row.impactWeight}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{row.totalWeight.toFixed(1)}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{row.bubbleSize}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: '10px', fontSize: '11px', color: '#666' }}>
          <strong>Weight Range:</strong> {minWeight.toFixed(1)} - {maxWeight.toFixed(1)} | 
          <strong> Formula:</strong> Impact Weight + (Goal Alignments × 0.5)
        </p>
      </div>
    </div>
  );
};

export default PrioritizationMatrix; 