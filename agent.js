/* agent.js - The Analytical Engine for the Data Analyst Agent */

const Agent = {
  // Global analytical state
  dataset: {
    rawText: "",
    fileName: "",
    fileSizeKB: 0,
    headers: [],
    originalRows: [],  // raw array of objects from PapaParse
    cleanRows: [],     // deduplicated, null-handled, outlier-analyzed
    engineeredRows: [],// after feature engineering
    columnTypes: {},   // header -> 'numeric'|'categorical'|'date'|'text'
    summaryStats: {},  // stats descriptors
    cleaningLogs: [],
    qualityMetrics: {
      score: 100,
      grade: 'A',
      issues: []
    },
    eda: {
      correlations: {},
      groupings: {},
      distributions: {}
    },
    regression: null,
    insights: [],
    recommendations: [],
    businessAnswers: []
  },

  // Helper: infer data types
  inferColumnTypes() {
    const rows = this.dataset.originalRows;
    const headers = this.dataset.headers;
    const types = {};

    headers.forEach(col => {
      let numericCount = 0;
      let dateCount = 0;
      let emptyCount = 0;
      const sampleSize = Math.min(rows.length, 100);

      for (let i = 0; i < sampleSize; i++) {
        const val = String(rows[i][col] || '').trim();
        if (val === '') {
          emptyCount++;
          continue;
        }

        // Check if numeric (handles clean numbers and currency/percentages)
        const cleanNum = val.replace(/[\$,%]/g, '').trim();
        if (!isNaN(cleanNum) && cleanNum !== '') {
          numericCount++;
        }

        // Check if date
        const parsedDate = Date.parse(val);
        // Exclude short numeric strings from being treated as dates (like year 2024 or postal codes)
        if (!isNaN(parsedDate) && isNaN(val) && val.length > 5) {
          dateCount++;
        }
      }

      const validSamples = sampleSize - emptyCount;
      if (validSamples === 0) {
        types[col] = 'text';
      } else if (numericCount / validSamples > 0.7) {
        types[col] = 'numeric';
      } else if (dateCount / validSamples > 0.7) {
        types[col] = 'date';
      } else {
        // Distinguish text and categorical based on unique cardinality in sample
        const uniqueVals = new Set(rows.slice(0, 100).map(r => r[col]).filter(Boolean));
        if (uniqueVals.size < 15) {
          types[col] = 'categorical';
        } else {
          types[col] = 'text';
        }
      }
    });

    this.dataset.columnTypes = types;
  },

  // Step 1: Load Data
  loadData(fileText, fileName, fileSizeKB) {
    return new Promise((resolve, reject) => {
      this.dataset.rawText = fileText;
      this.dataset.fileName = fileName;
      this.dataset.fileSizeKB = fileSizeKB;
      this.dataset.cleaningLogs = [];

      Papa.parse(fileText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            reject("Failed to parse CSV file: " + results.errors[0].message);
            return;
          }
          
          this.dataset.headers = results.meta.fields || [];
          this.dataset.originalRows = results.data;
          
          // Basic check
          if (this.dataset.originalRows.length === 0 || this.dataset.headers.length === 0) {
            reject("CSV is empty or doesn't have valid columns.");
            return;
          }
          
          this.inferColumnTypes();
          
          this.dataset.cleaningLogs.push({
            type: 'info',
            message: `Loaded dataset successfully. ${this.dataset.originalRows.length} rows and ${this.dataset.headers.length} columns detected.`
          });
          
          resolve({
            rowsCount: this.dataset.originalRows.length,
            colsCount: this.dataset.headers.length,
            headers: this.dataset.headers,
            types: this.dataset.columnTypes
          });
        },
        error: (err) => {
          reject(err.message);
        }
      });
    });
  },

  // Step 2: Inspect Dataset
  inspectDataset() {
    const stats = {};
    const rows = this.dataset.originalRows;
    
    this.dataset.headers.forEach(col => {
      const type = this.dataset.columnTypes[col];
      const values = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      const missingCount = rows.length - values.length;
      const missingPct = ((missingCount / rows.length) * 100).toFixed(1);

      if (type === 'numeric') {
        const numValues = values.map(v => {
          if (typeof v === 'number') return v;
          const clean = String(v).replace(/[\$,%]/g, '').trim();
          return parseFloat(clean);
        }).filter(v => !isNaN(v));

        if (numValues.length > 0) {
          numValues.sort((a, b) => a - b);
          const sum = numValues.reduce((a, b) => a + b, 0);
          const mean = sum / numValues.length;
          
          // Median
          const mid = Math.floor(numValues.length / 2);
          const median = numValues.length % 2 !== 0 ? numValues[mid] : (numValues[mid - 1] + numValues[mid]) / 2;
          
          // Std Dev
          const sqDiff = numValues.map(v => Math.pow(v - mean, 2));
          const stdDev = Math.sqrt(sqDiff.reduce((a, b) => a + b, 0) / numValues.length);

          stats[col] = {
            type: 'numeric',
            missingCount,
            missingPct,
            count: numValues.length,
            mean: mean.toFixed(2),
            median: median.toFixed(2),
            min: numValues[0].toFixed(2),
            max: numValues[numValues.length - 1].toFixed(2),
            stdDev: stdDev.toFixed(2)
          };
        } else {
          stats[col] = { type: 'numeric', missingCount, missingPct, count: 0 };
        }
      } else {
        // Categorical / Text / Date
        const frequencies = {};
        values.forEach(v => {
          const s = String(v).trim();
          frequencies[s] = (frequencies[s] || 0) + 1;
        });

        const uniqueVals = Object.keys(frequencies);
        let topVal = "N/A";
        let topFreq = 0;

        uniqueVals.forEach(k => {
          if (frequencies[k] > topFreq) {
            topFreq = frequencies[k];
            topVal = k;
          }
        });

        stats[col] = {
          type: type,
          missingCount,
          missingPct,
          count: values.length,
          uniqueCount: uniqueVals.length,
          topValue: topVal,
          topFreq: topFreq,
          topPct: values.length > 0 ? ((topFreq / values.length) * 100).toFixed(1) : 0
        };
      }
    });

    this.dataset.summaryStats = stats;
    return stats;
  },

  // Step 3: Data Cleaning
  cleanData() {
    const original = this.dataset.originalRows;
    const clean = [];
    const logs = [];
    
    // 1. Remove duplicate rows
    const seen = new Set();
    let duplicateCount = 0;
    
    // 2. Outliers setup
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    const outliersInfo = {};
    
    numericCols.forEach(col => {
      const vals = original.map(r => {
        const v = r[col];
        if (v === null || v === undefined) return null;
        const cleanNum = parseFloat(String(v).replace(/[\$,%]/g, '').trim());
        return isNaN(cleanNum) ? null : cleanNum;
      }).filter(v => v !== null);

      if (vals.length >= 4) {
        vals.sort((a, b) => a - b);
        const q1Idx = Math.floor(vals.length * 0.25);
        const q3Idx = Math.floor(vals.length * 0.75);
        const q1 = vals[q1Idx];
        const q3 = vals[q3Idx];
        const iqr = q3 - q1;
        
        outliersInfo[col] = {
          lower: q1 - 1.5 * iqr,
          upper: q3 + 1.5 * iqr,
          count: 0
        };
      }
    });

    let missingImputed = 0;
    let typeCorrections = 0;

    original.forEach(row => {
      // Create serialized string to verify duplicates
      const serialized = JSON.stringify(row);
      if (seen.has(serialized)) {
        duplicateCount++;
        return; // drop duplicate
      }
      seen.add(serialized);

      // Create clean row
      const cleanRow = { ...row };

      // Apply cleaning per column
      this.dataset.headers.forEach(col => {
        let val = cleanRow[col];
        const type = this.dataset.columnTypes[col];

        // Handles Missing Values
        if (val === null || val === undefined || String(val).trim() === '') {
          missingImputed++;
          if (type === 'numeric') {
            // Impute with median from step 2
            cleanRow[col] = parseFloat(this.dataset.summaryStats[col]?.median || 0);
          } else {
            // Impute with mode/top value or "Unknown"
            cleanRow[col] = this.dataset.summaryStats[col]?.topValue || "Unknown";
          }
          return;
        }

        // Handles Data Type Correction
        if (type === 'numeric' && typeof val !== 'number') {
          const cleanNum = parseFloat(String(val).replace(/[\$,%]/g, '').trim());
          if (!isNaN(cleanNum)) {
            cleanRow[col] = cleanNum;
            typeCorrections++;
          } else {
            // fallback if string cannot be parsed as number
            cleanRow[col] = parseFloat(this.dataset.summaryStats[col]?.median || 0);
            missingImputed++;
          }
        }

        // Check Outliers count
        if (type === 'numeric' && outliersInfo[col]) {
          const numericVal = typeof cleanRow[col] === 'number' ? cleanRow[col] : parseFloat(cleanRow[col]);
          if (numericVal < outliersInfo[col].lower || numericVal > outliersInfo[col].upper) {
            outliersInfo[col].count++;
          }
        }
      });

      clean.push(cleanRow);
    });

    this.dataset.cleanRows = clean;

    // Logging cleanup outcomes
    if (duplicateCount > 0) {
      logs.push({ type: 'success', message: `Deduplication: Removed ${duplicateCount} exact duplicate rows.` });
    } else {
      logs.push({ type: 'info', message: `Deduplication: Checked for duplicates. No duplicates found.` });
    }

    if (missingImputed > 0) {
      logs.push({ type: 'success', message: `Missing Values: Imputed ${missingImputed} empty fields using median (for numerical) or mode/Unknown (for categorical).` });
    }

    if (typeCorrections > 0) {
      logs.push({ type: 'success', message: `Type Conversion: Standardized ${typeCorrections} numerical columns by stripping currency symbols and formatting percentages.` });
    }

    Object.keys(outliersInfo).forEach(col => {
      if (outliersInfo[col].count > 0) {
        logs.push({ 
          type: 'warning', 
          message: `Outlier Detection: Found ${outliersInfo[col].count} extreme outlier values in column "${col}" (threshold: < ${outliersInfo[col].lower.toFixed(1)} or > ${outliersInfo[col].upper.toFixed(1)}).`
        });
      }
    });

    this.dataset.cleaningLogs = logs;
    return {
      cleanedRowsCount: clean.length,
      duplicateCount,
      missingImputed,
      typeCorrections,
      logs
    };
  },

  // Step 4: Data Quality Check
  checkQuality() {
    let score = 100;
    const issues = [];
    const rows = this.dataset.cleanRows;
    const headers = this.dataset.headers;
    const stats = this.dataset.summaryStats;

    // 1. Missing Values penalty
    let totalMissingPct = 0;
    headers.forEach(h => {
      totalMissingPct += parseFloat(stats[h]?.missingPct || 0);
    });
    const avgMissing = totalMissingPct / headers.length;
    if (avgMissing > 0) {
      const penalty = Math.min(Math.round(avgMissing * 2), 25);
      score -= penalty;
      issues.push({
        severity: 'info',
        field: 'Completeness',
        message: `Dataset has an average of ${avgMissing.toFixed(1)}% missing cells. These were filled with statistical averages during cleaning (Score impact: -${penalty}).`
      });
    }

    // 2. Duplicate rows penalty
    const dupCount = this.dataset.originalRows.length - rows.length;
    if (dupCount > 0) {
      const dupPct = (dupCount / this.dataset.originalRows.length) * 100;
      const penalty = Math.min(Math.round(dupPct * 1.5), 15);
      score -= penalty;
      issues.push({
        severity: 'warning',
        field: 'Redundancy',
        message: `Found ${dupCount} duplicate rows (${dupPct.toFixed(1)}% of total rows). Removed during cleaning (Score impact: -${penalty}).`
      });
    }

    // 3. Outlier check penalty
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    let totalOutliers = 0;
    numericCols.forEach(col => {
      const vals = rows.map(r => r[col]);
      vals.sort((a, b) => a - b);
      const q1Idx = Math.floor(vals.length * 0.25);
      const q3Idx = Math.floor(vals.length * 0.75);
      const q1 = vals[q1Idx];
      const q3 = vals[q3Idx];
      const iqr = q3 - q1;
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      
      const count = vals.filter(v => v < lower || v > upper).length;
      totalOutliers += count;
    });

    if (totalOutliers > 0) {
      const outlierPct = (totalOutliers / (rows.length * numericCols.length)) * 100;
      const penalty = Math.min(Math.round(outlierPct * 2), 15);
      score -= penalty;
      issues.push({
        severity: 'warning',
        field: 'Statistical Outliers',
        message: `Detected ${totalOutliers} extreme values (${outlierPct.toFixed(1)}% of numeric points). Outliers are kept to represent true business noise (Score impact: -${penalty}).`
      });
    }

    // 4. Logical constraint checks (business rules)
    // E.g., check if columns like 'Sales', 'Price', 'Quantity', 'Profit' exist and look for invalid rules
    let negativeValues = 0;
    const monetaryKeywords = ['price', 'sales', 'revenue', 'quantity', 'amount', 'profit'];
    headers.forEach(h => {
      const hLower = h.toLowerCase();
      if (this.dataset.columnTypes[h] === 'numeric' && monetaryKeywords.some(kw => hLower.includes(kw))) {
        // Profit can be negative, but Price, Sales, Quantity, etc., should usually be non-negative
        if (!hLower.includes('profit')) {
          const negatives = rows.filter(r => r[h] < 0);
          if (negatives.length > 0) {
            negativeValues += negatives.length;
            issues.push({
              severity: 'error',
              field: h,
              message: `Column "${h}" contains ${negatives.length} negative records, which violates typical business logic constraints.`
            });
          }
        }
      }
    });

    if (negativeValues > 0) {
      const penalty = Math.min(Math.round(negativeValues * 0.5), 20);
      score -= penalty;
    }

    // Grade boundary map
    let grade = 'D';
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';

    this.dataset.qualityMetrics = {
      score: Math.max(10, score),
      grade,
      issues
    };

    return this.dataset.qualityMetrics;
  },

  // Step 5: Exploratory Data Analysis (EDA)
  runEDA() {
    const rows = this.dataset.cleanRows;
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    const categoricalCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'categorical');
    
    // 1. Calculate Pearson correlation matrix
    const correlations = {};
    numericCols.forEach((col1, i) => {
      correlations[col1] = {};
      numericCols.forEach((col2, j) => {
        if (i === j) {
          correlations[col1][col2] = 1.0;
          return;
        }
        
        const xVals = rows.map(r => r[col1]);
        const yVals = rows.map(r => r[col2]);
        
        const xMean = xVals.reduce((a,b)=>a+b,0) / xVals.length;
        const yMean = yVals.reduce((a,b)=>a+b,0) / yVals.length;
        
        let num = 0;
        let denX = 0;
        let denY = 0;
        
        for (let k = 0; k < rows.length; k++) {
          const diffX = xVals[k] - xMean;
          const diffY = yVals[k] - yMean;
          num += diffX * diffY;
          denX += diffX * diffX;
          denY += diffY * diffY;
        }
        
        const r = (denX === 0 || denY === 0) ? 0 : num / Math.sqrt(denX * denY);
        correlations[col1][col2] = parseFloat(r.toFixed(3));
      });
    });

    // 2. Values distributions (top categorical distributions)
    const distributions = {};
    categoricalCols.forEach(col => {
      const counts = {};
      rows.forEach(r => {
        const val = String(r[col] || 'Unknown').trim();
        counts[val] = (counts[val] || 0) + 1;
      });

      // Sort and pick top 5
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      distributions[col] = sorted;
    });

    // 3. Grouping aggregations
    // Group key numeric measures by key categorical dimensions
    const groupings = {};
    if (numericCols.length > 0 && categoricalCols.length > 0) {
      const targetNumeric = numericCols[0]; // e.g. Sales or Profit
      const targetCategorical = categoricalCols[0]; // e.g. Region or Segment
      
      const groups = {};
      rows.forEach(r => {
        const cat = String(r[targetCategorical] || 'Unknown').trim();
        const num = parseFloat(r[targetNumeric]);
        if (!groups[cat]) {
          groups[cat] = { sum: 0, count: 0 };
        }
        groups[cat].sum += num;
        groups[cat].count += 1;
      });

      const groupedResult = {};
      Object.keys(groups).forEach(cat => {
        groupedResult[cat] = {
          sum: parseFloat(groups[cat].sum.toFixed(2)),
          avg: parseFloat((groups[cat].sum / groups[cat].count).toFixed(2))
        };
      });

      groupings[`${targetNumeric}_by_${targetCategorical}`] = groupedResult;
    }

    this.dataset.eda = {
      correlations,
      distributions,
      groupings
    };

    return this.dataset.eda;
  },

  // Step 6: Visualizations Configuration Selection
  generateVisualizations() {
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    const categoricalCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'categorical');
    const dateCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'date');
    const configs = [];

    // Rule 1: Sales / Numeric Over Time (Line Chart)
    if (dateCols.length > 0 && numericCols.length > 0) {
      configs.push({
        id: 'chart-trend',
        type: 'line',
        title: `Trend of ${numericCols[0]} over Time`,
        xAxis: dateCols[0],
        yAxis: numericCols[0],
        description: 'Line chart demonstrating changes and seasonal trends over time.'
      });
    }

    // Rule 2: Numeric Breakdown by Categorical (Bar Chart)
    if (categoricalCols.length > 0 && numericCols.length > 0) {
      configs.push({
        id: 'chart-breakdown',
        type: 'bar',
        title: `${numericCols[0]} by ${categoricalCols[0]}`,
        xAxis: categoricalCols[0],
        yAxis: numericCols[0],
        description: 'Bar chart comparing performance totals across top groups.'
      });
    }

    // Rule 3: Correlation Relationship (Scatter Plot)
    if (numericCols.length >= 2) {
      configs.push({
        id: 'chart-relationship',
        type: 'scatter',
        title: `${numericCols[0]} vs ${numericCols[1]} Relationship`,
        xAxis: numericCols[1],
        yAxis: numericCols[0],
        description: 'Scatter plot visualizing density and covariance between key metrics.'
      });
    }

    // Rule 4: Volume Category Distribution (Pie Chart)
    if (categoricalCols.length > 0) {
      configs.push({
        id: 'chart-distribution',
        type: 'pie',
        title: `Distribution of Records by ${categoricalCols[0]}`,
        xAxis: categoricalCols[0],
        description: 'Pie breakdown showing proportionate size of major variables.'
      });
    }

    return configs;
  },

  // Step 7: Feature Engineering
  engineerFeatures() {
    const originalRows = this.dataset.cleanRows;
    if (!originalRows || originalRows.length === 0) {
      return { featuresCount: 0, logs: ["No data loaded to engineer features."] };
    }
    
    const dateCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'date');
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    
    const engineered = [];
    const logs = [];
    
    // We will calculate statistics for binning
    const tertiles = {};
    numericCols.forEach(col => {
      const vals = originalRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v)).sort((a, b) => a - b);
      if (vals.length >= 10) {
        const t1 = vals[Math.floor(vals.length * 0.33)];
        const t2 = vals[Math.floor(vals.length * 0.67)];
        tertiles[col] = { t1, t2 };
      }
    });

    originalRows.forEach(row => {
      const engRow = { ...row };

      // 1. Date Features
      dateCols.forEach(col => {
        const dVal = Date.parse(row[col]);
        if (!isNaN(dVal)) {
          const date = new Date(dVal);
          engRow[`${col}_Year`] = date.getFullYear();
          engRow[`${col}_Month`] = date.getMonth() + 1;
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          engRow[`${col}_DayOfWeek`] = days[date.getDay()];
          const month = date.getMonth() + 1;
          let season = 'Winter';
          if (month >= 3 && month <= 5) season = 'Spring';
          else if (month >= 6 && month <= 8) season = 'Summer';
          else if (month >= 9 && month <= 11) season = 'Autumn';
          engRow[`${col}_Season`] = season;
        }
      });

      // 2. Skewness / Log Transforms
      numericCols.forEach(col => {
        const colLower = col.toLowerCase();
        if (colLower.includes('budget') || colLower.includes('collection') || colLower.includes('sales') || colLower.includes('revenue') || colLower.includes('price')) {
          const val = parseFloat(row[col]) || 0;
          engRow[`Log_${col}`] = parseFloat(Math.log1p(Math.max(0, val)).toFixed(4));
        }
      });

      // 3. Binning of continuous variables
      numericCols.forEach(col => {
        const colLower = col.toLowerCase();
        if (colLower.includes('budget') || colLower.includes('collection') || colLower.includes('price') || colLower.includes('sales') || colLower.includes('rating')) {
          const val = parseFloat(row[col]);
          if (!isNaN(val) && tertiles[col]) {
            const { t1, t2 } = tertiles[col];
            let bin = "Medium";
            if (val <= t1) bin = "Low";
            else if (val > t2) bin = "High";
            engRow[`${col}_Bin`] = bin;
          } else {
            engRow[`${col}_Bin`] = "Unknown";
          }
        }
      });

      // 4. Financial / Success Ratios (ROI, Margins)
      const collCol = numericCols.find(c => c.toLowerCase().includes('collection') || c.toLowerCase().includes('sales') || c.toLowerCase().includes('revenue'));
      const budgCol = numericCols.find(c => c.toLowerCase().includes('budget') || c.toLowerCase().includes('cost'));
      if (collCol && budgCol) {
        const coll = parseFloat(row[collCol]);
        const budg = parseFloat(row[budgCol]);
        if (!isNaN(coll) && !isNaN(budg) && budg !== 0) {
          engRow['ROI_Multiple'] = parseFloat((coll / budg).toFixed(3));
        } else {
          engRow['ROI_Multiple'] = 0.00;
        }
      }

      const profCol = numericCols.find(c => c.toLowerCase().includes('profit'));
      const revCol = numericCols.find(c => c.toLowerCase().includes('sales') || c.toLowerCase().includes('revenue') || c.toLowerCase().includes('collection'));
      if (profCol && revCol) {
        const prof = parseFloat(row[profCol]);
        const rev = parseFloat(row[revCol]);
        if (!isNaN(prof) && !isNaN(rev) && rev !== 0) {
          engRow['Profit_Margin_Pct'] = parseFloat(((prof / rev) * 100).toFixed(2));
        } else {
          engRow['Profit_Margin_Pct'] = 0.00;
        }
      }

      engineered.push(engRow);
    });

    this.dataset.engineeredRows = engineered;

    // Build transformation logs dynamically
    if (dateCols.length > 0) {
      logs.push(`Extracted Year, Month, DayOfWeek, and Season fields from date column "${dateCols[0]}".`);
    }
    
    const sample = engineered[0] || {};
    const addedKeys = Object.keys(sample).filter(k => !this.dataset.headers.includes(k));
    
    addedKeys.forEach(k => {
      if (k.startsWith('Log_')) {
        const orig = k.replace('Log_', '');
        if (!logs.some(l => l.includes(`Logarithmic scale transform on "${orig}"`))) {
          logs.push(`Calculated Logarithmic scale transform on "${orig}" to linearize regression variance.`);
        }
      }
      if (k.endsWith('_Bin')) {
        const orig = k.replace('_Bin', '');
        if (!logs.some(l => l.includes(`Binned continuous metric "${orig}"`))) {
          logs.push(`Binned continuous metric "${orig}" into Low, Medium, and High categories using dataset tertile percentiles.`);
        }
      }
      if (k === 'ROI_Multiple') {
        logs.push(`Computed ROI Multiple ratio combining divided columns.`);
      }
      if (k === 'Profit_Margin_Pct') {
        logs.push(`Calculated Profit Margin percentage from revenue/sales metrics.`);
      }
    });

    if (logs.length === 0) {
      logs.push("Scanned schema for standard ratios or time fields. Kept variables standard.");
    }

    return {
      featuresCount: addedKeys.length,
      logs
    };
  },

  // Step 9: Statistical Analysis
  runStatisticalAnalysis() {
    const rows = this.dataset.cleanRows;
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');

    if (numericCols.length < 2) {
      this.dataset.regression = null;
      return null;
    }

    // Find highest absolute correlation pair
    let maxR = -1;
    let targetX = numericCols[0];
    let targetY = numericCols[1];

    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const col1 = numericCols[i];
        const col2 = numericCols[j];
        const rVal = this.dataset.eda.correlations[col1]?.[col2] || 0;
        if (Math.abs(rVal) > maxR && rVal !== 1.0) {
          maxR = Math.abs(rVal);
          // Set X as the one with smaller values or common independent indicators (e.g. Price, spend, quantity)
          const c1L = col1.toLowerCase();
          const c2L = col2.toLowerCase();
          if (c1L.includes('price') || c1L.includes('spend') || c1L.includes('cost') || c1L.includes('qty') || c1L.includes('quantity')) {
            targetX = col1;
            targetY = col2;
          } else {
            targetX = col2;
            targetY = col1;
          }
        }
      }
    }

    const r = this.dataset.eda.correlations[targetX]?.[targetY] || 0;
    const xVals = rows.map(r => r[targetX]);
    const yVals = rows.map(r => r[targetY]);

    const N = rows.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

    for (let i = 0; i < N; i++) {
      const x = xVals[i];
      const y = yVals[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    }

    // Slope (m) and Intercept (b) for y = mx + b
    const denom = (N * sumXX - sumX * sumX);
    const m = denom === 0 ? 0 : (N * sumXY - sumX * sumY) / denom;
    const b = (sumY - m * sumX) / N;

    // R-squared
    const r2 = r * r;

    // P-value estimate based on t-distribution of correlation coefficient
    // t = r * sqrt((n-2)/(1-r^2))
    let pVal = 0.05;
    if (r2 < 1.0 && N > 2) {
      const tStat = Math.abs(r) * Math.sqrt((N - 2) / (1 - r2));
      // Simple approximation of p-value for large N t-distribution
      if (tStat > 3.29) pVal = 0.001; // extremely significant
      else if (tStat > 2.58) pVal = 0.01;
      else if (tStat > 1.96) pVal = 0.05;
      else pVal = 0.5; // not significant
    }

    this.dataset.regression = {
      independent: targetX,
      dependent: targetY,
      correlation: r,
      r2: parseFloat(r2.toFixed(3)),
      slope: parseFloat(m.toFixed(4)),
      intercept: parseFloat(b.toFixed(4)),
      pValue: pVal,
      isSignificant: pVal <= 0.05
    };

    return this.dataset.regression;
  },

  // Step 8: Answer Business Questions (Gemini API or local rules)
  findReferencedColumns(q) {
    const qLower = q.toLowerCase().replace(/[^a-z0-9_ ]/g, ' '); // remove punctuation
    const qWords = qLower.split(/\s+/).filter(Boolean);
    const headers = this.dataset.headers;
    const columnTypes = this.dataset.columnTypes;
    
    let matchedCols = [];
    
    headers.forEach(h => {
      const hLower = h.toLowerCase();
      const hWords = hLower.split(/[^a-z0-9]/).filter(Boolean);
      
      let isMatch = false;
      
      // 1. Direct matching
      if (qLower.includes(hLower)) {
        isMatch = true;
      }
      
      // 2. Word overlap (if any word in header matches a word in the question)
      if (!isMatch) {
        hWords.forEach(hw => {
          if (hw.length > 2 && qWords.includes(hw)) {
            isMatch = true;
          }
        });
      }
      
      // 3. Synonym matching based on header type & words
      if (!isMatch) {
        // Sales/Revenue synonyms
        if (hLower.includes('sale') || hLower.includes('revenue') || hLower.includes('collection') || hLower.includes('income')) {
          if (qLower.includes('sales') || qLower.includes('revenue') || qLower.includes('collection') || qLower.includes('earn') || qLower.includes('income')) {
            isMatch = true;
          }
        }
        // Profit synonyms
        if (hLower.includes('profit') || hLower.includes('margin') || hLower.includes('gain')) {
          if (qLower.includes('profit') || qLower.includes('margin') || qLower.includes('gain') || qLower.includes('success')) {
            isMatch = true;
          }
        }
        // Cost/Budget synonyms
        if (hLower.includes('cost') || hLower.includes('expense') || hLower.includes('budget') || hLower.includes('spend')) {
          if (qLower.includes('cost') || qLower.includes('expense') || qLower.includes('budget') || qLower.includes('spend') || qLower.includes('expenditure')) {
            isMatch = true;
          }
        }
        // Ratings/Critic synonyms
        if (hLower.includes('rating') || hLower.includes('review') || hLower.includes('score') || hLower.includes('critic')) {
          if (qLower.includes('rating') || qLower.includes('review') || qLower.includes('score') || qLower.includes('critic') || qLower.includes('audience') || qLower.includes('critic rating')) {
            isMatch = true;
          }
        }
        // Quantity/Views/Hashtags synonyms
        if (hLower.includes('qty') || hLower.includes('quantity') || hLower.includes('view') || hLower.includes('hashtag') || hLower.includes('volume') || hLower.includes('count')) {
          if (qLower.includes('quantity') || qLower.includes('qty') || qLower.includes('volume') || qLower.includes('views') || qLower.includes('hashtags') || qLower.includes('count')) {
            isMatch = true;
          }
        }
        // Award/Oscar synonyms
        if (hLower.includes('award') || hLower.includes('oscar') || hLower.includes('win')) {
          if (qLower.includes('award') || qLower.includes('oscar') || qLower.includes('win') || qLower.includes('recognition')) {
            isMatch = true;
          }
        }
        // Date synonyms
        if (hLower.includes('date') || hLower.includes('year') || hLower.includes('time')) {
          if (qLower.includes('date') || qLower.includes('time') || qLower.includes('trend') || qLower.includes('timeline') || qLower.includes('monthly') || qLower.includes('yearly') || qLower.includes('season')) {
            isMatch = true;
          }
        }
      }
      
      if (isMatch) {
        matchedCols.push({ header: h, type: columnTypes[h] });
      }
    });
    
    return matchedCols;
  },

  generateLocalQuestionAnswer(q) {
    const qLower = q.toLowerCase();
    const stats = this.dataset.summaryStats;
    const headers = this.dataset.headers;
    const cleanRows = this.dataset.cleanRows;
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    const categoricalCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'categorical');
    const dateCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'date');

    const matched = this.findReferencedColumns(q);
    const numericMatches = matched.filter(m => m.type === 'numeric');
    const categoricalMatches = matched.filter(m => m.type === 'categorical');
    const dateMatches = matched.filter(m => m.type === 'date');

    // Case 1: Numeric breakdown by Categorical (e.g. Sales by Product_Category)
    if (categoricalMatches.length > 0 && numericMatches.length > 0) {
      const catCol = categoricalMatches[0].header;
      const numCol = numericMatches[0].header;

      const groups = {};
      cleanRows.forEach(r => {
        const catVal = String(r[catCol] || 'Unknown').trim();
        const numVal = parseFloat(r[numCol]) || 0;
        if (!groups[catVal]) groups[catVal] = { sum: 0, count: 0 };
        groups[catVal].sum += numVal;
        groups[catVal].count++;
      });

      const sortedGroups = Object.entries(groups).sort((a, b) => b[1].sum - a[1].sum);
      const topGroup = sortedGroups[0];
      
      let answerText = `To answer your question, we grouped and aggregated the total **${numCol}** for each **${catCol}** segment:\n\n`;
      if (topGroup) {
        answerText += `- **Top Performing Segment**: **"${topGroup[0]}"** generated the highest total **${numCol}** of **$${topGroup[1].sum.toLocaleString()}** (averaging **$${(topGroup[1].sum / topGroup[1].count).toFixed(2)}** across **${topGroup[1].count}** transactions).\n`;
      }
      
      answerText += `\n**Full Category Breakdown:**\n`;
      sortedGroups.forEach(([name, data]) => {
        answerText += `- **${name}**: Total **$${data.sum.toLocaleString()}** | Average **$${(data.sum/data.count).toFixed(2)}** (${data.count} records)\n`;
      });

      return {
        question: q,
        answer: answerText,
        visualization: {
          type: 'bar',
          title: `Total ${numCol} by ${catCol}`,
          xAxisColumn: catCol,
          yAxisColumn: numCol,
          description: `Bar chart illustrating the total sum of ${numCol} accumulated across all unique categories of ${catCol}.`
        }
      };
    }

    // Case 2: Numeric Trend Over Time (e.g. Sales trend over Date)
    if (numericMatches.length > 0 && (dateMatches.length > 0 || qLower.includes('trend') || qLower.includes('over time') || qLower.includes('timeline') || qLower.includes('chronological') || qLower.includes('date'))) {
      const dateCol = dateMatches.length > 0 ? dateMatches[0].header : (dateCols[0] || null);
      const numCol = numericMatches[0].header;

      if (dateCol) {
        const groupedData = {};
        cleanRows.forEach(r => {
          const dateVal = String(r[dateCol] || 'Unknown').substring(0, 10);
          const numVal = parseFloat(r[numCol]) || 0;
          if (!groupedData[dateVal]) groupedData[dateVal] = { sum: 0, count: 0 };
          groupedData[dateVal].sum += numVal;
          groupedData[dateVal].count++;
        });

        const sortedDates = Object.keys(groupedData).sort((a, b) => Date.parse(a) - Date.parse(b));
        const numPeriods = sortedDates.length;
        const totalSum = cleanRows.reduce((acc, r) => acc + (parseFloat(r[numCol]) || 0), 0);
        
        let peakDate = "";
        let peakVal = -Infinity;
        sortedDates.forEach(d => {
          if (groupedData[d].sum > peakVal) {
            peakVal = groupedData[d].sum;
            peakDate = d;
          }
        });

        let answerText = `We analyzed the chronological trend of **${numCol}** over time using the **${dateCol}** column across **${numPeriods}** distinct periods:\n\n`;
        answerText += `- **Total Accumulated**: **$${totalSum.toLocaleString()}** across the entire dataset.\n`;
        answerText += `- **Peak Activity Period**: **${peakDate}** registered the highest concentration of total **${numCol}** amounting to **$${peakVal.toLocaleString()}**.\n`;
        answerText += `- **Transaction Range**: Period values range from a minimum of **$${stats[numCol].min.toLocaleString()}** to a maximum of **$${stats[numCol].max.toLocaleString()}**.\n\n`;
        answerText += `The line graph displays the time-series activity.`;

        return {
          question: q,
          answer: answerText,
          visualization: {
            type: 'line',
            title: `${numCol} Trend Over Time (${dateCol})`,
            xAxisColumn: dateCol,
            yAxisColumn: numCol,
            description: `Chronological line chart demonstrating seasonal movements, trends, and outliers for ${numCol}.`
          }
        };
      }
    }

    // Case 3: Relationship / Correlation between two numeric variables (e.g. Unit_Price vs Profit)
    if (numericMatches.length >= 2 || (numericMatches.length === 1 && (qLower.includes('relationship') || qLower.includes('correlation') || qLower.includes('vs') || qLower.includes('impact') || qLower.includes('influence') || qLower.includes('affect')))) {
      const independent = numericMatches[0].header;
      const dependent = numericMatches[1]?.header || numericCols.find(c => c !== independent) || null;

      if (independent && dependent) {
        const rVal = this.dataset.eda.correlations[independent]?.[dependent] || 0;
        const r2 = rVal * rVal;
        const strength = Math.abs(rVal) > 0.7 ? "strong" : (Math.abs(rVal) > 0.4 ? "moderate" : "weak");
        const direction = rVal > 0 ? "positive" : "negative";
        
        let answerText = `We ran a correlation analysis to study the relationship between **${independent}** and **${dependent}**:\n\n`;
        answerText += `- **Correlation Strength & Direction**: The variables share a **${strength} ${direction} correlation** (Pearson coefficient r = **${rVal}**).\n`;
        answerText += `- **Co-variance ($R^2$)**: Approximately **${(r2 * 100).toFixed(1)}%** of the variance in "${dependent}" is directly explained by changes in "${independent}".\n`;
        
        if (this.dataset.regression && (this.dataset.regression.independent === independent || this.dataset.regression.independent === dependent)) {
          const reg = this.dataset.regression;
          answerText += `- **Predictive Linear Model**: The relationship behaves according to the regression formula: \`${reg.dependent} = (${reg.slope}) * ${reg.independent} + (${reg.intercept})\`.\n`;
          answerText += `- **Significance**: This covariance test registers a p-value of **${reg.pValue}** (${reg.isSignificant ? 'statistically significant' : 'not statistically significant'} at a 95% confidence interval).\n`;
        }

        return {
          question: q,
          answer: answerText,
          visualization: {
            type: 'scatter',
            title: `${dependent} vs ${independent} Relationship`,
            xAxisColumn: independent,
            yAxisColumn: dependent,
            description: `Scatter plot visualizing how individual transactions distribute relative to ${independent} and ${dependent}.`
          }
        };
      }
    }

    // Case 4: Categorical Column Distribution (e.g. Count of Region)
    if (categoricalMatches.length > 0) {
      const catCol = categoricalMatches[0].header;
      const s = stats[catCol];
      const dist = this.dataset.eda.distributions[catCol] || [];

      let answerText = `We computed the transaction distribution and frequency density across the categorical segments of **${catCol}**:\n\n`;
      answerText += `- **Unique Segments**: The column contains **${s.uniqueCount}** distinct categories.\n`;
      answerText += `- **Dominant Category**: **"${s.topValue}"** constitutes **${s.topPct}%** of the total volume with **${s.topFreq}** records.\n\n`;
      answerText += `**Distribution Breakdown:**\n`;
      dist.forEach(([val, count]) => {
        const pct = ((count / cleanRows.length) * 100).toFixed(1);
        answerText += `- **"${val}"**: **${count}** rows (${pct}%)\n`;
      });

      return {
        question: q,
        answer: answerText,
        visualization: {
          type: 'pie',
          title: `Distribution by ${catCol}`,
          xAxisColumn: catCol,
          yAxisColumn: null,
          description: `Doughnut chart demonstrating proportional transaction concentration across different ${catCol} segments.`
        }
      };
    }

    // Case 5: Single Numeric metric summary (e.g. What is the average quantity?)
    if (numericMatches.length > 0) {
      const numCol = numericMatches[0].header;
      const s = stats[numCol];
      const totalSum = cleanRows.reduce((acc, r) => acc + (parseFloat(r[numCol]) || 0), 0);

      let answerText = `We generated descriptive statistical indicators for the metric **${numCol}** across all transactions:\n\n`;
      answerText += `- **Average (Mean)**: **${s.mean}**\n`;
      answerText += `- **Median**: **${s.median}**\n`;
      answerText += `- **Total Sum**: **$${totalSum.toLocaleString()}**\n`;
      answerText += `- **Range**: Minimum value of **${s.min}** to a maximum value of **${s.max}**\n`;
      answerText += `- **Spread (StdDev)**: **${s.stdDev}**\n\n`;

      // Draw by category if possible
      const altCat = categoricalCols[0] || null;
      if (altCat) {
        answerText += `The bar chart below compares the average ${numCol} across different ${altCat} groups.`;
        return {
          question: q,
          answer: answerText,
          visualization: {
            type: 'bar',
            title: `Average ${numCol} by ${altCat}`,
            xAxisColumn: altCat,
            yAxisColumn: numCol,
            description: `Bar chart illustrating how average ${numCol} levels distribute across ${altCat} groups.`
          }
        };
      }

      return {
        question: q,
        answer: answerText,
        visualization: {
          type: 'none',
          title: null,
          xAxisColumn: null,
          yAxisColumn: null
        }
      };
    }

    // Case 6: Fallback Default (Breakdown of first numeric by first categorical)
    const fallbackCatCol = categoricalCols[0] || headers.find(h => this.dataset.columnTypes[h] === 'categorical') || null;
    const fallbackNumCol = numericCols[0] || headers.find(h => this.dataset.columnTypes[h] === 'numeric') || null;

    if (fallbackCatCol && fallbackNumCol) {
      const groups = {};
      cleanRows.forEach(r => {
        const catVal = String(r[fallbackCatCol] || 'Unknown').trim();
        const numVal = parseFloat(r[fallbackNumCol]) || 0;
        if (!groups[catVal]) groups[catVal] = { sum: 0, count: 0 };
        groups[catVal].sum += numVal;
        groups[catVal].count++;
      });
      const sorted = Object.entries(groups).sort((a,b) => b[1].sum - a[1].sum);
      const topGroup = sorted[0];

      let answerText = `We analyzed the general dataset structure since the question did not match specific column names. Profiling **${fallbackNumCol}** by category **${fallbackCatCol}**:\n\n`;
      if (topGroup) {
        answerText += `- **Top Category**: The **"${topGroup[0]}"** category registered the highest total ${fallbackNumCol} with **$${topGroup[1].sum.toLocaleString()}**.\n`;
      }
      answerText += `- **Dataset Size**: Contains **${cleanRows.length}** active records and **${headers.length}** features.\n- **Quality grade**: **${this.dataset.qualityMetrics.grade}** (Score: ${this.dataset.qualityMetrics.score}/100).\n\n`;
      answerText += `Please adjust your question to reference specific headers like: *${headers.slice(0, 4).join(', ')}*.`;

      return {
        question: q,
        answer: answerText,
        visualization: {
          type: 'bar',
          title: `Total ${fallbackNumCol} by ${fallbackCatCol}`,
          xAxisColumn: fallbackCatCol,
          yAxisColumn: fallbackNumCol,
          description: `General summary visualization showing totals of ${fallbackNumCol} per ${fallbackCatCol}.`
        }
      };
    }

    return {
      question: q,
      answer: `Analysis of the dataset shows we have **${cleanRows.length}** clean rows across **${headers.length}** columns (Grade: **${this.dataset.qualityMetrics.grade}**). We could not match your question words to columns. Available fields are: **${headers.join(', ')}**. Please rephrase your question referencing these columns.`,
      visualization: {
        type: 'none',
        title: null,
        xAxisColumn: null,
        yAxisColumn: null
      }
    };
  },

  async answerBusinessQuestions(apiKey, modelName, objective, questions, decisions) {
    const qList = questions.split('\n').map(q => q.trim()).filter(Boolean);
    if (qList.length === 0) return [];

    if (!apiKey) {
      // Smart Local mode answers
      const answers = [];
      qList.forEach((q, idx) => {
        const localAns = this.generateLocalQuestionAnswer(q);
        answers.push(localAns);
      });
      this.dataset.businessAnswers = answers;
      return answers;
    }

    // Call actual Gemini API
    const systemPrompt = `You are an expert Data Analyst Agent. Analyze the provided dataset metadata, descriptive statistics, and quality reports, and write comprehensive, structured, and clear business answers to the user's questions. Align your answers with their core objectives and target decisions. Make sure answers are factual and backed directly by the data statistics. Avoid generic explanations.

You MUST respond with a valid JSON array of answer objects. Each object in the array must strictly match the following schema (return ONLY raw JSON, do NOT wrap it in backticks like \`\`\`json or add markdown formatting to the outer JSON structure):
[
  {
    "question": "The exact business question from the list",
    "answer": "Detailed markdown text answer supported by data counts, averages, or percentages",
    "visualization": {
      "type": "bar|line|scatter|pie|none",
      "title": "A descriptive title for a chart related to this answer",
      "xAxisColumn": "Exact column name from the dataset headers to use for the X-axis",
      "yAxisColumn": "Exact column name from the dataset headers to use for the Y-axis (or null if not needed)"
    }
  }
]

For visualization type:
- Use 'bar' for comparing numeric values across categories (e.g., Sales by Product_Category).
- Use 'line' for numeric trends over time (requires a date/time column on X-axis).
- Use 'scatter' for showing the relationship between two numeric columns.
- Use 'pie' for showing proportional distribution of a categorical column.
- Use 'none' if no meaningful chart can represent the answer.

The column names in xAxisColumn and yAxisColumn MUST EXACTLY match the capitalization and spelling of the dataset headers. If you recommend a visualization, ensure it uses valid columns that actually exist.`;
    
    // Construct dataset context description
    const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
    const categoricalCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'categorical');
    const dateCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'date');

    let statsSummary = "";
    numericCols.forEach(col => {
      const s = this.dataset.summaryStats[col];
      if (s) statsSummary += `- Column "${col}" (Numeric): Mean=${s.mean}, Median=${s.median}, Min=${s.min}, Max=${s.max}, StdDev=${s.stdDev}. Missing=${s.missingPct}%\n`;
    });
    categoricalCols.forEach(col => {
      const s = this.dataset.summaryStats[col];
      if (s) statsSummary += `- Column "${col}" (Categorical): UniqueCount=${s.uniqueCount}, MostFrequentValue="${s.topValue}" (comprising ${s.topPct}% of records). Missing=${s.missingPct}%\n`;
    });

    let edaSummary = "Correlation pairs:\n";
    numericCols.forEach(c1 => {
      numericCols.forEach(c2 => {
        if (c1 !== c2) {
          edaSummary += `  - Correlation between ${c1} and ${c2}: ${this.dataset.eda.correlations[c1]?.[c2] || 0}\n`;
        }
      });
    });

    let regressionSummary = "N/A";
    if (this.dataset.regression) {
      const reg = this.dataset.regression;
      regressionSummary = `Linear Regression modeling: ${reg.dependent} = (${reg.slope}) * ${reg.independent} + (${reg.intercept}). R-squared: ${reg.r2}. Statistical Significance p-value: ${reg.pValue}.`;
    }

    const finalPrompt = `
PROJECT CONTEXT:
- Objective: ${objective}
- Key Decisions to make: ${decisions}

DATASET SUMMARY:
- File Name: ${this.dataset.fileName}
- Record Count: ${this.dataset.cleanRows.length} rows (after deduplication)
- Columns Detected (Headers): ${this.dataset.headers.join(', ')}
- Data Quality Grade: ${this.dataset.qualityMetrics.grade} (Score: ${this.dataset.qualityMetrics.score}/100)

DESCRIPTIVE STATISTICS:
${statsSummary}

RELATIONSHIP ANALYSIS:
${edaSummary}
${regressionSummary}

BUSINESS QUESTIONS TO ANSWER:
${qList.map((q, i) => `${i+1}. ${q}`).join('\n')}

INSTRUCTIONS:
Generate a clear JSON response containing detailed business answers to each question. Each answer should be concrete, referencing statistical counts, averages, correlations, or percentages from the data profile. Follow the schema strictly.
`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n" + finalPrompt }] }]
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "API call failed");
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      
      // Clean markdown wrappers if any
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        this.dataset.businessAnswers = parsed;
        return parsed;
      } else if (parsed.answers && Array.isArray(parsed.answers)) {
        this.dataset.businessAnswers = parsed.answers;
        return parsed.answers;
      }
      throw new Error("Invalid response format - not an array");
    } catch (err) {
      console.error("Gemini API Error, falling back to local analyzer", err);
      // Fallback
      const answers = [];
      qList.forEach((q, idx) => {
        const localAns = this.generateLocalQuestionAnswer(q);
        localAns.answer += `\n\n*(Note: Gemini API call failed: ${err.message}. Showing rule-based statistical fallback answer)*`;
        answers.push(localAns);
      });
      this.dataset.businessAnswers = answers;
      return answers;
    }
  },

  // Steps 11 & 12: Generate Insights & Recommendations (Gemini or Local rules)
  async generateInsightsAndRecommendations(apiKey, modelName, objective, decisions) {
    if (!apiKey) {
      // Local rule-based generation
      const reg = this.dataset.regression;
      const stats = this.dataset.summaryStats;
      const numericCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'numeric');
      const categoricalCols = Object.keys(this.dataset.columnTypes).filter(c => this.dataset.columnTypes[c] === 'categorical');

      const insights = [];
      const recs = [];

      // Insight 1: Quality
      insights.push({
        title: "Dataset Quality Health Check",
        type: this.dataset.qualityMetrics.score >= 80 ? "success" : "warning",
        text: `The dataset health is graded as **${this.dataset.qualityMetrics.grade}** (Score: ${this.dataset.qualityMetrics.score}/100). Deduplication and standardizations were successfully completed, though outlier values were left in place to capture standard transaction variation.`
      });

      // Insight 2: High Correlation
      if (reg) {
        const dir = reg.correlation > 0 ? "increases" : "decreases";
        insights.push({
          title: `Interdependency: ${reg.independent} and ${reg.dependent}`,
          type: "success",
          text: `A clear trend is observable: as **${reg.independent}** grows, **${reg.dependent}** ${dir}. This regression model ($R^2$ = ${reg.r2}) suggests that adjustments to ${reg.independent} will drive predictable shifts in your key outcomes.`
        });
        
        recs.push(`**Optimize ${reg.independent} settings**: Since it shares a correlation of ${reg.correlation} with ${reg.dependent}, modifying ${reg.independent} levels is your primary lever to hit your business objective.`);
      }

      // Insight 3: Core segment
      if (categoricalCols.length > 0) {
        const cat = categoricalCols[0];
        const s = stats[cat];
        insights.push({
          title: `Volume Concentration in ${cat}`,
          type: "info",
          text: `The segment **"${s.topValue}"** constitutes **${s.topPct}%** of the total records in your data. This indicates high product/market concentration, meaning minor efficiency adjustments here will have massive scale returns.`
        });

        recs.push(`**Protect and Leverage "${s.topValue}"**: Because it dominates ${s.topPct}% of operations, implement a feedback loop to monitor its quality weekly, while exploring expansion into secondary categories.`);
      }

      // General fallback recommendations matching decisions
      recs.push(`**Establish Data Audits**: Build input guardrails to correct the quality anomalies flagged during Step 4 to avoid cascading model drift.`);
      recs.push(`**Align Metric Tracking**: Setup a dashboard measuring the variables analyzed in this run to ensure decisions in support of "${objective}" are based on real-time trends.`);

      this.dataset.insights = insights;
      this.dataset.recommendations = recs;
      return { insights, recommendations: recs };
    }

    // Call actual Gemini API to formulate advanced insights & recommendations
    const systemPrompt = `You are an expert Chief Data Scientist. Analyze the dataset summaries, correlations, and quality data, and write 3-4 highly detailed, strategic business insights (each with a Title and a Type: success, warning, or info) and 3-4 actionable recommendations. Ensure they map to the client's targets and decisions. Response must be formatted in clean JSON.`;
    
    const finalPrompt = `
OBJECTIVE: ${objective}
DECISIONS: ${decisions}
DATA SUM: ${this.dataset.cleanRows.length} rows, Quality Grade: ${this.dataset.qualityMetrics.grade}.
SCHEMA: ${this.dataset.headers.join(', ')}
STATS & CORRELATIONS: Check previous outputs.

INSTRUCTIONS:
Return ONLY a valid JSON object matching this structure (no markdown wrappers like \`\`\`json, just raw JSON):
{
  "insights": [
    { "title": "Insight Title", "type": "success|warning|info", "text": "Markdown text describing findings." }
  ],
  "recommendations": [
    "Markdown string of recommendation 1",
    "Markdown string of recommendation 2"
  ]
}
`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n" + finalPrompt }] }]
        })
      });

      if (!response.ok) {
        throw new Error("Gemini API call failed for insights");
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      // Clean markdown wrappers if any
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(text);
      this.dataset.insights = parsed.insights || [];
      this.dataset.recommendations = parsed.recommendations || [];
      return parsed;
    } catch (err) {
      console.error("Gemini API Insights failed, falling back", err);
      // Run fallback
      return this.generateInsightsAndRecommendations(null, null, objective, decisions);
    }
  }
};

window.Agent = Agent;
