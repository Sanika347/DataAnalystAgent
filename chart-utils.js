/* chart-utils.js - Custom styling and helpers for premium Chart.js charts */

const ChartUtils = {
  // Global defaults configuration
  configureDefaults() {
    if (typeof Chart === 'undefined') return;
    
    // Set global font settings
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#475569"; // text-muted
    
    // Tooltips
    Chart.defaults.plugins.tooltip.backgroundColor = "#0f172a"; // dark slate
    Chart.defaults.plugins.tooltip.titleFont = { family: "'Outfit', sans-serif", weight: '600', size: 12 };
    Chart.defaults.plugins.tooltip.bodyFont = { family: "'Inter', sans-serif", size: 11 };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.displayColors = true;
    
    // Elements
    Chart.defaults.elements.line.tension = 0.35; // smooth curves
    Chart.defaults.elements.line.borderWidth = 3;
    Chart.defaults.elements.point.radius = 4;
    Chart.defaults.elements.point.hoverRadius = 6;
    Chart.defaults.elements.bar.borderRadius = 4;
  },

  // Color palette matching Indigo Accents Theme
  colors: {
    indigo: '#4f46e5',
    indigoLight: 'rgba(79, 70, 229, 0.1)',
    indigoGlow: 'rgba(79, 70, 229, 0.25)',
    violet: '#7c3aed',
    violetLight: 'rgba(124, 58, 237, 0.1)',
    sky: '#0ea5e9',
    skyLight: 'rgba(14, 165, 233, 0.1)',
    emerald: '#10b981',
    emeraldLight: 'rgba(16, 185, 129, 0.1)',
    rose: '#ef4444',
    roseLight: 'rgba(239, 68, 68, 0.1)',
    amber: '#f59e0b',
    amberLight: 'rgba(245, 158, 11, 0.1)',
    
    sequence: [
      '#4f46e5', // Indigo
      '#7c3aed', // Violet
      '#0ea5e9', // Sky Blue
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ef4444', // Rose
      '#ec4899', // Pink
      '#6366f1'  // Indigo-purple
    ]
  },

  // Track active chart instances to prevent canvas re-use errors
  instances: {},

  destroyChart(canvasId) {
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
      delete this.instances[canvasId];
    }
  },

  renderBarChart(canvasId, labels, data, title, datasetLabel = 'Value') {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: datasetLabel,
          data: data,
          backgroundColor: this.colors.sequence.slice(0, labels.length).length === 1 
            ? this.colors.indigo 
            : this.colors.sequence.slice(0, labels.length),
          borderWidth: 0,
          maxBarThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: !!title,
            text: title,
            font: { family: "'Outfit', sans-serif", size: 14, weight: '600' },
            padding: { bottom: 15 },
            color: '#0f172a'
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, minRotation: 0 }
          },
          y: {
            grid: { color: 'rgba(226, 232, 240, 0.6)' },
            beginAtZero: true
          }
        }
      }
    });
    return this.instances[canvasId];
  },

  renderLineChart(canvasId, labels, data, title, datasetLabel = 'Value') {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Create a beautiful indigo/violet gradient under the line
    const context2d = ctx.getContext('2d');
    let gradient = null;
    if (context2d) {
      gradient = context2d.createLinearGradient(0, 0, 0, 250);
      gradient.addColorStop(0, 'rgba(79, 70, 229, 0.25)');
      gradient.addColorStop(1, 'rgba(79, 70, 229, 0.00)');
    }
    
    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: datasetLabel,
          data: data,
          borderColor: this.colors.indigo,
          backgroundColor: gradient || this.colors.indigoLight,
          fill: true,
          pointBackgroundColor: this.colors.indigo,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: this.colors.indigo,
          pointHoverBorderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: !!title,
            text: title,
            font: { family: "'Outfit', sans-serif", size: 14, weight: '600' },
            padding: { bottom: 15 },
            color: '#0f172a'
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(226, 232, 240, 0.6)' },
            beginAtZero: true
          }
        }
      }
    });
    return this.instances[canvasId];
  },

  renderScatterPlot(canvasId, dataPoints, title, xLabel = 'X Axis', yLabel = 'Y Axis') {
    // dataPoints should be an array of {x, y} objects
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    this.instances[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Data Point',
          data: dataPoints,
          backgroundColor: this.colors.violet,
          borderColor: 'rgba(124, 58, 237, 0.2)',
          borderWidth: 6,
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: !!title,
            text: title,
            font: { family: "'Outfit', sans-serif", size: 14, weight: '600' },
            padding: { bottom: 15 },
            color: '#0f172a'
          }
        },
        scales: {
          x: {
            title: { display: true, text: xLabel, font: { weight: '500' } },
            grid: { color: 'rgba(226, 232, 240, 0.4)' }
          },
          y: {
            title: { display: true, text: yLabel, font: { weight: '500' } },
            grid: { color: 'rgba(226, 232, 240, 0.6)' }
          }
        }
      }
    });
    return this.instances[canvasId];
  },

  renderPieChart(canvasId, labels, data, title) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    this.instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: this.colors.sequence.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              padding: 12,
              font: { size: 10 }
            }
          },
          title: {
            display: !!title,
            text: title,
            font: { family: "'Outfit', sans-serif", size: 14, weight: '600' },
            padding: { bottom: 15 },
            color: '#0f172a'
          }
        },
        cutout: '60%'
      }
    });
    return this.instances[canvasId];
  }
};

// Auto-run config on load
ChartUtils.configureDefaults();
window.ChartUtils = ChartUtils;
