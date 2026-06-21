/* app.js - Application Coordinator & UI Controller */

document.addEventListener("DOMContentLoaded", () => {
  // Application State
  const state = {
    currentStep: 0, // 0 is setup, 1-12 are the analysis steps
    maxExecutedStep: 0,
    objective: "",
    questions: "",
    decisions: "",
    fileName: "",
    fileSizeKB: 0,
    csvRawText: "",
    apiKey: localStorage.getItem("gemini_api_key") || "",
    apiModel: localStorage.getItem("gemini_model_name") || "gemini-1.5-flash",
    // Dom Elements caching
    dom: {
      sidebar: document.getElementById("sidebar-nav"),
      setupView: document.getElementById("setup-view"),
      stepContainer: document.getElementById("step-output-container"),
      reportDrawer: document.getElementById("report-drawer"),
      
      // Step buttons
      stepBtns: Array.from({ length: 12 }, (_, i) => document.getElementById(`step-btn-${i + 1}`)),
      
      // Setup elements
      dropZone: document.getElementById("drop-zone"),
      fileInput: document.getElementById("csv-file-input"),
      browseBtn: document.getElementById("browse-btn"),
      fileInfo: document.getElementById("file-info"),
      formCard: document.getElementById("form-card"),
      inputObjective: document.getElementById("input-objective"),
      inputQuestions: document.getElementById("input-questions"),
      inputDecisions: document.getElementById("input-decisions"),
      startBtn: document.getElementById("start-analysis-btn"),
      
      // Navigation & action elements
      headerFilename: document.getElementById("header-filename"),
      headerSummary: document.getElementById("header-summary"),
      resetBtn: document.getElementById("reset-btn"),
      exportBtn: document.getElementById("export-btn"),
      prevBtn: document.getElementById("prev-step-btn"),
      nextBtn: document.getElementById("next-step-btn"),
      stepCardContent: document.getElementById("step-card-content"),
      stepIndicatorText: document.getElementById("step-indicator-text"),
      
      // Agent banner
      agentTitle: document.getElementById("agent-header-title"),
      agentText: document.getElementById("agent-header-text"),
      agentAvatar: document.getElementById("agent-avatar-icon"),
      
      // Settings modal
      apiModal: document.getElementById("api-modal"),
      openSettingsBtn: document.getElementById("open-settings-btn"),
      closeModalBtn: document.getElementById("close-modal-btn"),
      apiKeyInput: document.getElementById("api-key-input"),
      apiModelSelect: document.getElementById("api-model-select"),
      saveApiBtn: document.getElementById("save-api-btn"),
      clearApiBtn: document.getElementById("clear-api-btn"),
      apiStatusDot: document.getElementById("api-status-dot"),
      apiStatusText: document.getElementById("api-status-text"),
      apiDescription: document.getElementById("api-description"),
      
      // Report Document elements
      repObjective: document.getElementById("rep-objective-text"),
      repQuestions: document.getElementById("rep-questions-text"),
      repDecisions: document.getElementById("rep-decisions-text"),
      repDimensions: document.getElementById("rep-dimensions-text"),
      repSize: document.getElementById("rep-size-text"),
      repSchema: document.getElementById("rep-schema-text"),
      repCleaning: document.getElementById("rep-cleaning-text"),
      repQualityGrade: document.getElementById("rep-quality-grade-text"),
      repEda: document.getElementById("rep-eda-text"),
      repFeature: document.getElementById("rep-feature-text"),
      repAnswersList: document.getElementById("rep-answers-list"),
      repStatsText: document.getElementById("rep-stats-text"),
      repInsightsText: document.getElementById("rep-insights-text"),
      repRecsText: document.getElementById("rep-recommendations-text"),
      
      // Report Sections
      secDataset: document.getElementById("report-sec-dataset"),
      secCleaning: document.getElementById("report-sec-cleaning"),
      secEda: document.getElementById("report-sec-eda"),
      secAnswers: document.getElementById("report-sec-business-answers"),
      secStats: document.getElementById("report-sec-stats"),
      secInsightsRec: document.getElementById("report-sec-insights-rec")
    }
  };

  // ----------------------------------------------------
  // Initialization & Setting Modal Event Handlers
  // ----------------------------------------------------
  function updateApiStatusUI() {
    if (state.apiKey) {
      state.dom.apiStatusDot.className = "status-dot green";
      state.dom.apiStatusText.innerText = "AI Mode Active";
      state.dom.apiDescription.innerText = `Powered by ${state.apiModel}. Detailed, contextual interpretations are enabled.`;
      state.dom.apiKeyInput.value = state.apiKey;
    } else {
      state.dom.apiStatusDot.className = "status-dot gray";
      state.dom.apiStatusText.innerText = "Local Mode";
      state.dom.apiDescription.innerText = "Provide a Gemini key in settings to unlock AI answer outputs, advanced dashboards, and reasoning.";
      state.dom.apiKeyInput.value = "";
    }
    state.dom.apiModelSelect.value = state.apiModel;
  }

  updateApiStatusUI();

  state.dom.openSettingsBtn.addEventListener("click", () => {
    state.dom.apiModal.classList.add("open");
  });

  state.dom.closeModalBtn.addEventListener("click", () => {
    state.dom.apiModal.classList.remove("open");
  });

  state.dom.saveApiBtn.addEventListener("click", () => {
    const key = state.dom.apiKeyInput.value.trim();
    const model = state.dom.apiModelSelect.value;
    
    state.apiKey = key;
    state.apiModel = model;
    
    if (key) {
      localStorage.setItem("gemini_api_key", key);
    } else {
      localStorage.removeItem("gemini_api_key");
    }
    localStorage.setItem("gemini_model_name", model);
    
    updateApiStatusUI();
    state.dom.apiModal.classList.remove("open");
  });

  state.dom.clearApiBtn.addEventListener("click", () => {
    state.apiKey = "";
    localStorage.removeItem("gemini_api_key");
    updateApiStatusUI();
    state.dom.apiModal.classList.remove("open");
  });

  // ----------------------------------------------------
  // Drag & Drop File Handlers
  // ----------------------------------------------------
  const dropZone = state.dom.dropZone;

  dropZone.addEventListener("click", () => {
    state.dom.fileInput.click();
  });

  state.dom.fileInput.addEventListener("change", (e) => {
    handleFileSelect(e.target.files[0]);
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelect(file) {
    if (!file) return;
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      alert("Please upload a valid CSV dataset file.");
      return;
    }

    state.fileName = file.name;
    state.fileSizeKB = (file.size / 1024).toFixed(1);

    const reader = new FileReader();
    reader.onload = (e) => {
      state.csvRawText = e.target.result;
      
      // Update File Select UI
      state.dom.fileInfo.innerText = `📄 ${state.fileName} (${state.fileSizeKB} KB) loaded successfully!`;
      state.dom.fileInfo.style.display = "block";
      state.dom.formCard.style.display = "block";
      
      // Scroll smoothly to objective form
      state.dom.formCard.scrollIntoView({ behavior: 'smooth' });
    };
    reader.onerror = () => {
      alert("Error reading file.");
    };
    reader.readAsText(file);
  }

  // ----------------------------------------------------
  // Initialize Agent Analysis Pipeline Trigger
  // ----------------------------------------------------
  state.dom.startBtn.addEventListener("click", async () => {
    const objective = state.dom.inputObjective.value.trim();
    const questions = state.dom.inputQuestions.value.trim();
    const decisions = state.dom.inputDecisions.value.trim();

    if (!objective || !questions || !decisions) {
      alert("Please fill out the analysis objective, questions, and target decisions before continuing.");
      return;
    }

    // Set application parameters
    state.objective = objective;
    state.questions = questions;
    state.decisions = decisions;

    // Set header
    state.dom.headerFilename.innerText = `Data Agent: ${state.fileName}`;
    state.dom.headerSummary.innerText = "Analyzing Objective Settings and schema parameters.";

    // Show Workspace Panel Split Layout
    state.dom.sidebar.style.display = "flex";
    state.dom.reportDrawer.style.display = "flex";
    state.dom.setupView.style.display = "none";
    state.dom.stepContainer.style.display = "block";
    state.dom.resetBtn.style.display = "inline-flex";

    // Set Live Report details
    state.dom.repObjective.innerText = objective;
    
    const formattedQuestions = questions.split('\n')
      .map(q => q.trim())
      .filter(Boolean)
      .map((q, idx) => `${idx + 1}. ${q}`)
      .join(', ');
    state.dom.repQuestions.innerText = formattedQuestions;
    state.dom.repDecisions.innerText = decisions;

    // Force rendering update for Lucide Icons
    lucide.createIcons();

    // Trigger Step 1: Load Data
    await executeStep(1);
  });

  // ----------------------------------------------------
  // Stepper Execution Driver
  // ----------------------------------------------------
  async function executeStep(stepNum) {
    state.currentStep = stepNum;
    if (stepNum > state.maxExecutedStep) {
      state.maxExecutedStep = stepNum;
    }

    // Update Sidebar CSS classes
    state.dom.stepBtns.forEach((btn, idx) => {
      const bNum = idx + 1;
      btn.classList.remove("active", "running");
      
      if (bNum === stepNum) {
        btn.classList.add("active");
        if (bNum > state.maxExecutedStep) {
          btn.classList.add("running");
        }
      }
      
      if (bNum < state.maxExecutedStep) {
        btn.classList.add("completed");
      }
    });

    // Update bottom stepper bar indicators
    state.dom.stepIndicatorText.innerText = `Step ${stepNum} of 12`;
    state.dom.prevBtn.disabled = stepNum === 1;
    
    if (stepNum === 12) {
      state.dom.nextBtn.innerHTML = `Complete Analysis & Export <i class="lucide-check"></i>`;
      state.dom.nextBtn.className = "btn btn-primary";
    } else {
      state.dom.nextBtn.innerHTML = `Proceed to Step ${stepNum + 1} <i data-lucide="chevron-right"></i>`;
      state.dom.nextBtn.className = "btn btn-primary";
      lucide.createIcons();
    }

    // Set Loader State
    state.dom.agentAvatar.className = "agent-avatar thinking";
    state.dom.agentAvatar.innerText = "⚙️";
    state.dom.stepCardContent.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; gap: 16px;">
        <div style="width: 40px; height: 40px; border: 4px solid var(--primary-light); border-top-color: var(--primary); border-radius:50%; animation: spin 1s linear infinite;"></div>
        <p style="color: var(--text-muted); font-size:0.9rem;">Agent computing statistical data details. Please wait...</p>
      </div>
    `;

    // Trigger step execution in agent backend
    try {
      await runAgentBackendStep(stepNum);
    } catch (err) {
      state.dom.stepCardContent.innerHTML = `
        <div class="insight-card error">
          <div class="insight-card-header"><i data-lucide="alert-octagon"></i> Step Calculation Error</div>
          <div class="insight-card-body">${err.message || err}</div>
        </div>
      `;
      lucide.createIcons();
    }

    state.dom.agentAvatar.className = "agent-avatar";
    state.dom.agentAvatar.innerText = "🤖";
  }

  // Bind Sidebar Step Button clicks
  state.dom.stepBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const stepNum = idx + 1;
      if (stepNum <= state.maxExecutedStep) {
        executeStep(stepNum);
      } else {
        alert("You must execute the analysis steps in order. Complete previous steps first.");
      }
    });
  });

  // Next / Prev Stepper triggers
  state.dom.prevBtn.addEventListener("click", () => {
    if (state.currentStep > 1) {
      executeStep(state.currentStep - 1);
    }
  });

  state.dom.nextBtn.addEventListener("click", async () => {
    if (state.currentStep === 12) {
      // Show export PDF print
      window.print();
    } else {
      await executeStep(state.currentStep + 1);
    }
  });

  // Reset Application
  state.dom.resetBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to reset the agent? You will lose the current dataset and objective settings.")) {
      location.reload();
    }
  });

  // Export PDF Button
  state.dom.exportBtn.addEventListener("click", () => {
    window.print();
  });

  // ----------------------------------------------------
  // Agent Steps Orchestrator
  // ----------------------------------------------------
  async function runAgentBackendStep(step) {
    switch (step) {
      case 1:
        // 1. Load Data
        state.dom.agentTitle.innerText = "Step 1: Load Data";
        state.dom.agentText.innerText = "Initializing schema profile, column names, and parsing structures.";
        
        const loadRes = await Agent.loadData(state.csvRawText, state.fileName, state.fileSizeKB);
        
        // Render step output
        let headersHtml = "";
        loadRes.headers.forEach(h => {
          const type = loadRes.types[h];
          const badgeColor = type === 'numeric' ? 'var(--primary)' : (type === 'categorical' ? 'var(--secondary)' : 'var(--text-light)');
          headersHtml += `<span style="background: var(--bg-tertiary); color: var(--text-main); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; display:inline-flex; align-items:center; gap:6px; font-family:monospace;">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background-color:${badgeColor};"></span>
            ${h} (${type})
          </span>`;
        });

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Dataset Metadata Overview</h3>
          <div class="grid-3" style="margin-bottom: 24px;">
            <div class="kpi-card">
              <div class="kpi-label">Total Rows</div>
              <div class="kpi-val">${loadRes.rowsCount}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Columns</div>
              <div class="kpi-val">${loadRes.colsCount}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">File Size</div>
              <div class="kpi-val">${state.fileSizeKB} KB</div>
            </div>
          </div>
          <h4 style="margin-bottom: 12px;">Detected Column Schema</h4>
          <div style="display:flex; flex-wrap:wrap; gap: 8px;">
            ${headersHtml}
          </div>
        `;

        // Update Report Panel
        state.dom.secDataset.style.display = "block";
        state.dom.repDimensions.innerText = `${loadRes.rowsCount} Rows x ${loadRes.colsCount} Columns`;
        state.dom.repSize.innerText = `${state.fileSizeKB} KB`;
        state.dom.repSchema.innerText = loadRes.headers.join(', ');
        break;

      case 2:
        // 2. Inspect Dataset
        state.dom.agentTitle.innerText = "Step 2: Inspect Dataset";
        state.dom.agentText.innerText = "Computing basic descriptive stats, check percentages, and sampling table.";
        
        const stats = Agent.inspectDataset();
        
        // Render inspection table
        let tableRowsHtml = "";
        Agent.dataset.headers.forEach(h => {
          const s = stats[h];
          if (s.type === 'numeric') {
            tableRowsHtml += `<tr>
              <td style="font-weight:600;">${h}</td>
              <td><span style="background:var(--primary-light); color:var(--primary); padding:2px 6px; border-radius:4px; font-size:0.75rem;">Numeric</span></td>
              <td>${s.missingPct}% (${s.missingCount})</td>
              <td>Mean: ${s.mean}<br>Median: ${s.median}</td>
              <td>Min: ${s.min}<br>Max: ${s.max}</td>
              <td>StdDev: ${s.stdDev}</td>
            </tr>`;
          } else {
            tableRowsHtml += `<tr>
              <td style="font-weight:600;">${h}</td>
              <td><span style="background:var(--secondary-light); color:var(--secondary); padding:2px 6px; border-radius:4px; font-size:0.75rem;">${s.type}</span></td>
              <td>${s.missingPct}% (${s.missingCount})</td>
              <td colspan="2">Dominant: "${s.topValue}" (${s.topPct}%)</td>
              <td>Unique: ${s.uniqueCount}</td>
            </tr>`;
          }
        });

        // 5 row preview
        let previewHeaders = Agent.dataset.headers.map(h => `<th>${h}</th>`).join('');
        let previewRows = Agent.dataset.originalRows.slice(0, 5).map(row => {
          let tds = Agent.dataset.headers.map(h => `<td>${row[h] === null ? '<span style="color:var(--text-light)">null</span>' : row[h]}</td>`).join('');
          return `<tr>${tds}</tr>`;
        }).join('');

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Column Summaries & Profiles</h3>
          <div class="table-wrapper" style="margin-bottom: 24px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Field Header</th>
                  <th>Inferred Type</th>
                  <th>Missing Count</th>
                  <th>Central Values</th>
                  <th>Boundary Ranges</th>
                  <th>Statistical Spread</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>

          <h3 style="margin-bottom:12px;">First 5 Raw Records Preview</h3>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>${previewHeaders}</tr>
              </thead>
              <tbody>
                ${previewRows}
              </tbody>
            </table>
          </div>
        `;
        break;

      case 3:
        // 3. Data Cleaning
        state.dom.agentTitle.innerText = "Step 3: Data Cleaning";
        state.dom.agentText.innerText = "Removing duplicate rows, correcting string types, and executing outlier analysis.";
        
        const cleanRes = Agent.cleanData();
        
        let cleanLogsHtml = "";
        cleanRes.logs.forEach(log => {
          cleanLogsHtml += `
            <div class="insight-card ${log.type}">
              <div class="insight-card-header">
                <i data-lucide="${log.type === 'success' ? 'check-circle-2' : (log.type === 'warning' ? 'alert-triangle' : 'info')}"></i>
                ${log.message.split(':')[0]}
              </div>
              <div class="insight-card-body">${log.message.split(':').slice(1).join(':')}</div>
            </div>
          `;
        });

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Data Cleaning & Transformation Pipeline</h3>
          <div class="grid-3" style="margin-bottom: 24px;">
            <div class="kpi-card" style="border-top: 4px solid var(--success);">
              <div class="kpi-label">Duplicates Dropped</div>
              <div class="kpi-val">${cleanRes.duplicateCount}</div>
            </div>
            <div class="kpi-card" style="border-top: 4px solid var(--success);">
              <div class="kpi-label">Nulls Imputed</div>
              <div class="kpi-val">${cleanRes.missingImputed}</div>
            </div>
            <div class="kpi-card" style="border-top: 4px solid var(--success);">
              <div class="kpi-label">Format Fixed</div>
              <div class="kpi-val">${cleanRes.typeCorrections}</div>
            </div>
          </div>
          
          <h4 style="margin-bottom: 12px;">Execution Activity Logs</h4>
          <div style="display:flex; flex-direction:column; gap: 8px;">
            ${cleanLogsHtml}
          </div>
        `;
        lucide.createIcons();
        break;

      case 4:
        // 4. Data Quality Check
        state.dom.agentTitle.innerText = "Step 4: Data Quality Check";
        state.dom.agentText.innerText = "Running validation rules, negative range checks, and computing quality grade.";
        
        const qual = Agent.checkQuality();
        
        let qualIssuesHtml = "";
        if (qual.issues.length === 0) {
          qualIssuesHtml = `
            <div class="insight-card success">
              <div class="insight-card-header"><i data-lucide="check-circle-2"></i> Excellent Quality</div>
              <div class="insight-card-body">No structural issues, boundary errors, or logical contradictions found. The dataset is production-ready.</div>
            </div>
          `;
        } else {
          qual.issues.forEach(issue => {
            const icon = issue.severity === 'error' ? 'alert-octagon' : 'alert-triangle';
            qualIssuesHtml += `
              <div class="insight-card ${issue.severity === 'error' ? 'error' : 'warning'}">
                <div class="insight-card-header">
                  <i data-lucide="${icon}"></i>
                  ${issue.field} Constraint Failure (${issue.severity.toUpperCase()})
                </div>
                <div class="insight-card-body">${issue.message}</div>
              </div>
            `;
          });
        }

        const gradeClass = `grade-${qual.grade.toLowerCase()}`;

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Dataset Quality Health Grade</h3>
          <div style="display:flex; align-items:center; gap: 32px; margin-bottom: 24px; background:var(--bg-tertiary); padding:20px; border-radius:10px;">
            <div class="quality-score-badge ${gradeClass}" style="margin-bottom: 0;">${qual.grade}</div>
            <div>
              <h4 style="font-size: 1.1rem; margin-bottom: 4px;">Health Score: ${qual.score}/100</h4>
              <p style="color:var(--text-muted); font-size:0.875rem;">
                Based on completeness, redundancy check, numeric validations, and variance outliers.
              </p>
            </div>
          </div>
          
          <h4 style="margin-bottom: 12px;">Validation Checks Run</h4>
          <div style="display:flex; flex-direction:column; gap: 8px;">
            ${qualIssuesHtml}
          </div>
        `;
        lucide.createIcons();

        // Update live report
        state.dom.secCleaning.style.display = "block";
        state.dom.repQualityGrade.innerText = `${qual.grade} (${qual.score}/100 Score)`;
        state.dom.repCleaning.innerText = `Checked for duplicates, handled missing values, and validated ranges. Found ${qual.issues.length} warnings.`;
        break;

      case 5:
        // 5. Apply Exploratory Data Analysis (EDA)
        state.dom.agentTitle.innerText = "Step 5: Apply EDA";
        state.dom.agentText.innerText = "Calculating Pearson correlation matrix coefficients and value groupings.";
        
        const eda = Agent.runEDA();
        const numCols = Object.keys(Agent.dataset.columnTypes).filter(c => Agent.dataset.columnTypes[c] === 'numeric');
        
        // Build Heatmap grid
        let heatmapHtml = "";
        if (numCols.length > 0) {
          heatmapHtml += `<div style="overflow-x:auto;"><table class="data-table" style="text-align:center;"><thead><tr><th>Variable</th>`;
          numCols.forEach(col => { heatmapHtml += `<th>${col}</th>`; });
          heatmapHtml += `</tr></thead><tbody>`;
          
          numCols.forEach(rowCol => {
            heatmapHtml += `<tr><td style="font-weight:600; text-align:left;">${rowCol}</td>`;
            numCols.forEach(colCol => {
              const rVal = eda.correlations[rowCol]?.[colCol] || 0;
              // Map background color based on rVal (-1 to +1)
              let cellBg = "rgba(79, 70, 229, 0.05)";
              let textColor = "var(--text-main)";
              
              if (rVal > 0) {
                cellBg = `rgba(79, 70, 229, ${rVal * 0.75})`;
                if (rVal > 0.5) textColor = "white";
              } else if (rVal < 0) {
                cellBg = `rgba(239, 68, 68, ${Math.abs(rVal) * 0.75})`;
                if (Math.abs(rVal) > 0.5) textColor = "white";
              }
              
              heatmapHtml += `<td style="background-color:${cellBg}; color:${textColor}; font-weight:bold; font-family:monospace; padding:12px;">${rVal}</td>`;
            });
            heatmapHtml += `</tr>`;
          });
          heatmapHtml += `</tbody></table></div>`;
        } else {
          heatmapHtml = `<p style="color:var(--text-muted);">No numeric columns detected to perform correlations.</p>`;
        }

        // Categorical breakdowns
        let breakdownsHtml = "";
        const catCols = Object.keys(Agent.dataset.columnTypes).filter(c => Agent.dataset.columnTypes[c] === 'categorical');
        if (catCols.length > 0) {
          breakdownsHtml += `<h4 style="margin-top:24px; margin-bottom:12px;">Category Distribution Breakdowns</h4><div class="grid-2">`;
          catCols.forEach(col => {
            const dist = eda.distributions[col] || [];
            let itemsHtml = "";
            dist.forEach(([val, count]) => {
              const pct = ((count / Agent.dataset.cleanRows.length) * 100).toFixed(1);
              itemsHtml += `
                <div style="margin-bottom:8px;">
                  <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
                    <span>${val}</span>
                    <span style="font-weight:600;">${count} records (${pct}%)</span>
                  </div>
                  <div style="background:var(--bg-tertiary); height:6px; border-radius:3px; overflow:hidden;">
                    <div style="background:var(--primary); width:${pct}%; height:100%; border-radius:3px;"></div>
                  </div>
                </div>
              `;
            });
            breakdownsHtml += `
              <div class="card" style="padding:16px;">
                <h5 style="margin-bottom:10px;">Column: ${col}</h5>
                ${itemsHtml}
              </div>
            `;
          });
          breakdownsHtml += `</div>`;
        }

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Exploratory Data Analysis Dashboard</h3>
          <h4 style="margin-bottom:12px;">Pearson Correlation Coefficient Matrix</h4>
          ${heatmapHtml}
          ${breakdownsHtml}
        `;
        break;

      case 6:
        // 6. Visualizations selection
        state.dom.agentTitle.innerText = "Step 6: Visualizations";
        state.dom.agentText.innerText = "Analyzing variables and correlations to select premium layout configurations.";
        
        const vizConfigs = Agent.generateVisualizations();
        
        let vizHtml = "";
        if (vizConfigs.length === 0) {
          vizHtml = `<p style="color:var(--text-muted)">No suitable columns matched configuration filters to build charts. Need numeric or categorical variables.</p>`;
        } else {
          vizConfigs.forEach(vc => {
            let chartIcon = "bar-chart-3";
            if (vc.type === 'line') chartIcon = "line-chart";
            else if (vc.type === 'scatter') chartIcon = "dot-chart";
            else if (vc.type === 'pie') chartIcon = "pie-chart";
            
            vizHtml += `
              <div class="insight-card success">
                <div class="insight-card-header">
                  <i data-lucide="${chartIcon}"></i>
                  Selected "${vc.title}"
                </div>
                <div class="insight-card-body">
                  <strong>Type:</strong> ${vc.type.toUpperCase()}<br>
                  <strong>Variables:</strong> ${vc.xAxis} ${vc.yAxis ? ' vs ' + vc.yAxis : ''}<br>
                  ${vc.description}
                </div>
              </div>
            `;
          });
        }

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Automated Data Visualization Mapping</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:16px;">
            The Agent scanned the dataset relationships and mapped the most descriptive charting combinations. These will be fully compiled into Step 10's Dashboard.
          </p>
          <div style="display:flex; flex-direction:column; gap: 8px;">
            ${vizHtml}
          </div>
        `;
        lucide.createIcons();
        break;

      case 7:
        // 7. Feature Engineering
        state.dom.agentTitle.innerText = "Step 7: Feature Engineering";
        state.dom.agentText.innerText = "Extracting date details and calculating ratios/margins metrics.";
        
        const feRes = Agent.engineerFeatures();
        
        let feLogsHtml = "";
        feRes.logs.forEach(log => {
          feLogsHtml += `
            <div class="insight-card info">
              <div class="insight-card-header"><i data-lucide="sparkles"></i> Transform Action Applied</div>
              <div class="insight-card-body">${log}</div>
            </div>
          `;
        });

        // Show a preview table of engineered dataset (first 4 original columns + all derived columns)
        const originalHeaders = Agent.dataset.headers;
        const engHeaders = Object.keys(Agent.dataset.engineeredRows[0] || {});
        const derivedHeaders = engHeaders.filter(h => !originalHeaders.includes(h));
        
        const previewHeadersList = [...originalHeaders.slice(0, 4), ...derivedHeaders];
        
        let engHeadersHtml = previewHeadersList.map(h => {
          const isDerived = derivedHeaders.includes(h);
          const style = isDerived ? 'style="background: var(--primary-light); color: var(--primary); font-weight: bold;"' : '';
          return `<th ${style}>${h}</th>`;
        }).join('');

        let engRowsHtml = Agent.dataset.engineeredRows.slice(0, 3).map(row => {
          let tds = previewHeadersList.map(h => {
            const isDerived = derivedHeaders.includes(h);
            const style = isDerived ? 'style="background: rgba(79, 70, 229, 0.04); font-weight: 500;"' : '';
            return `<td ${style}>${row[h] === undefined || row[h] === null ? '' : row[h]}</td>`;
          }).join('');
          return `<tr>${tds}</tr>`;
        }).join('');

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Feature Engineering Outputs</h3>
          <div class="grid-2" style="margin-bottom: 24px;">
            <div class="kpi-card">
              <div class="kpi-label">Original Columns</div>
              <div class="kpi-val">${Agent.dataset.headers.length}</div>
            </div>
            <div class="kpi-card" style="border-top:4px solid var(--secondary);">
              <div class="kpi-label">New Derived Columns</div>
              <div class="kpi-val">${feRes.featuresCount}</div>
            </div>
          </div>

          <h4 style="margin-bottom: 12px;">Transformed Engineering Logs</h4>
          <div style="display:flex; flex-direction:column; gap: 8px; margin-bottom: 24px;">
            ${feLogsHtml}
          </div>

          <h4 style="margin-bottom: 12px;">Derived Dataset Preview</h4>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>${engHeadersHtml}</tr>
              </thead>
              <tbody>
                ${engRowsHtml}
              </tbody>
            </table>
          </div>
        `;
        lucide.createIcons();

        // Update Report Panel
        state.dom.secEda.style.display = "block";
        const maxCorrPair = findMaxCorrelationPair();
        state.dom.repEda.style.display = "block";
        state.dom.repEda.innerText = maxCorrPair 
          ? `Strongest correlation is between ${maxCorrPair.c1} & ${maxCorrPair.c2} (r = ${maxCorrPair.r}).` 
          : 'Analyzed standard descriptive relationships.';
        state.dom.repFeature.innerText = `Added ${feRes.featuresCount} columns.`;
        break;

      case 8:
        // 8. Answer Business Questions
        state.dom.agentTitle.innerText = "Step 8: Answer Business Questions";
        state.dom.agentText.innerText = "Synthesizing findings to answer specific business objectives.";
        
        // Trigger answers (async API call or rule fallback)
        const answers = await Agent.answerBusinessQuestions(
          state.apiKey,
          state.apiModel,
          state.objective,
          state.questions,
          state.decisions
        );

        let answersHtml = "";
        answers.forEach((ans, i) => {
          let chartContainerHtml = "";
          if (ans.visualization && ans.visualization.type && ans.visualization.type !== 'none') {
            chartContainerHtml = `
              <div class="card" style="margin-top: 16px; padding: 16px; border: 1px solid var(--border-color); background: var(--bg-primary);">
                <h5 style="margin-bottom: 12px; font-size: 0.85rem; color: var(--text-main); font-weight:600; text-align: left;">
                  <i data-lucide="bar-chart-3" style="width: 14px; height: 14px; color: var(--primary); vertical-align: middle; margin-right: 4px;"></i>
                  ${ans.visualization.title || 'Data Visualization'}
                </h5>
                <div class="chart-container" style="height: 220px; position: relative;">
                  <canvas id="question-chart-${i}"></canvas>
                </div>
                ${ans.visualization.description ? `<p style="font-size: 0.75rem; color: var(--text-light); margin-top: 10px; line-height: 1.35; text-align: left;">${ans.visualization.description}</p>` : ''}
              </div>
            `;
          }

          answersHtml += `
            <div class="insight-card success" style="margin-bottom:20px;">
              <div class="insight-card-header" style="color:var(--text-main); font-size:1rem;">
                <i data-lucide="help-circle" style="color:var(--primary);"></i>
                Q: ${ans.question}
              </div>
              <div class="insight-card-body" style="font-size:0.9rem; line-height:1.6; color:var(--text-muted); margin-top:8px;">
                <div style="text-align: left;">${ans.answer.replace(/\n/g, '<br>')}</div>
                ${chartContainerHtml}
              </div>
            </div>
          `;
        });

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Answers to Business Questions</h3>
          <div style="margin-top:12px;">
            ${answersHtml}
          </div>
        `;
        lucide.createIcons();

        // Render charts onto canvases in next tick to allow elements to load
        setTimeout(() => {
          answers.forEach((ans, i) => {
            if (ans.visualization && ans.visualization.type && ans.visualization.type !== 'none') {
              const config = {
                id: `question-chart-${i}`,
                type: ans.visualization.type,
                xAxis: ans.visualization.xAxisColumn || ans.visualization.xAxis,
                yAxis: ans.visualization.yAxisColumn || ans.visualization.yAxis,
                title: null
              };
              renderDynamicChartWidget(config);
            }
          });
        }, 50);

        // Update Report Panel
        state.dom.secAnswers.style.display = "block";
        let repAnswersListHtml = "";
        answers.forEach(ans => {
          repAnswersListHtml += `<div style="margin-bottom:12px;">
            <strong style="color:var(--text-main); display:block; margin-bottom:4px;">Q: ${ans.question}</strong>
            <p style="margin-left:8px; line-height:1.4;">${ans.answer.replace(/\n/g, '<br>')}</p>
          </div>`;
        });
        state.dom.repAnswersList.innerHTML = repAnswersListHtml;
        break;

      case 9:
        // 9. Statistical Analysis
        state.dom.agentTitle.innerText = "Step 9: Statistical Analysis";
        state.dom.agentText.innerText = "Formulating a simple linear regression model and testing parameters.";
        
        const reg = Agent.runStatisticalAnalysis();
        
        if (!reg) {
          state.dom.stepCardContent.innerHTML = `
            <h3 style="margin-bottom:16px;">Statistical Diagnostic Summary</h3>
            <p style="color:var(--text-muted);">
              A regression requires at least two numeric fields in the dataset. This step has been skipped because this file has insufficient dimensions.
            </p>
          `;
          
          state.dom.secStats.style.display = "block";
          state.dom.repStatsText.innerText = "Insufficient numeric variables to run regression modeling.";
        } else {
          state.dom.stepCardContent.innerHTML = `
            <h3 style="margin-bottom:16px;">Linear Regression Modeling</h3>
            <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom: 20px;">
              Modeling the relationship between the strongest correlated indicators in the dataset.
            </p>
            
            <div class="grid-2" style="margin-bottom: 24px;">
              <div class="kpi-card">
                <div class="kpi-label">Independent Variable (X)</div>
                <div class="kpi-val" style="font-size:1.2rem; margin-top:12px;">${reg.independent}</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Dependent Variable (Y)</div>
                <div class="kpi-val" style="font-size:1.2rem; margin-top:12px;">${reg.dependent}</div>
              </div>
            </div>

            <div class="card" style="margin-bottom:24px; padding:20px; border-left: 4px solid var(--primary);">
              <h4 style="margin-bottom:10px;">Regression Equation</h4>
              <p style="font-size: 1.15rem; font-family: monospace; font-weight:600; color:var(--primary); margin-bottom:8px;">
                ${reg.dependent} = (${reg.slope}) * ${reg.independent} + (${reg.intercept})
              </p>
              <div style="font-size:0.85rem; color:var(--text-muted);">
                R-Squared Coefficient: <strong>${reg.r2}</strong> (${(reg.r2*100).toFixed(1)}% of Y variation is explained by X).
              </div>
            </div>

            <h4 style="margin-bottom:12px;">Hypothesis Significance Diagnostics</h4>
            <div class="insight-card ${reg.isSignificant ? 'success' : 'warning'}">
              <div class="insight-card-header">
                <i data-lucide="${reg.isSignificant ? 'shield-check' : 'alert-circle'}"></i>
                ${reg.isSignificant ? 'Correlation is Significant' : 'Correlation is Non-Significant'}
              </div>
              <div class="insight-card-body">
                The computed p-value is **${reg.pValue}** (t-test confidence interval). 
                ${reg.isSignificant 
                  ? "Since this is below the standard threshold of 0.05, there is strong evidence that change in X influences Y." 
                  : "Since this is above 0.05, changes in X cannot reliably predict shifts in Y. The correlation could be coincidental."
                }
              </div>
            </div>
          `;
          lucide.createIcons();

          // Update Report Panel
          state.dom.secStats.style.display = "block";
          state.dom.repStatsText.innerHTML = `Built linear model: <code>${reg.dependent} = (${reg.slope})*${reg.independent} + (${reg.intercept})</code> with R² = ${reg.r2}. Correlation significance: p-value of ${reg.pValue} (${reg.isSignificant ? 'Significant' : 'Not Significant'}).`;
        }
        break;

      case 10:
        // 10. Create Dashboard
        state.dom.agentTitle.innerText = "Step 10: Create Dashboard";
        state.dom.agentText.innerText = "Rendering premium visual charts and KPIs dynamically.";
        
        const viz = Agent.generateVisualizations();
        
        let dashboardGridHtml = "";
        viz.forEach((vc, i) => {
          dashboardGridHtml += `
            <div class="card col-6" style="padding:16px;">
              <h5 style="margin-bottom:12px;">${vc.title}</h5>
              <div class="chart-container">
                <canvas id="${vc.id}"></canvas>
              </div>
            </div>
          `;
        });

        // Main KPIs cards on top
        const numericColumns = Object.keys(Agent.dataset.columnTypes).filter(c => Agent.dataset.columnTypes[c] === 'numeric');
        let kpisHtml = "";
        numericColumns.slice(0, 3).forEach(col => {
          const s = Agent.dataset.summaryStats[col];
          kpisHtml += `
            <div class="kpi-card" style="padding:12px;">
              <div class="kpi-label" style="font-size:0.65rem;">AVG ${col}</div>
              <div class="kpi-val" style="font-size:1.3rem;">${s.mean}</div>
            </div>
          `;
        });

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Interactive Data Dashboard</h3>
          <div class="grid-3" style="margin-bottom:24px;">
            ${kpisHtml}
          </div>
          <div class="dashboard-grid">
            ${dashboardGridHtml}
          </div>
        `;

        // Render charts onto canvases in next tick to allow elements to load
        setTimeout(() => {
          viz.forEach(vc => {
            renderDynamicChartWidget(vc);
          });
        }, 10);
        break;

      case 11:
        // 11. Generate Insights
        state.dom.agentTitle.innerText = "Step 11: Generate Insights";
        state.dom.agentText.innerText = "Formulating major analytical conclusions as premium insight cards.";
        
        const insightsRes = await Agent.generateInsightsAndRecommendations(
          state.apiKey,
          state.apiModel,
          state.objective,
          state.decisions
        );

        let insightsHtml = "";
        insightsRes.insights.forEach(ins => {
          const typeClass = ins.type; // success, warning, info
          let iconName = "lightbulb";
          if (typeClass === 'warning') iconName = "alert-triangle";
          else if (typeClass === 'success') iconName = "award";

          insightsHtml += `
            <div class="insight-card ${typeClass}">
              <div class="insight-card-header">
                <i data-lucide="${iconName}"></i>
                ${ins.title}
              </div>
              <div class="insight-card-body">${ins.text.replace(/\n/g, '<br>')}</div>
            </div>
          `;
        });

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Key Analytical Insights</h3>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${insightsHtml}
          </div>
        `;
        lucide.createIcons();

        // Update Report Panel
        state.dom.secInsightsRec.style.display = "block";
        let repInsightsHtml = "";
        insightsRes.insights.forEach(ins => {
          repInsightsHtml += `<div style="margin-bottom:10px;">
            <strong style="color:var(--text-main); font-size:0.85rem; display:block;">💡 ${ins.title}</strong>
            <p style="margin-left:12px; font-size:0.8rem; line-height:1.4;">${ins.text}</p>
          </div>`;
        });
        state.dom.repInsightsText.innerHTML = repInsightsHtml;
        break;

      case 12:
        // 12. Give Recommendations
        state.dom.agentTitle.innerText = "Step 12: Actionable Recommendations";
        state.dom.agentText.innerText = "Developing strategic recommendations aligned to target decisions.";
        
        const outcome = Agent.dataset.insights.length > 0 
          ? { insights: Agent.dataset.insights, recommendations: Agent.dataset.recommendations }
          : await Agent.generateInsightsAndRecommendations(state.apiKey, state.apiModel, state.objective, state.decisions);

        let recsHtml = "";
        outcome.recommendations.forEach((rec, idx) => {
          recsHtml += `
            <div style="display:flex; gap:12px; background:var(--bg-tertiary); padding:16px; border-radius:8px; align-items:flex-start; margin-bottom:12px;">
              <span style="background:var(--primary); color:white; font-size:0.8rem; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-weight:bold;">${idx + 1}</span>
              <p style="font-size:0.9rem; line-height:1.5; color:var(--text-muted); margin:0;">${rec}</p>
            </div>
          `;
        });

        state.dom.stepCardContent.innerHTML = `
          <h3 style="margin-bottom:16px;">Actionable Business Recommendations</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom: 20px;">
            Strategically mapped recommendations linked back to objective questions and decisions:
          </p>
          <div>
            ${recsHtml}
          </div>
          
          <div style="margin-top: 32px; background:var(--primary-light); padding:20px; border-radius:10px; text-align:center; border: 1px dashed rgba(79, 70, 229, 0.3);">
            <h4 style="color:var(--primary); margin-bottom:8px;">Ready to compile final report?</h4>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">You can export a printable PDF layout containing all compiled analytical summaries.</p>
            <button id="step-export-btn" class="btn btn-primary"><i data-lucide="printer"></i> Print / Export Report</button>
          </div>
        `;
        lucide.createIcons();

        // Bind inner export button
        document.getElementById("step-export-btn").addEventListener("click", () => {
          window.print();
        });

        // Update Report Panel
        let repRecsHtml = "";
        outcome.recommendations.forEach(rec => {
          repRecsHtml += `<li style="margin-bottom:6px; margin-left:16px; font-size:0.8rem; line-height:1.4;">${rec}</li>`;
        });
        state.dom.repRecsText.innerHTML = `<ul style="padding-left:10px;">${repRecsHtml}</ul>`;
        
        // Show Export header button
        state.dom.exportBtn.style.display = "inline-flex";
        break;
    }
  }

  // ----------------------------------------------------
  // Dynamic Chart Renderer Router
  // ----------------------------------------------------
  function renderDynamicChartWidget(vc) {
    const rows = Agent.dataset.cleanRows;
    if (!rows || rows.length === 0) return;
    
    // Find column in dataset case-insensitively if not exact match
    let xAxisCol = vc.xAxis;
    if (xAxisCol && !Agent.dataset.headers.includes(xAxisCol)) {
      const match = Agent.dataset.headers.find(h => h.toLowerCase() === xAxisCol.toLowerCase());
      if (match) xAxisCol = match;
    }
    
    let yAxisCol = vc.yAxis;
    if (yAxisCol && !Agent.dataset.headers.includes(yAxisCol)) {
      const match = Agent.dataset.headers.find(h => h.toLowerCase() === yAxisCol.toLowerCase());
      if (match) yAxisCol = match;
    }

    if (!xAxisCol || !Agent.dataset.headers.includes(xAxisCol)) return;
    
    if (vc.type === 'line') {
      // Group by X date column and plot total/avg of Y numeric column
      const groupedData = {};
      rows.forEach(r => {
        const d = String(r[xAxisCol]).substring(0, 10); // extract date string
        const yVal = parseFloat(r[yAxisCol]) || 0;
        if (!groupedData[d]) groupedData[d] = { sum: 0, count: 0 };
        groupedData[d].sum += yVal;
        groupedData[d].count++;
      });
      // Sort keys chronologically
      const sortedDates = Object.keys(groupedData).sort((a, b) => Date.parse(a) - Date.parse(b));
      const labels = sortedDates.slice(0, 15); // Show first 15 dates for legibility
      const data = labels.map(d => parseFloat((groupedData[d].sum).toFixed(2)));
      
      ChartUtils.renderLineChart(vc.id, labels, data, null, yAxisCol);
      
    } else if (vc.type === 'bar') {
      // Group by X categorical and compute average of Y
      const groupedData = {};
      rows.forEach(r => {
        const cat = String(r[xAxisCol]);
        const yVal = parseFloat(r[yAxisCol]) || 0;
        if (!groupedData[cat]) groupedData[cat] = { sum: 0, count: 0 };
        groupedData[cat].sum += yVal;
        groupedData[cat].count++;
      });
      const labels = Object.keys(groupedData).slice(0, 8); // Top 8 categories
      const data = labels.map(l => parseFloat((groupedData[l].sum / groupedData[l].count).toFixed(2)));
      
      ChartUtils.renderBarChart(vc.id, labels, data, null, `Avg ${yAxisCol}`);
      
    } else if (vc.type === 'scatter') {
      if (!yAxisCol) return;
      const dataPoints = rows.slice(0, 50).map(r => ({
        x: parseFloat(r[xAxisCol]) || 0,
        y: parseFloat(r[yAxisCol]) || 0
      }));
      ChartUtils.renderScatterPlot(vc.id, dataPoints, null, xAxisCol, yAxisCol);
      
    } else if (vc.type === 'pie') {
      const counts = {};
      rows.forEach(r => {
        const cat = String(r[xAxisCol] || 'Unknown');
        counts[cat] = (counts[cat] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5);
      const labels = sorted.map(s => s[0]);
      const data = sorted.map(s => s[1]);
      
      ChartUtils.renderPieChart(vc.id, labels, data, null);
    }
  }

  // Helper utility: find highest correlation variable pair
  function findMaxCorrelationPair() {
    const numericCols = Object.keys(Agent.dataset.columnTypes).filter(c => Agent.dataset.columnTypes[c] === 'numeric');
    if (numericCols.length < 2) return null;
    
    let maxR = -1;
    let bestPair = null;
    
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const col1 = numericCols[i];
        const col2 = numericCols[j];
        const rVal = Agent.dataset.eda.correlations[col1]?.[col2] || 0;
        if (Math.abs(rVal) > maxR && rVal !== 1.0) {
          maxR = Math.abs(rVal);
          bestPair = { c1: col1, c2: col2, r: rVal };
        }
      }
    }
    return bestPair;
  }
});
