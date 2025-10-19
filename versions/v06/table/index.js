// Table.js
class Table {
  constructor(tableId, objectArray, options = {}) {
    this.tableId = tableId;
    this.table = document.getElementById(tableId);
    if (!this.table) throw new Error(`Table not found with id: ${tableId}`);

    // ---- Nye opsjoner/standarder for identitet/integrasjon ----
    const {
      idKey = "_rid",
      collectionKey = null,
      collectionName = null,
      id = { length: 4, alphabet: "BASE36_UPPER", collision_max_retries: 8 },
      // Global columns
      globalColumns = {
        index: false,
        select: false,
        checked: false
      },
      selectMode = "multiple", // "multiple" | "single"
      // Expanded view options
      expandedView = {
        enabled: true,
        direction: "bottom", // "bottom" | "right"
        mobileBreakpoint: 768
      },
      ...restOptions
    } = options || {};

    this.options = {
      idKey,
      collectionKey,
      collectionName,
      id,
      globalColumns,
      selectMode,
      expandedView,
      ...restOptions,
    };

    this.data = Array.isArray(objectArray) ? [...objectArray] : [];
    this.eventListeners = new Map();
    
    // Selection state
    this.selectedItems = new Set();
    this.selectedIndex = -1; // For single selection mode

    // Expanded view state
    this.isExpanded = false;
    this.expandedSheet = null;

    // Row sheet state
    this.openRowSheets = new Map(); // rowIndex -> sheet element

    // Task tracking system
    this.taskHistory = [];
    this.activeTab = 'table'; // 'table' | 'tasks' | 'workers'

    // Worker system
    this.workers = [];
    this.activeWorkers = new Map(); // workerId -> worker instance

    // Console system
    this.console = null;
    this.activeConsoleTab = 'runner'; // 'runner' | 'controller'
    this.controllerData = [];
    this.consoleLogs = {
      delegater: [],
      actions: [],
      responses: []
    };

    this.initAttributes();

    // Sørg for ID-er før headers/renderer
    this.ensureRowIds();
    this.headers = this.extractHeaders();

    this.render();
    this.setupEventListeners();
    this.initConsole();
  }

  // ------------------------------ Oppsett/attributter ------------------------------
  initAttributes() {
    const options = this.options;
    this.attr = {
      table: options.tableAttr || (() => ({})),
      thead: options.theadAttr || (() => ({})),
      tbody: options.tbodyAttr || (() => ({})),
      tr: options.trAttr || (() => ({})),
      th: options.thAttr || ((key) => ({})),
      td: options.tdAttr || ((key, val) => ({})),
    };

    this.inputAttr =
      options.inputAttr ||
      ((key, val) => ({
        style: "background:none; border:none; outline:none;",
      }));

    this.onCellRender = options.onCellRender || null;
    this.editableMode = options.editableMode || "cell"; // "cell" | "input"
  }

  // ------------------------------ Identitet ------------------------------
  ensureRowIds() {
    const { idKey } = this.options;
    const existing = new Set();
    let countNumber = 1;
    
    // First pass: collect existing IDs and find highest count number
    for (const row of this.data) {
      if (row && typeof row === "object" && row[idKey]) {
        const existingId = String(row[idKey]).toUpperCase();
        existing.add(existingId);
        
        // Extract count number if it exists at the start of the ID
        const match = existingId.match(/^(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= countNumber) {
            countNumber = num + 1;
          }
        }
      }
    }
    
    // Second pass: assign IDs to rows that don't have them
    for (const row of this.data) {
      if (!row || typeof row !== "object") continue;
      if (!row[idKey]) {
        row[idKey] = this._generateUniqueIdWithCount(existing, countNumber);
        existing.add(row[idKey]);
        countNumber++;
      } else {
        row[idKey] = String(row[idKey]).toUpperCase();
      }
    }
  }

  _generateUniqueIdWithCount(existingSet, countNumber) {
    const { id } = this.options;
    const baseLength = Math.max(1, Number(id.length || 4));
    const alphabet =
      id.alphabet === "BASE36_UPPER"
        ? "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        : String(id.alphabet || "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const retries = Math.max(1, Number(id.collision_max_retries || 8));
    
    // Generate ID with count number prefix
    for (let i = 0; i < retries; i++) {
      let randomPart = "";
      const remainingLength = Math.max(0, baseLength - String(countNumber).length);
      
      for (let j = 0; j < remainingLength; j++) {
        randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      
      const fullId = countNumber + randomPart;
      if (!existingSet.has(fullId)) return fullId;
    }
    
    // Fallback: just use the count number if all retries fail
    const fallbackId = String(countNumber);
    if (!existingSet.has(fallbackId)) return fallbackId;
    
    throw new Error("Failed to generate unique row id after retries.");
  }

  _generateUniqueId(existingSet) {
    const { id } = this.options;
    const length = Math.max(1, Number(id.length || 4));
    const alphabet =
      id.alphabet === "BASE36_UPPER"
        ? "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        : String(id.alphabet || "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const retries = Math.max(1, Number(id.collision_max_retries || 8));
    for (let i = 0; i < retries; i++) {
      let s = "";
      for (let j = 0; j < length; j++) {
        s += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (!existingSet.has(s)) return s;
    }
    throw new Error("Failed to generate unique row id after retries.");
  }

  getRowIdentity(rowIndex) {
    const { idKey, collectionKey, collectionName } = this.options;
    const row = this.data[rowIndex];
    const id = row && row[idKey] ? String(row[idKey]).toUpperCase() : null;
    const collection =
      (row && collectionKey && row[collectionKey]) || collectionName || null;
    return { id, collection };
  }

  // ------------------------------ Hjelpere ------------------------------
  extractHeaders() {
    const keys = new Set();
    const { idKey } = this.options;
    this.data.forEach((obj) =>
      Object.keys(obj || {}).forEach((key) => {
        if (key !== idKey) keys.add(key); // skjul id-kolonnen i UI
      })
    );
    return Array.from(keys);
  }

  applyAttributes(el, attrObj) {
    if (typeof attrObj === "string") {
      const matches = attrObj.match(/(\w+)="([^"]*)"/g);
      if (matches) {
        matches.forEach((match) => {
          const [, key, val] = match.match(/(\w+)="([^"]*)"/);
          el.setAttribute(key, val);
        });
      }
    } else if (typeof attrObj === "object" && attrObj !== null) {
      Object.entries(attrObj).forEach(([key, val]) =>
        el.setAttribute(key, val)
      );
    }
  }

  _replaceSection(tagName, newNode) {
    const old = this.table.querySelector(tagName);
    if (old) {
      this.table.replaceChild(newNode, old);
    } else {
      this.table.appendChild(newNode);
    }
  }

  // ------------------------------ Rendering ------------------------------
  renderTableHeader() {
    // Create or update table header section above the table
    let headerSection = this.table.parentNode?.querySelector('.table-header-section');
    
    if (!headerSection) {
      headerSection = document.createElement('div');
      headerSection.className = 'table-header-section mb-4 p-4 bg-white rounded-lg shadow-sm border';
      this.table.parentNode?.insertBefore(headerSection, this.table);
    }

    // Clear existing content
    headerSection.innerHTML = '';

    // Create header with tabs and controls
    const headerTop = document.createElement('div');
    headerTop.className = 'flex justify-between items-center mb-2';

    // Tab navigation
    const tabContainer = document.createElement('div');
    tabContainer.className = 'flex items-center space-x-1';

    const tableTab = this.createTab('table', 'Tabell', this.activeTab === 'table');
    const tasksTab = this.createTab('tasks', 'Tasks', this.activeTab === 'tasks');
    const workersTab = this.createTab('workers', 'Workers', this.activeTab === 'workers');

    tabContainer.appendChild(tableTab);
    tabContainer.appendChild(tasksTab);
    tabContainer.appendChild(workersTab);

    // Settings button and dropdown
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'relative';

    const settingsButton = document.createElement('button');
    settingsButton.className = 'px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
    settingsButton.innerHTML = '⚙️ Innstillinger';
    
    const settingsDropdown = document.createElement('div');
    settingsDropdown.className = 'absolute right-0 top-full mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-lg z-20 hidden';
    
    this.setupSettingsDropdown(settingsButton, settingsDropdown);
    
    settingsContainer.appendChild(settingsButton);
    settingsContainer.appendChild(settingsDropdown);

    // Expand arrow button
    const expandButton = document.createElement('button');
    expandButton.className = 'ml-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 rounded-md border border-blue-300 text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200';
    expandButton.innerHTML = '↗️ Utvid';
    expandButton.setAttribute('data-expand-button', 'true');
    expandButton.addEventListener('click', () => {
      this.toggleExpandedView();
    });

    const rightControls = document.createElement('div');
    rightControls.className = 'flex items-center space-x-2';
    rightControls.appendChild(expandButton);
    rightControls.appendChild(settingsContainer);

    headerTop.appendChild(tabContainer);
    headerTop.appendChild(rightControls);

    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'relative';

    const autocompleteInput = document.createElement('input');
    autocompleteInput.type = 'text';
    autocompleteInput.placeholder = 'Skriv tabellnavn...';
    autocompleteInput.value = this.options.collectionName || '';
    autocompleteInput.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
    autocompleteInput.setAttribute('data-table-name-input', 'true');

    // Create dropdown for autocomplete suggestions
    const dropdown = document.createElement('div');
    dropdown.className = 'absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-10 hidden max-h-48 overflow-y-auto';
    dropdown.setAttribute('data-autocomplete-dropdown', 'true');

    // Sample suggestions - can be extended with actual data
    const suggestions = ['users', 'products', 'orders', 'customers', 'inventory', 'reports'];

    // Setup autocomplete functionality
    this.setupAutocomplete(autocompleteInput, dropdown, suggestions);

    autocompleteContainer.appendChild(autocompleteInput);
    autocompleteContainer.appendChild(dropdown);

    headerSection.appendChild(headerTop);
    headerSection.appendChild(autocompleteContainer);

    // Create content area that switches based on active tab
    this.renderTabContent();
  }

  createTab(tabId, label, isActive) {
    const tab = document.createElement('button');
    tab.className = `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive 
        ? 'bg-blue-100 text-blue-700 border border-blue-200' 
        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
    }`;
    tab.textContent = label;
    tab.setAttribute('data-tab', tabId);
    
    tab.addEventListener('click', () => {
      this.switchTab(tabId);
    });
    
    return tab;
  }

  switchTab(tabId) {
    if (this.activeTab === tabId) return;
    
    this.activeTab = tabId;
    this.renderTableHeader(); // Re-render header to update active tab
    
    this.emit('tabChanged', {
      activeTab: tabId,
      table: this
    });
  }

  renderTabContent() {
    // Find or create content container
    let contentContainer = this.table.parentNode?.querySelector('.tab-content-container');
    
    if (!contentContainer) {
      contentContainer = document.createElement('div');
      contentContainer.className = 'tab-content-container';
      this.table.parentNode?.insertBefore(contentContainer, this.table.nextSibling);
    }

    // Clear existing content
    contentContainer.innerHTML = '';

    if (this.activeTab === 'table') {
      // Show the table (it's already in the DOM)
      this.table.style.display = 'table';
    } else if (this.activeTab === 'tasks') {
      // Hide the table and show tasks view
      this.table.style.display = 'none';
      const tasksView = this.createTasksView();
      contentContainer.appendChild(tasksView);
    } else if (this.activeTab === 'workers') {
      // Hide the table and show workers view
      this.table.style.display = 'none';
      const workersView = this.createWorkersView();
      contentContainer.appendChild(workersView);
    }
  }

  createTasksView() {
    const container = document.createElement('div');
    container.className = 'tasks-view bg-white rounded-lg shadow-sm border p-6';

    // Tasks header
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-6';

    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-gray-800';
    title.textContent = 'Aktivitetshistorikk';

    const badge = document.createElement('span');
    badge.className = 'px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full';
    badge.textContent = `${this.taskHistory.length} hendelser`;

    header.appendChild(title);
    header.appendChild(badge);

    // Kanban board
    const kanbanBoard = this.createKanbanBoard();

    container.appendChild(header);
    container.appendChild(kanbanBoard);

    return container;
  }

  createKanbanBoard() {
    const board = document.createElement('div');
    board.className = 'kanban-board grid grid-cols-1 md:grid-cols-3 gap-6';

    // Define columns
    const columns = [
      { id: 'queue', title: 'I kø', color: 'yellow', status: 'pending' },
      { id: 'progress', title: 'Pågår', color: 'blue', status: 'in_progress' },
      { id: 'completed', title: 'Utført', color: 'green', status: 'completed' }
    ];

    columns.forEach(column => {
      const columnElement = this.createKanbanColumn(column);
      board.appendChild(columnElement);
    });

    return board;
  }

  createKanbanColumn(column) {
    const columnDiv = document.createElement('div');
    columnDiv.className = 'kanban-column bg-gray-50 rounded-lg p-4';

    // Column header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-4';

    const title = document.createElement('h4');
    title.className = 'font-medium text-gray-800';
    title.textContent = column.title;

    const tasksInColumn = this.taskHistory.filter(task => task.status === column.status);
    const count = document.createElement('span');
    count.className = `px-2 py-1 bg-${column.color}-100 text-${column.color}-800 text-xs rounded-full`;
    count.textContent = tasksInColumn.length;

    header.appendChild(title);
    header.appendChild(count);

    // Tasks container
    const tasksContainer = document.createElement('div');
    tasksContainer.className = 'space-y-3';

    // Add tasks to column
    tasksInColumn.forEach(task => {
      const taskChip = this.createTaskChip(task, column.color);
      tasksContainer.appendChild(taskChip);
    });

    // Empty state
    if (tasksInColumn.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'text-center py-8 text-gray-500 text-sm';
      emptyState.textContent = 'Ingen oppgaver';
      tasksContainer.appendChild(emptyState);
    }

    columnDiv.appendChild(header);
    columnDiv.appendChild(tasksContainer);

    return columnDiv;
  }

  createTaskChip(task, color) {
    const chip = document.createElement('div');
    chip.className = `task-chip bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer`;

    // Task header
    const taskHeader = document.createElement('div');
    taskHeader.className = 'flex items-start justify-between mb-2';

    const taskType = document.createElement('span');
    taskType.className = `px-2 py-1 bg-${color}-100 text-${color}-800 text-xs rounded-full font-medium`;
    taskType.textContent = this.getTaskTypeLabel(task.type);

    const timestamp = document.createElement('span');
    timestamp.className = 'text-xs text-gray-500';
    timestamp.textContent = this.formatTimestamp(task.timestamp);

    taskHeader.appendChild(taskType);
    taskHeader.appendChild(timestamp);

    // Task content
    const taskContent = document.createElement('div');
    taskContent.className = 'text-sm text-gray-700';
    taskContent.textContent = task.description;

    // Task details
    if (task.details) {
      const taskDetails = document.createElement('div');
      taskDetails.className = 'mt-2 text-xs text-gray-500';
      taskDetails.textContent = task.details;
      chip.appendChild(taskDetails);
    }

    chip.appendChild(taskHeader);
    chip.appendChild(taskContent);

    // Click handler to show task details
    chip.addEventListener('click', () => {
      this.showTaskDetails(task);
    });

    return chip;
  }

  setupSettingsDropdown(button, dropdown) {
    // Create dropdown content
    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'p-3';

    // Add new row button
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md mb-2 flex items-center';
    addRowBtn.innerHTML = '➕ Legg til ny rad';
    addRowBtn.addEventListener('click', () => {
      this.addNewRow();
      dropdown.classList.add('hidden');
    });

    // Selection mode toggle
    const selectionModeContainer = document.createElement('div');
    selectionModeContainer.className = 'mb-2';
    
    const selectionModeLabel = document.createElement('label');
    selectionModeLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
    selectionModeLabel.textContent = 'Valgmodus:';
    
    const selectionModeSelect = document.createElement('select');
    selectionModeSelect.className = 'w-full px-2 py-1 border border-gray-300 rounded text-sm';
    selectionModeSelect.innerHTML = `
      <option value="multiple">Multiple (checkboxes)</option>
      <option value="single">Single (radio buttons)</option>
    `;
    selectionModeSelect.value = this.options.selectMode;
    selectionModeSelect.addEventListener('change', (e) => {
      this.toggleSelectionMode(e.target.value);
    });

    selectionModeContainer.appendChild(selectionModeLabel);
    selectionModeContainer.appendChild(selectionModeSelect);

    // Show selected items button
    const showSelectedBtn = document.createElement('button');
    showSelectedBtn.className = 'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md mb-2 flex items-center';
    showSelectedBtn.innerHTML = '👁️ Vis valgte rader';
    showSelectedBtn.addEventListener('click', () => {
      this.showSelectedItems();
      dropdown.classList.add('hidden');
    });

    // Show checked items button
    const showCheckedBtn = document.createElement('button');
    showCheckedBtn.className = 'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md mb-2 flex items-center';
    showCheckedBtn.innerHTML = '✅ Vis sjekket rader';
    showCheckedBtn.addEventListener('click', () => {
      this.showCheckedItems();
      dropdown.classList.add('hidden');
    });

    // Global columns toggles
    const columnsContainer = document.createElement('div');
    columnsContainer.className = 'border-t pt-2 mt-2';
    
    const columnsLabel = document.createElement('label');
    columnsLabel.className = 'block text-sm font-medium text-gray-700 mb-2';
    columnsLabel.textContent = 'Vis kolonner:';
    
    const checkboxes = [
      { key: 'index', label: '# Index' },
      { key: 'select', label: '☑️ Select' },
      { key: 'checked', label: '✓ Checked' }
    ];

    checkboxes.forEach(({ key, label }) => {
      const checkboxContainer = document.createElement('div');
      checkboxContainer.className = 'flex items-center mb-1';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `settings-${key}`;
      checkbox.className = 'mr-2';
      checkbox.checked = this.options.globalColumns[key];
      checkbox.addEventListener('change', (e) => {
        this.toggleGlobalColumn(key, e.target.checked);
      });
      
      const checkboxLabel = document.createElement('label');
      checkboxLabel.htmlFor = `settings-${key}`;
      checkboxLabel.className = 'text-sm text-gray-700 cursor-pointer';
      checkboxLabel.textContent = label;
      
      checkboxContainer.appendChild(checkbox);
      checkboxContainer.appendChild(checkboxLabel);
      columnsContainer.appendChild(checkboxContainer);
    });

    // Assemble dropdown
    dropdownContent.appendChild(addRowBtn);
    dropdownContent.appendChild(selectionModeContainer);
    dropdownContent.appendChild(showSelectedBtn);
    dropdownContent.appendChild(showCheckedBtn);
    dropdownContent.appendChild(columnsContainer);
    
    dropdown.appendChild(dropdownContent);

    // Toggle dropdown on button click
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!button.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  setupAutocomplete(input, dropdown, suggestions) {
    input.addEventListener('input', (e) => {
      const value = e.target.value.toLowerCase();
      dropdown.innerHTML = '';

      if (value.length === 0) {
        dropdown.classList.add('hidden');
        return;
      }

      const filtered = suggestions.filter(suggestion => 
        suggestion.toLowerCase().includes(value)
      );

      if (filtered.length === 0) {
        dropdown.classList.add('hidden');
        return;
      }

      filtered.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm';
        item.textContent = suggestion;
        item.addEventListener('click', () => {
          input.value = suggestion;
          this.options.collectionName = suggestion;
          dropdown.classList.add('hidden');
          
          // Emit event for collection name change
          this.emit('collectionNameChange', {
            collectionName: suggestion,
            table: this
          });
        });
        dropdown.appendChild(item);
      });

      dropdown.classList.remove('hidden');
    });

    input.addEventListener('blur', (e) => {
      // Delay hiding to allow click on dropdown items
      setTimeout(() => {
        dropdown.classList.add('hidden');
        
        // Update collection name if changed
        if (e.target.value !== this.options.collectionName) {
          this.options.collectionName = e.target.value;
          this.emit('collectionNameChange', {
            collectionName: e.target.value,
            table: this
          });
        }
      }, 150);
    });

    input.addEventListener('focus', () => {
      if (input.value.length > 0) {
        // Trigger input event to show suggestions
        input.dispatchEvent(new Event('input'));
      }
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('div');
      let selectedIndex = Array.from(items).findIndex(item => 
        item.classList.contains('bg-blue-100')
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < items.length - 1) {
          if (selectedIndex >= 0) items[selectedIndex].classList.remove('bg-blue-100');
          selectedIndex++;
          items[selectedIndex].classList.add('bg-blue-100');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
          items[selectedIndex].classList.remove('bg-blue-100');
          selectedIndex--;
          items[selectedIndex].classList.add('bg-blue-100');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0) {
          items[selectedIndex].click();
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
      }
    });
  }

  renderGlobalColumnHeaders(tr) {
    const { globalColumns, selectMode } = this.options;

    // Index column
    if (globalColumns.index) {
      const th = document.createElement("th");
      th.className = "px-4 py-2 text-left font-semibold text-sm bg-blue-50";
      th.textContent = "#";
      tr.appendChild(th);
    }

    // Select column
    if (globalColumns.select) {
      const th = document.createElement("th");
      th.className = "px-4 py-2 text-left font-semibold text-sm bg-green-50";
      
      if (selectMode === "multiple") {
        // Master checkbox for select all/none
        const masterCheckbox = document.createElement("input");
        masterCheckbox.type = "checkbox";
        masterCheckbox.className = "form-checkbox";
        masterCheckbox.addEventListener("change", (e) => {
          this.toggleSelectAll(e.target.checked);
        });
        th.appendChild(masterCheckbox);
      } else {
        th.textContent = "Select";
      }
      
      tr.appendChild(th);
    }

    // Checked column
    if (globalColumns.checked) {
      const th = document.createElement("th");
      th.className = "px-4 py-2 text-left font-semibold text-sm bg-yellow-50";
      th.textContent = "✓";
      tr.appendChild(th);
    }
  }

  renderGlobalColumnCells(tr, rowIndex, obj) {
    const { globalColumns, selectMode } = this.options;
    const { id } = this.getRowIdentity(rowIndex);

    // Index column
    if (globalColumns.index) {
      const td = document.createElement("td");
      td.className = "px-4 py-2 text-sm bg-blue-25 cursor-pointer hover:bg-blue-100";
      td.textContent = rowIndex + 1;
      td.addEventListener("click", () => {
        this.activateRowByIndex(rowIndex);
      });
      tr.appendChild(td);
    }

    // Select column
    if (globalColumns.select) {
      const td = document.createElement("td");
      td.className = "px-4 py-2 text-sm bg-green-25";
      
      if (selectMode === "multiple") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-checkbox";
        checkbox.checked = this.selectedItems.has(id);
        checkbox.addEventListener("change", (e) => {
          this.toggleRowSelection(rowIndex, e.target.checked);
        });
        td.appendChild(checkbox);
      } else {
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `${this.tableId}_select`;
        radio.className = "form-radio";
        radio.checked = this.selectedIndex === rowIndex;
        radio.addEventListener("change", (e) => {
          if (e.target.checked) {
            this.selectSingleRow(rowIndex);
          }
        });
        td.appendChild(radio);
      }
      
      tr.appendChild(td);
    }

    // Checked column
    if (globalColumns.checked) {
      const td = document.createElement("td");
      td.className = "px-4 py-2 text-sm bg-yellow-25";
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-checkbox";
      checkbox.checked = obj._checked || false;
      checkbox.addEventListener("change", (e) => {
        this.toggleRowChecked(rowIndex, e.target.checked);
      });
      td.appendChild(checkbox);
      
      tr.appendChild(td);
    }
  }

  renderHeader() {
    const thead = document.createElement("thead");
    this.applyAttributes(thead, this.attr.thead());

    const tr = document.createElement("tr");
    this.applyAttributes(tr, this.attr.tr());

    // Add global columns first
    this.renderGlobalColumnHeaders(tr);

    this.headers.forEach((key) => {
      const th = document.createElement("th");
      this.applyAttributes(th, this.attr.th(key));

      if (this.editableMode === "input") {
        const input = document.createElement("input");
        input.name = key;
        input.value = key;
        input.setAttribute("contenteditable", "true");
        input.setAttribute("data-key", key);
        this.applyAttributes(input, this.inputAttr(key, key));
        th.appendChild(input);
      } else {
        th.setAttribute("contenteditable", "true");
        th.setAttribute("data-key", key);
        th.textContent = key;
      }

      tr.appendChild(th);
    });

    // Action header
    const thDelete = document.createElement("th");
    thDelete.setAttribute(
      "class",
      "px-4 py-2 text-left font-semibold text-sm bg-red-100"
    );
    thDelete.textContent = "Action";
    tr.appendChild(thDelete);

    thead.appendChild(tr);
    this._replaceSection("thead", thead);
  }

  renderRows() {
    const tbody = document.createElement("tbody");
    this.applyAttributes(tbody, this.attr.tbody());

    this.data.forEach((obj, rowIndex) => {
      const tr = document.createElement("tr");
      this.applyAttributes(tr, this.attr.tr());
      tr.setAttribute("data-row", rowIndex);

      // Legg identitet på <tr>
      const { id, collection } = this.getRowIdentity(rowIndex);
      if (id != null) tr.setAttribute("data-id", id);
      if (collection != null) tr.setAttribute("data-collection", collection);

      // Add global columns first
      this.renderGlobalColumnCells(tr, rowIndex, obj);

      this.headers.forEach((key) => {
        const td = document.createElement("td");
        this.applyAttributes(td, this.attr.td(key, obj ? obj[key] : undefined));

        const originalVal = obj ? obj[key] : "";
        const val = this.onCellRender
          ? this.onCellRender(key, originalVal)
          : originalVal ?? "";

        if (this.editableMode === "input") {
          const input = document.createElement("input");
          input.name = key;
          input.value = val;
          input.setAttribute("contenteditable", "true");
          input.setAttribute("data-key", key);
          input.setAttribute("data-row", rowIndex);
          this.applyAttributes(input, this.inputAttr(key, val));
          td.appendChild(input);
        } else {
          td.setAttribute("contenteditable", "true");
          td.setAttribute("data-key", key);
          td.setAttribute("data-row", rowIndex);
          td.textContent = val;
        }

        tr.appendChild(td);
      });

      // Action column with expand and delete buttons
      const tdAction = document.createElement("td");
      tdAction.setAttribute("class", "px-4 py-2 text-sm");
      
      // Container for buttons
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "flex space-x-2";
      
      // Expand row button
      const expandBtn = document.createElement("button");
      expandBtn.innerHTML = "↗️";
      expandBtn.setAttribute("data-row", rowIndex);
      expandBtn.setAttribute("title", "Utvid rad");
      expandBtn.setAttribute(
        "class",
        "px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs transition-colors"
      );
      expandBtn.addEventListener("click", () => {
        this.toggleRowSheet(rowIndex);
      });
      
      // Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️";
      deleteBtn.setAttribute("data-row", rowIndex);
      deleteBtn.setAttribute("title", "Slett rad");
      deleteBtn.setAttribute(
        "class",
        "px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs transition-colors"
      );
      deleteBtn.addEventListener("click", () => {
        const { id, collection } = this.getRowIdentity(rowIndex);
        this.emit("deleteRow", { rowIndex, id, collection, table: this });
      });
      
      buttonContainer.appendChild(expandBtn);
      buttonContainer.appendChild(deleteBtn);
      tdAction.appendChild(buttonContainer);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });

    this._replaceSection("tbody", tbody);
  }

  render() {
    // sørg for ID-er alltid er tilstede
    this.ensureRowIds();
    this.applyAttributes(this.table, this.attr.table());
    this.table.setAttribute("data-dynamic", "true");

    // render table header (UI header above table)
    this.renderTableHeader();
    
    // header og rows
    this.renderHeader();
    this.renderRows();

    // Add task for table render
    this.addTask('table_render', `Tabell rendret med ${this.data.length} rader`, null, 'completed');

    this.emit("tableRender", {
      data: this.data,
      headers: this.headers,
      table: this,
    });
  }

  // ------------------------------ Data / parsing ------------------------------
  loadJson(raw) {
    const res = { msg: "", data: null };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.data = parsed;
        this.ensureRowIds();
        this.headers = this.extractHeaders();
        this.render();
        this.emit("dataChange", {
          data: this.data,
          source: "json",
          table: this,
        });
        res.data = this.data;
        res.msg = "(parsed)";
        return res;
      }
    } catch (e1) {
      try {
        const converted = raw
          .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
          .replace(/'([^']*)'/g, '"$1"');
        const parsed = JSON.parse(converted);
        if (Array.isArray(parsed)) {
          this.data = parsed;
          this.ensureRowIds();
          this.headers = this.extractHeaders();
          this.render();
          this.emit("dataChange", {
            data: this.data,
            source: "json-converted",
            table: this,
          });
          res.data = this.data;
          res.msg = "(converted, parsed)";
          return res;
        }
      } catch (e2) {
        res.msg = "(failed)";
        console.error("JSON parsing failed:", e2);
      }
    }
    return res;
  }

  extractTableData() {
    const rows = this.table.querySelectorAll("tbody tr");
    const extracted = [];
    const { idKey } = this.options;

    rows.forEach((rowEl) => {
      const obj = {};
      // ta vare på skjult ID
      const rid = rowEl.getAttribute("data-id");
      if (rid) obj[idKey] = rid;

      this.headers.forEach((key) => {
        // Finn input eller contenteditable celle
        let value = "";
        // først prøv input (hvis editableMode = input)
        const input = rowEl.querySelector(`input[data-key="${key}"]`);
        if (input) {
          value = input.value != null ? String(input.value).trim() : "";
        } else {
          const cell = rowEl.querySelector(`[data-key="${key}"]`);
          if (cell) value = (cell.textContent || "").trim();
        }
        obj[key] = value || "";
      });
      extracted.push(obj);
    });

    return extracted;
  }

  // ------------------------------ Global Column Methods ------------------------------
  activateRowByIndex(rowIndex) {
    const { id, collection } = this.getRowIdentity(rowIndex);
    this.emit("rowActivated", {
      rowIndex,
      id,
      collection,
      data: this.data[rowIndex],
      table: this
    });
  }

  toggleSelectAll(checked) {
    if (checked) {
      this.selectedItems.clear();
      this.data.forEach((row, index) => {
        const { id } = this.getRowIdentity(index);
        this.selectedItems.add(id);
      });
    } else {
      this.selectedItems.clear();
    }
    
    this.render(); // Re-render to update checkboxes
    this.emit("selectionChanged", {
      selectedItems: Array.from(this.selectedItems),
      selectedCount: this.selectedItems.size,
      table: this
    });
  }

  toggleRowSelection(rowIndex, checked) {
    const { id, collection } = this.getRowIdentity(rowIndex);
    
    if (checked) {
      this.selectedItems.add(id);
    } else {
      this.selectedItems.delete(id);
    }
    
    this.emit("rowSelected", {
      rowIndex,
      id,
      collection,
      selected: checked,
      selectedItems: Array.from(this.selectedItems),
      table: this
    });
    
    this.emit("selectionChanged", {
      selectedItems: Array.from(this.selectedItems),
      selectedCount: this.selectedItems.size,
      table: this
    });
  }

  selectSingleRow(rowIndex) {
    const previousIndex = this.selectedIndex;
    this.selectedIndex = rowIndex;
    const { id, collection } = this.getRowIdentity(rowIndex);
    
    this.render(); // Re-render to update radio buttons
    
    this.emit("singleRowSelected", {
      rowIndex,
      id,
      collection,
      previousIndex,
      data: this.data[rowIndex],
      table: this
    });
  }

  toggleRowChecked(rowIndex, checked) {
    const { id, collection } = this.getRowIdentity(rowIndex);
    
    // Update the data object
    if (this.data[rowIndex]) {
      this.data[rowIndex]._checked = checked;
    }
    
    this.emit("rowChecked", {
      rowIndex,
      id,
      collection,
      checked,
      data: this.data[rowIndex],
      table: this
    });
  }

  getSelectedItems() {
    return Array.from(this.selectedItems);
  }

  getSelectedIndex() {
    return this.selectedIndex;
  }

  getCheckedRows() {
    return this.data.filter(row => row._checked === true);
  }

  // Settings dropdown helper methods
  addNewRow() {
    const newRow = { 
      name: `User ${this.data.length + 1}`, 
      email: `user${this.data.length + 1}@example.com`, 
      role: "New Role" 
    };
    this.data.push(newRow);
    
    // Add task for row addition
    this.addTask('row_added', `Ny rad lagt til: ${newRow.name}`, `Rad ${this.data.length}`, 'completed');
    
    this.render();
    
    this.emit("rowAdded", {
      row: newRow,
      rowIndex: this.data.length - 1,
      table: this
    });
  }

  showSelectedItems() {
    const selected = this.getSelectedItems();
    this.emit("showSelectedItems", {
      selectedItems: selected,
      selectedCount: selected.length,
      table: this
    });
  }

  showCheckedItems() {
    const checked = this.getCheckedRows();
    this.emit("showCheckedItems", {
      checkedRows: checked,
      checkedCount: checked.length,
      table: this
    });
  }

  toggleSelectionMode(mode) {
    this.options.selectMode = mode;
    this.selectedItems.clear();
    this.selectedIndex = -1;
    this.render();
    
    this.emit("selectionModeChanged", {
      mode,
      table: this
    });
  }

  toggleGlobalColumn(columnKey, enabled) {
    this.options.globalColumns[columnKey] = enabled;
    this.render();
    
    this.emit("globalColumnToggled", {
      columnKey,
      enabled,
      globalColumns: this.options.globalColumns,
      table: this
    });
  }

  // ------------------------------ Worker Management ------------------------------
  saveWorker(form, existingWorker = null) {
    const formData = new FormData(form);
    const triggers = Array.from(form.querySelectorAll('input[name="triggers"]:checked')).map(cb => cb.value);
    
    const worker = {
      id: existingWorker?.id || this.generateWorkerId(),
      name: formData.get('name'),
      type: formData.get('type'),
      triggers,
      enabled: existingWorker?.enabled ?? true,
      config: this.buildWorkerConfig(formData),
      createdAt: existingWorker?.createdAt || new Date(),
      updatedAt: new Date()
    };

    if (existingWorker) {
      // Update existing worker
      const index = this.workers.findIndex(w => w.id === existingWorker.id);
      if (index !== -1) {
        this.workers[index] = worker;
      }
    } else {
      // Add new worker
      this.workers.push(worker);
    }

    // Re-render workers view
    if (this.activeTab === 'workers') {
      this.renderTabContent();
    }

    // Setup worker listeners
    this.setupWorkerListeners(worker);

    this.emit('workerSaved', {
      worker,
      isNew: !existingWorker,
      table: this
    });

    this.hideWorkerForm();
  }

  buildWorkerConfig(formData) {
    const type = formData.get('type');
    
    if (type === 'api') {
      return {
        handler: {
          url: formData.get('handler_url'),
          method: formData.get('handler_method'),
          headers: this.parseJSON(formData.get('handler_headers')),
          payload: this.parseJSON(formData.get('handler_payload')),
          auth: {
            type: formData.get('handler_auth_type'),
            value: formData.get('handler_auth_value')
          }
        },
        controller: {
          url: formData.get('controller_url'),
          method: formData.get('controller_method'),
          headers: this.parseJSON(formData.get('controller_headers')),
          query: this.parseJSON(formData.get('controller_query')),
          validation: {
            enabled: formData.get('controller_validation_enabled') === 'on'
          },
          retryCount: parseInt(formData.get('controller_retry_count')) || 3,
          timeout: parseInt(formData.get('controller_timeout')) || 5,
          auth: {
            type: formData.get('controller_auth_type'),
            value: formData.get('controller_auth_value')
          }
        }
      };
    } else {
      return {
        storageType: formData.get('storageType'),
        storageKey: formData.get('storageKey'),
        format: formData.get('format')
      };
    }
  }

  parseJSON(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.warn('Invalid JSON:', jsonString);
      return {};
    }
  }

  generateWorkerId() {
    return 'worker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  editWorker(workerId) {
    const worker = this.workers.find(w => w.id === workerId);
    if (worker) {
      this.showWorkerForm(worker);
    }
  }

  toggleWorker(workerId) {
    const worker = this.workers.find(w => w.id === workerId);
    if (worker) {
      worker.enabled = !worker.enabled;
      worker.updatedAt = new Date();
      
      if (worker.enabled) {
        this.setupWorkerListeners(worker);
      } else {
        this.removeWorkerListeners(worker);
      }

      // Re-render workers view
      if (this.activeTab === 'workers') {
        this.renderTabContent();
      }

      this.emit('workerToggled', {
        worker,
        enabled: worker.enabled,
        table: this
      });
    }
  }

  deleteWorker(workerId) {
    if (confirm('Er du sikker på at du vil slette denne workeren?')) {
      const workerIndex = this.workers.findIndex(w => w.id === workerId);
      if (workerIndex !== -1) {
        const worker = this.workers[workerIndex];
        this.removeWorkerListeners(worker);
        this.workers.splice(workerIndex, 1);

        // Re-render workers view
        if (this.activeTab === 'workers') {
          this.renderTabContent();
        }

        this.emit('workerDeleted', {
          worker,
          table: this
        });
      }
    }
  }

  hideWorkerForm() {
    const formContainer = document.getElementById('worker-form-container');
    if (formContainer) {
      formContainer.innerHTML = `
        <div class="text-center py-8 text-gray-500 text-sm">
          <div class="mb-2">⚙️</div>
          <div>Velg en worker for å redigere</div>
          <div class="text-xs mt-1">eller opprett en ny worker</div>
        </div>
      `;
    }
  }

  setupWorkerListeners(worker) {
    if (!worker.enabled) return;

    // Remove existing listeners for this worker
    this.removeWorkerListeners(worker);

    worker.triggers.forEach(trigger => {
      const listener = (eventData) => {
        this.executeWorker(worker, trigger, eventData);
      };

      // Store listener reference for cleanup
      if (!this.activeWorkers.has(worker.id)) {
        this.activeWorkers.set(worker.id, { listeners: new Map() });
      }
      this.activeWorkers.get(worker.id).listeners.set(trigger, listener);

      // Add event listener
      this.addEventListener(trigger, listener);
    });
  }

  removeWorkerListeners(worker) {
    const activeWorker = this.activeWorkers.get(worker.id);
    if (activeWorker) {
      activeWorker.listeners.forEach((listener, trigger) => {
        this.removeEventListener(trigger, listener);
      });
      this.activeWorkers.delete(worker.id);
    }
  }

  async executeWorker(worker, trigger, eventData) {
    try {
      let result;
      if (worker.type === 'api') {
        result = await this.executeAPIWorker(worker, trigger, eventData);
      } else {
        result = await this.executeStorageWorker(worker, trigger, eventData);
      }

      // Log successful response to console
      this.logResponse(worker, true, result);

      // If controller tab is active and this was an API worker, refresh controller view
      if (this.activeConsoleTab === 'controller' && worker.type === 'api' && worker.config.controller?.url) {
        setTimeout(() => {
          this.triggerControllerRequests();
        }, 1000); // Wait 1 second for API to process
      }

      // Add task for successful worker execution
      this.addTask('worker_executed', `Worker "${worker.name}" kjørt`, `Trigger: ${trigger}`, 'completed');

    } catch (error) {
      console.error('Worker execution failed:', error);
      
      // Log failed response to console
      this.logResponse(worker, false, null, error);
      
      // Add task for failed worker execution
      this.addTask('worker_failed', `Worker "${worker.name}" feilet`, `Error: ${error.message}`, 'pending');
    }
  }

  async executeAPIWorker(worker, trigger, eventData) {
    const { handler, controller } = worker.config;

    // Execute handler (CRUD operation)
    let handlerResult = null;
    if (handler && handler.url) {
      handlerResult = await this.executeHandler(handler, trigger, eventData);
    }

    // Execute controller (validation) if enabled
    let controllerResult = null;
    if (controller && controller.url && controller.validation?.enabled) {
      // Wait a bit for the handler to complete on the server
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        controllerResult = await this.executeController(controller, trigger, eventData, handlerResult);
      } catch (error) {
        console.warn('Controller validation failed:', error);
        // Add task for validation failure
        this.addTask('validation_failed', `Validering feilet for worker "${worker.name}"`, `Error: ${error.message}`, 'pending');
      }
    }

    return {
      handler: handlerResult,
      controller: controllerResult,
      validated: controllerResult !== null
    };
  }

  async executeHandler(handlerConfig, trigger, eventData) {
    const { url, method, headers, payload, auth } = handlerConfig;

    // Process payload template with event data
    const processedPayload = this.processPayloadTemplate(payload, trigger, eventData);

    // Build headers with authentication
    const requestHeaders = { ...headers };
    this.applyAuthentication(requestHeaders, auth);

    const response = await fetch(url, {
      method: method || 'POST',
      headers: requestHeaders,
      body: JSON.stringify(processedPayload)
    });

    if (!response.ok) {
      throw new Error(`Handler HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async executeController(controllerConfig, trigger, eventData, handlerResult) {
    const { url, method, headers, query, auth, retryCount, timeout } = controllerConfig;

    // Build headers with authentication
    const requestHeaders = { ...headers };
    this.applyAuthentication(requestHeaders, auth);

    let lastError;
    for (let attempt = 0; attempt < (retryCount || 3); attempt++) {
      try {
        let requestUrl = url;
        let requestOptions = {
          method: method || 'GET',
          headers: requestHeaders
        };

        if (method === 'GET' && query) {
          // Process query parameters and append to URL
          const processedQuery = this.processPayloadTemplate(query, trigger, eventData);
          const queryString = new URLSearchParams(processedQuery).toString();
          requestUrl += (url.includes('?') ? '&' : '?') + queryString;
        } else if (method === 'POST' && query) {
          // Send query as POST body
          const processedQuery = this.processPayloadTemplate(query, trigger, eventData);
          requestOptions.body = JSON.stringify(processedQuery);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), (timeout || 5) * 1000);

        requestOptions.signal = controller.signal;

        const response = await fetch(requestUrl, requestOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Controller HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        // Validate result against expected data
        if (this.validateControllerResult(result, eventData, handlerResult)) {
          return result;
        } else {
          throw new Error('Data validation failed - server data does not match expected values');
        }

      } catch (error) {
        lastError = error;
        if (attempt < (retryCount || 3) - 1) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  applyAuthentication(headers, auth) {
    if (!auth || auth.type === 'none' || !auth.value) return;

    switch (auth.type) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.value}`;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${auth.value}`;
        break;
      case 'api_key':
        headers['X-API-Key'] = auth.value;
        break;
    }
  }

  validateControllerResult(controllerData, originalEventData, handlerResult) {
    // Basic validation - can be extended based on needs
    if (!controllerData) return false;

    // If we have handler result with an ID, check if controller returns the same ID
    if (handlerResult && handlerResult.id && controllerData.id) {
      return handlerResult.id === controllerData.id;
    }

    // If event data contains row data, validate key fields match
    if (originalEventData && originalEventData.rowData && controllerData.data) {
      const eventRow = originalEventData.rowData;
      const controllerRow = controllerData.data;
      
      // Check if key fields match (customize based on your data structure)
      const keyFields = ['id', 'name', 'email'];
      return keyFields.some(field => 
        eventRow[field] && controllerRow[field] && eventRow[field] === controllerRow[field]
      );
    }

    return true; // Default to valid if no specific validation rules apply
  }

  async executeStorageWorker(worker, trigger, eventData) {
    const { storageType, storageKey, format } = worker.config;
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;

    // Get existing data
    let existingData = [];
    try {
      const stored = storage.getItem(storageKey);
      if (stored) {
        existingData = JSON.parse(stored);
      }
    } catch (e) {
      existingData = [];
    }

    // Prepare new entry
    const entry = {
      timestamp: new Date().toISOString(),
      trigger,
      eventData,
      workerId: worker.id,
      workerName: worker.name
    };

    // Format data based on worker config
    let formattedData;
    if (format === 'csv') {
      formattedData = this.formatAsCSV(entry);
    } else if (format === 'raw') {
      formattedData = JSON.stringify(eventData);
    } else {
      formattedData = entry;
    }

    // Store data
    if (Array.isArray(existingData)) {
      existingData.push(formattedData);
    } else {
      existingData = [formattedData];
    }

    storage.setItem(storageKey, JSON.stringify(existingData));
  }

  processPayloadTemplate(template, trigger, eventData) {
    let processed = JSON.stringify(template);
    
    // Replace template variables
    processed = processed.replace(/\{\{eventType\}\}/g, trigger);
    processed = processed.replace(/\{\{eventData\}\}/g, JSON.stringify(eventData));
    processed = processed.replace(/\{\{timestamp\}\}/g, new Date().toISOString());
    processed = processed.replace(/\{\{tableId\}\}/g, this.tableId);
    processed = processed.replace(/\{\{collectionName\}\}/g, this.options.collectionName || '');

    return JSON.parse(processed);
  }

  formatAsCSV(entry) {
    const { timestamp, trigger, eventData, workerId, workerName } = entry;
    return `${timestamp},${trigger},${JSON.stringify(eventData).replace(/,/g, ';')},${workerId},${workerName}`;
  }

  // ------------------------------ Console System ------------------------------
  initConsole() {
    // Create console container
    const consoleContainer = document.createElement('div');
    consoleContainer.className = 'fixed bottom-0 left-0 right-0 h-80 bg-gray-900/80 backdrop-blur-md border-t border-gray-700/50 z-50';
    consoleContainer.style.backdropFilter = 'blur(12px)';
    consoleContainer.setAttribute('id', 'table-console');

    // Console header with tabs
    const consoleHeader = document.createElement('div');
    consoleHeader.className = 'flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700/50';

    // Tab navigation
    const tabNav = document.createElement('div');
    tabNav.className = 'flex items-center space-x-1';

    const runnerTab = this.createConsoleTab('runner', '🏃 Runner', this.activeConsoleTab === 'runner');
    const controllerTab = this.createConsoleTab('controller', '🎯 Controller', this.activeConsoleTab === 'controller');

    tabNav.appendChild(runnerTab);
    tabNav.appendChild(controllerTab);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'text-gray-400 hover:text-green-400 transition-colors';
    toggleBtn.innerHTML = '▼';
    toggleBtn.addEventListener('click', () => {
      this.toggleConsole();
    });

    consoleHeader.appendChild(tabNav);
    consoleHeader.appendChild(toggleBtn);

    // Console content container
    const consoleContent = document.createElement('div');
    consoleContent.className = 'h-full';
    consoleContent.setAttribute('id', 'console-content');

    // Runner view (3-panel split view)
    const runnerView = document.createElement('div');
    runnerView.className = 'flex h-full';
    runnerView.setAttribute('data-console-view', 'runner');
    runnerView.style.display = this.activeConsoleTab === 'runner' ? 'flex' : 'none';

    const delegaterPanel = this.createDelegaterPanel();
    const actionsPanel = this.createActionsPanel();
    const responsesPanel = this.createResponsesPanel();

    runnerView.appendChild(delegaterPanel);
    runnerView.appendChild(actionsPanel);
    runnerView.appendChild(responsesPanel);

    // Controller view (table comparison)
    const controllerView = this.createControllerView();
    controllerView.setAttribute('data-console-view', 'controller');
    controllerView.style.display = this.activeConsoleTab === 'controller' ? 'block' : 'none';

    consoleContent.appendChild(runnerView);
    consoleContent.appendChild(controllerView);

    consoleContainer.appendChild(consoleHeader);
    consoleContainer.appendChild(consoleContent);

    // Add to page
    document.body.appendChild(consoleContainer);
    
    this.console = consoleContainer;

    // Setup console event listeners
    this.setupConsoleListeners();
  }

  createDelegaterPanel() {
    const panel = document.createElement('div');
    panel.className = 'flex-1 border-r border-gray-700/50 overflow-hidden';

    const header = document.createElement('div');
    header.className = 'px-3 py-2 bg-gray-800/30 border-b border-gray-700/50';
    
    const title = document.createElement('h4');
    title.className = 'text-xs font-medium text-green-400 uppercase tracking-wide';
    title.textContent = '🌳 Delegater';

    const content = document.createElement('div');
    content.className = 'p-3 h-full overflow-y-auto font-mono text-xs text-green-300';
    content.setAttribute('id', 'delegater-content');
    content.innerHTML = `
      <div class="text-gray-500">├── Waiting for events...</div>
    `;

    header.appendChild(title);
    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  createActionsPanel() {
    const panel = document.createElement('div');
    panel.className = 'flex-1 border-r border-gray-700/50 overflow-hidden';

    const header = document.createElement('div');
    header.className = 'px-3 py-2 bg-gray-800/30 border-b border-gray-700/50';
    
    const title = document.createElement('h4');
    title.className = 'text-xs font-medium text-green-400 uppercase tracking-wide';
    title.textContent = '⚙️ Actions';

    const content = document.createElement('div');
    content.className = 'p-3 h-full overflow-y-auto font-mono text-xs text-green-300';
    content.setAttribute('id', 'actions-content');
    content.innerHTML = `
      <div class="text-gray-500">└── Ready for API preparation...</div>
    `;

    header.appendChild(title);
    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  createResponsesPanel() {
    const panel = document.createElement('div');
    panel.className = 'flex-1 overflow-hidden';

    const header = document.createElement('div');
    header.className = 'px-3 py-2 bg-gray-800/30 border-b border-gray-700/50';
    
    const title = document.createElement('h4');
    title.className = 'text-xs font-medium text-green-400 uppercase tracking-wide';
    title.textContent = '📡 Responses';

    const content = document.createElement('div');
    content.className = 'p-3 h-full overflow-y-auto font-mono text-xs text-green-300';
    content.setAttribute('id', 'responses-content');
    content.innerHTML = `
      <div class="text-gray-500">└── Awaiting responses...</div>
    `;

    header.appendChild(title);
    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  createConsoleTab(tabId, label, isActive) {
    const tab = document.createElement('button');
    tab.className = `px-3 py-1 text-sm font-medium rounded transition-colors ${
      isActive 
        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
        : 'text-gray-400 hover:text-green-400 hover:bg-green-500/10'
    }`;
    tab.textContent = label;
    tab.setAttribute('data-console-tab', tabId);
    
    tab.addEventListener('click', () => {
      this.switchConsoleTab(tabId);
    });
    
    return tab;
  }

  switchConsoleTab(tabId) {
    if (this.activeConsoleTab === tabId) return;
    
    this.activeConsoleTab = tabId;
    
    // Update tab buttons
    const tabButtons = this.console.querySelectorAll('[data-console-tab]');
    tabButtons.forEach(button => {
      const buttonTabId = button.getAttribute('data-console-tab');
      if (buttonTabId === tabId) {
        button.className = 'px-3 py-1 text-sm font-medium rounded transition-colors bg-green-500/20 text-green-400 border border-green-500/30';
      } else {
        button.className = 'px-3 py-1 text-sm font-medium rounded transition-colors text-gray-400 hover:text-green-400 hover:bg-green-500/10';
      }
    });

    // Update content views
    const views = this.console.querySelectorAll('[data-console-view]');
    views.forEach(view => {
      const viewId = view.getAttribute('data-console-view');
      view.style.display = viewId === tabId ? (viewId === 'runner' ? 'flex' : 'block') : 'none';
    });

    // If switching to controller tab, trigger controller requests for active workers
    if (tabId === 'controller') {
      this.triggerControllerRequests();
    }
  }

  createControllerView() {
    const container = document.createElement('div');
    container.className = 'h-full p-4 overflow-y-auto';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-4';

    const title = document.createElement('h3');
    title.className = 'text-lg font-medium text-green-400';
    title.textContent = 'Controller Data Comparison';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-sm hover:bg-green-500/30 transition-colors';
    refreshBtn.textContent = '🔄 Refresh';
    refreshBtn.addEventListener('click', () => {
      this.triggerControllerRequests();
    });

    header.appendChild(title);
    header.appendChild(refreshBtn);

    // Status indicator
    const statusDiv = document.createElement('div');
    statusDiv.className = 'mb-4 p-3 bg-gray-800/50 rounded border border-gray-700/50';
    statusDiv.setAttribute('id', 'controller-status');
    statusDiv.innerHTML = `
      <div class="text-gray-400 text-sm">
        <span class="text-yellow-400">●</span> Waiting for controller requests...
      </div>
    `;

    // Comparison container
    const comparisonContainer = document.createElement('div');
    comparisonContainer.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4';

    // Local table data
    const localDataSection = this.createDataSection('Local Table Data', 'local-data-table');
    
    // Controller API data
    const controllerDataSection = this.createDataSection('Controller API Data', 'controller-data-table');

    comparisonContainer.appendChild(localDataSection);
    comparisonContainer.appendChild(controllerDataSection);

    // Validation results
    const validationSection = document.createElement('div');
    validationSection.className = 'mt-4 p-3 bg-gray-800/50 rounded border border-gray-700/50';
    validationSection.setAttribute('id', 'validation-results');
    validationSection.innerHTML = `
      <h4 class="text-sm font-medium text-green-400 mb-2">Validation Results</h4>
      <div class="text-gray-400 text-sm">No validation performed yet</div>
    `;

    container.appendChild(header);
    container.appendChild(statusDiv);
    container.appendChild(comparisonContainer);
    container.appendChild(validationSection);

    return container;
  }

  createDataSection(title, tableId) {
    const section = document.createElement('div');
    section.className = 'bg-gray-800/30 rounded border border-gray-700/50 overflow-hidden';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'px-3 py-2 bg-gray-800/50 border-b border-gray-700/50';
    
    const sectionTitle = document.createElement('h4');
    sectionTitle.className = 'text-sm font-medium text-green-400';
    sectionTitle.textContent = title;

    sectionHeader.appendChild(sectionTitle);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'p-3 max-h-64 overflow-auto';
    
    const table = document.createElement('table');
    table.className = 'w-full text-xs text-green-300 font-mono';
    table.setAttribute('id', tableId);
    table.innerHTML = `
      <thead>
        <tr class="border-b border-gray-700/50">
          <th class="text-left py-1 px-2 text-gray-400">No data</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="py-1 px-2 text-gray-500">Waiting for data...</td>
        </tr>
      </tbody>
    `;

    tableContainer.appendChild(table);
    section.appendChild(sectionHeader);
    section.appendChild(tableContainer);

    return section;
  }

  async triggerControllerRequests() {
    const statusDiv = document.getElementById('controller-status');
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="text-gray-400 text-sm">
          <span class="text-blue-400">●</span> Triggering controller requests...
        </div>
      `;
    }

    // Get active API workers with controller configuration
    const apiWorkers = this.workers.filter(w => 
      w.enabled && 
      w.type === 'api' && 
      w.config.controller?.url && 
      w.config.controller?.validation?.enabled
    );

    if (apiWorkers.length === 0) {
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="text-gray-400 text-sm">
            <span class="text-red-400">●</span> No active API workers with controller configuration found
          </div>
        `;
      }
      return;
    }

    // Update local table data
    this.updateLocalTableData();

    // Execute controller requests for each worker
    let successCount = 0;
    let totalRequests = apiWorkers.length;

    for (const worker of apiWorkers) {
      try {
        const controllerResult = await this.executeController(
          worker.config.controller,
          'manual_trigger',
          { tableData: this.data },
          null
        );
        
        this.updateControllerTableData(controllerResult);
        this.performDataComparison();
        successCount++;

      } catch (error) {
        console.error('Controller request failed:', error);
      }
    }

    // Update status
    if (statusDiv) {
      const statusColor = successCount === totalRequests ? 'text-green-400' : 
                         successCount > 0 ? 'text-yellow-400' : 'text-red-400';
      statusDiv.innerHTML = `
        <div class="text-gray-400 text-sm">
          <span class="${statusColor}">●</span> Controller requests completed: ${successCount}/${totalRequests}
        </div>
      `;
    }
  }

  updateLocalTableData() {
    const localTable = document.getElementById('local-data-table');
    if (!localTable || this.data.length === 0) return;

    const headers = this.headers;
    const headerRow = headers.map(h => `<th class="text-left py-1 px-2 text-gray-400">${h}</th>`).join('');
    
    const dataRows = this.data.map(row => {
      const cells = headers.map(header => {
        const value = row[header] || '';
        return `<td class="py-1 px-2 text-green-300">${value}</td>`;
      }).join('');
      return `<tr class="border-b border-gray-700/30">${cells}</tr>`;
    }).join('');

    localTable.innerHTML = `
      <thead>
        <tr class="border-b border-gray-700/50">${headerRow}</tr>
      </thead>
      <tbody>${dataRows}</tbody>
    `;
  }

  updateControllerTableData(controllerData) {
    const controllerTable = document.getElementById('controller-data-table');
    if (!controllerTable) return;

    // Handle different response formats
    let dataArray = [];
    if (Array.isArray(controllerData)) {
      dataArray = controllerData;
    } else if (controllerData.data && Array.isArray(controllerData.data)) {
      dataArray = controllerData.data;
    } else if (controllerData.rows && Array.isArray(controllerData.rows)) {
      dataArray = controllerData.rows;
    } else {
      dataArray = [controllerData];
    }

    if (dataArray.length === 0) {
      controllerTable.innerHTML = `
        <thead>
          <tr class="border-b border-gray-700/50">
            <th class="text-left py-1 px-2 text-gray-400">No data</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="py-1 px-2 text-gray-500">No data returned from controller</td>
          </tr>
        </tbody>
      `;
      return;
    }

    // Extract headers from controller data
    const controllerHeaders = Object.keys(dataArray[0]);
    const headerRow = controllerHeaders.map(h => `<th class="text-left py-1 px-2 text-gray-400">${h}</th>`).join('');
    
    const dataRows = dataArray.map(row => {
      const cells = controllerHeaders.map(header => {
        const value = row[header] || '';
        return `<td class="py-1 px-2 text-green-300">${value}</td>`;
      }).join('');
      return `<tr class="border-b border-gray-700/30">${cells}</tr>`;
    }).join('');

    controllerTable.innerHTML = `
      <thead>
        <tr class="border-b border-gray-700/50">${headerRow}</tr>
      </thead>
      <tbody>${dataRows}</tbody>
    `;

    // Store controller data for comparison
    this.controllerData = dataArray;
  }

  performDataComparison() {
    const validationDiv = document.getElementById('validation-results');
    if (!validationDiv) return;

    const localData = this.data;
    const controllerData = this.controllerData;

    if (!controllerData || controllerData.length === 0) {
      validationDiv.innerHTML = `
        <h4 class="text-sm font-medium text-green-400 mb-2">Validation Results</h4>
        <div class="text-red-400 text-sm">❌ No controller data to compare</div>
      `;
      return;
    }

    // Compare data counts
    const localCount = localData.length;
    const controllerCount = controllerData.length;
    const countMatch = localCount === controllerCount;

    // Compare field matches (simplified comparison)
    let fieldMatches = 0;
    let totalFields = 0;

    localData.forEach((localRow, index) => {
      if (index < controllerData.length) {
        const controllerRow = controllerData[index];
        Object.keys(localRow).forEach(key => {
          totalFields++;
          if (localRow[key] === controllerRow[key]) {
            fieldMatches++;
          }
        });
      }
    });

    const matchPercentage = totalFields > 0 ? Math.round((fieldMatches / totalFields) * 100) : 0;
    const isValid = countMatch && matchPercentage >= 90;

    validationDiv.innerHTML = `
      <h4 class="text-sm font-medium text-green-400 mb-2">Validation Results</h4>
      <div class="space-y-2 text-sm">
        <div class="${countMatch ? 'text-green-400' : 'text-red-400'}">
          ${countMatch ? '✅' : '❌'} Row count: Local ${localCount} vs Controller ${controllerCount}
        </div>
        <div class="${matchPercentage >= 90 ? 'text-green-400' : 'text-yellow-400'}">
          ${matchPercentage >= 90 ? '✅' : '⚠️'} Field match: ${matchPercentage}% (${fieldMatches}/${totalFields})
        </div>
        <div class="${isValid ? 'text-green-400' : 'text-red-400'} font-medium">
          ${isValid ? '✅ Data validation PASSED' : '❌ Data validation FAILED'}
        </div>
      </div>
    `;
  }

  toggleConsole() {
    if (!this.console) return;
    
    const content = this.console.querySelector('#console-content');
    const toggleBtn = this.console.querySelector('button');
    
    if (content.style.display === 'none') {
      content.style.display = 'flex';
      toggleBtn.innerHTML = '▼';
      this.console.style.height = '320px';
    } else {
      content.style.display = 'none';
      toggleBtn.innerHTML = '▲';
      this.console.style.height = '40px';
    }
  }

  setupConsoleListeners() {
    // Listen to all table events and log to console
    const originalEmit = this.emit.bind(this);
    this.emit = (eventType, data) => {
      // Call original emit
      originalEmit(eventType, data);
      
      // Log to console
      this.logToConsole(eventType, data);
    };
  }

  logToConsole(eventType, data) {
    const timestamp = new Date().toLocaleTimeString();
    
    // Log delegation
    this.logDelegation(eventType, data, timestamp);
    
    // If there are active workers for this event, log actions
    const relevantWorkers = this.workers.filter(w => 
      w.enabled && w.triggers.includes(eventType)
    );
    
    if (relevantWorkers.length > 0) {
      relevantWorkers.forEach(worker => {
        this.logAction(worker, eventType, data, timestamp);
      });
    }
  }

  logDelegation(eventType, data, timestamp) {
    const delegaterContent = document.getElementById('delegater-content');
    if (!delegaterContent) return;

    const relevantWorkers = this.workers.filter(w => 
      w.enabled && w.triggers.includes(eventType)
    );

    let logEntry = '';
    
    if (relevantWorkers.length === 0) {
      logEntry = `
        <div class="text-gray-500 mb-1">[${timestamp}]</div>
        <div class="text-yellow-400">├── ${eventType}</div>
        <div class="text-gray-500">└── No workers listening</div>
      `;
    } else {
      logEntry = `
        <div class="text-gray-500 mb-1">[${timestamp}]</div>
        <div class="text-green-400">├── ${eventType}</div>
      `;
      
      relevantWorkers.forEach((worker, index) => {
        const isLast = index === relevantWorkers.length - 1;
        const prefix = isLast ? '└──' : '├──';
        const workerType = worker.type === 'api' ? '🌐' : '💾';
        
        logEntry += `
          <div class="text-green-300 ml-4">${prefix} ${workerType} ${worker.name}</div>
        `;
        
        if (worker.type === 'api') {
          if (worker.config.handler?.url) {
            logEntry += `<div class="text-gray-400 ml-8">├── Handler: ${worker.config.handler.url}</div>`;
          }
          if (worker.config.controller?.url) {
            logEntry += `<div class="text-gray-400 ml-8">└── Controller: ${worker.config.controller.url}</div>`;
          }
        }
      });
    }

    // Add to console and scroll to bottom
    delegaterContent.innerHTML += logEntry;
    delegaterContent.scrollTop = delegaterContent.scrollHeight;

    // Keep only last 50 entries
    const entries = delegaterContent.children;
    while (entries.length > 150) { // 3 lines per entry * 50 entries
      entries[0].remove();
    }
  }

  logAction(worker, eventType, data, timestamp) {
    const actionsContent = document.getElementById('actions-content');
    if (!actionsContent) return;

    let logEntry = `
      <div class="text-gray-500 mb-1">[${timestamp}] ${worker.name}</div>
    `;

    if (worker.type === 'api') {
      const { handler, controller } = worker.config;
      
      if (handler) {
        logEntry += `
          <div class="text-blue-400">├── Preparing Handler Request</div>
          <div class="text-gray-400 ml-4">├── URL: ${handler.url}</div>
          <div class="text-gray-400 ml-4">├── Method: ${handler.method}</div>
        `;
        
        if (handler.payload) {
          const processedPayload = this.processPayloadTemplate(handler.payload, eventType, data);
          logEntry += `
            <div class="text-gray-400 ml-4">└── Payload: ${JSON.stringify(processedPayload).substring(0, 100)}...</div>
          `;
        }
      }
      
      if (controller && controller.validation?.enabled) {
        logEntry += `
          <div class="text-green-400">└── Controller Validation Enabled</div>
          <div class="text-gray-400 ml-4">└── URL: ${controller.url}</div>
        `;
      }
    } else {
      logEntry += `
        <div class="text-purple-400">├── Storage Operation</div>
        <div class="text-gray-400 ml-4">├── Type: ${worker.config.storageType}</div>
        <div class="text-gray-400 ml-4">└── Key: ${worker.config.storageKey}</div>
      `;
    }

    actionsContent.innerHTML += logEntry;
    actionsContent.scrollTop = actionsContent.scrollHeight;

    // Keep only last 30 entries
    const entries = actionsContent.children;
    while (entries.length > 90) { // ~3 lines per entry * 30 entries
      entries[0].remove();
    }
  }

  logResponse(worker, success, response, error = null) {
    const responsesContent = document.getElementById('responses-content');
    if (!responsesContent) return;

    const timestamp = new Date().toLocaleTimeString();
    const statusIcon = success ? '✅' : '❌';
    const statusColor = success ? 'text-green-400' : 'text-red-400';

    let logEntry = `
      <div class="text-gray-500 mb-1">[${timestamp}] ${worker.name}</div>
      <div class="${statusColor}">├── ${statusIcon} ${success ? 'Success' : 'Failed'}</div>
    `;

    if (success && response) {
      if (response.handler) {
        logEntry += `
          <div class="text-blue-400 ml-4">├── Handler Response</div>
          <div class="text-gray-400 ml-8">└── ${JSON.stringify(response.handler).substring(0, 80)}...</div>
        `;
      }
      
      if (response.controller) {
        logEntry += `
          <div class="text-green-400 ml-4">├── Controller Response</div>
          <div class="text-gray-400 ml-8">└── Validated: ${response.validated ? 'Yes' : 'No'}</div>
        `;
      }
      
      if (typeof response === 'string' || (typeof response === 'object' && !response.handler)) {
        logEntry += `
          <div class="text-gray-400 ml-4">└── ${JSON.stringify(response).substring(0, 100)}...</div>
        `;
      }
    } else if (error) {
      logEntry += `
        <div class="text-red-400 ml-4">└── Error: ${error.message || error}</div>
      `;
    }

    responsesContent.innerHTML += logEntry;
    responsesContent.scrollTop = responsesContent.scrollHeight;

    // Keep only last 30 entries
    const entries = responsesContent.children;
    while (entries.length > 90) {
      entries[0].remove();
    }
  }

  // ------------------------------ Task Management ------------------------------
  addTask(type, description, details = null, status = 'pending') {
    const task = {
      id: this.generateTaskId(),
      type,
      description,
      details,
      status,
      timestamp: new Date(),
      rowId: null,
      rowIndex: null
    };

    this.taskHistory.push(task);
    
    // If tasks tab is active, re-render it
    if (this.activeTab === 'tasks') {
      this.renderTabContent();
    }

    this.emit('taskAdded', {
      task,
      totalTasks: this.taskHistory.length,
      table: this
    });

    return task;
  }

  updateTaskStatus(taskId, newStatus) {
    const task = this.taskHistory.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      task.updatedAt = new Date();
      
      // Re-render tasks view if active
      if (this.activeTab === 'tasks') {
        this.renderTabContent();
      }

      this.emit('taskStatusChanged', {
        task,
        previousStatus: task.status,
        newStatus,
        table: this
      });
    }
  }

  generateTaskId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getTaskTypeLabel(type) {
    const labels = {
      'cell_change': 'Celle endret',
      'row_added': 'Rad lagt til',
      'row_deleted': 'Rad slettet',
      'row_sheet_opened': 'Rad åpnet',
      'auto_save': 'Auto-lagret',
      'selection_changed': 'Valg endret',
      'table_render': 'Tabell rendret',
      'data_import': 'Data importert'
    };
    return labels[type] || type;
  }

  formatTimestamp(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Nå';
    if (minutes < 60) return `${minutes}m siden`;
    if (hours < 24) return `${hours}t siden`;
    return `${days}d siden`;
  }

  showTaskDetails(task) {
    // Create a simple modal or alert with task details
    const details = [
      `Type: ${this.getTaskTypeLabel(task.type)}`,
      `Status: ${task.status}`,
      `Beskrivelse: ${task.description}`,
      `Tidspunkt: ${task.timestamp.toLocaleString()}`,
      task.details ? `Detaljer: ${task.details}` : null
    ].filter(Boolean).join('\n');

    alert(details);
  }

  createWorkersView() {
    const container = document.createElement('div');
    container.className = 'workers-view bg-white rounded-lg shadow-sm border p-6';

    // Workers header
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-6';

    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-gray-800';
    title.textContent = 'Worker Management';

    const addWorkerBtn = document.createElement('button');
    addWorkerBtn.className = 'px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium';
    addWorkerBtn.innerHTML = '➕ Ny Worker';
    addWorkerBtn.addEventListener('click', () => {
      this.showWorkerForm();
    });

    header.appendChild(title);
    header.appendChild(addWorkerBtn);

    // Workers content area
    const contentArea = document.createElement('div');
    contentArea.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6';

    // Workers list
    const workersList = this.createWorkersList();
    
    // Worker form/settings
    const workerSettings = this.createWorkerSettings();

    contentArea.appendChild(workersList);
    contentArea.appendChild(workerSettings);

    container.appendChild(header);
    container.appendChild(contentArea);

    return container;
  }

  createWorkersList() {
    const container = document.createElement('div');
    container.className = 'workers-list';

    const listHeader = document.createElement('h4');
    listHeader.className = 'text-md font-medium text-gray-700 mb-4';
    listHeader.textContent = `Aktive Workers (${this.workers.length})`;

    const listContainer = document.createElement('div');
    listContainer.className = 'space-y-3 max-h-96 overflow-y-auto';

    if (this.workers.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'text-center py-8 text-gray-500 text-sm';
      emptyState.innerHTML = `
        <div class="mb-2">🔧</div>
        <div>Ingen workers konfigurert</div>
        <div class="text-xs mt-1">Klikk "Ny Worker" for å legge til</div>
      `;
      listContainer.appendChild(emptyState);
    } else {
      this.workers.forEach(worker => {
        const workerCard = this.createWorkerCard(worker);
        listContainer.appendChild(workerCard);
      });
    }

    container.appendChild(listHeader);
    container.appendChild(listContainer);

    return container;
  }

  createWorkerCard(worker) {
    const card = document.createElement('div');
    card.className = 'worker-card bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow';

    // Worker header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'flex items-start justify-between mb-3';

    const workerInfo = document.createElement('div');
    workerInfo.className = 'flex-1';

    const workerName = document.createElement('h5');
    workerName.className = 'font-medium text-gray-800 text-sm';
    workerName.textContent = worker.name;

    const workerType = document.createElement('span');
    workerType.className = `inline-block px-2 py-1 text-xs rounded-full ${
      worker.type === 'api' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
    }`;
    workerType.textContent = worker.type.toUpperCase();

    const workerStatus = document.createElement('div');
    workerStatus.className = 'flex items-center mt-1';

    const statusDot = document.createElement('div');
    statusDot.className = `w-2 h-2 rounded-full mr-2 ${
      worker.enabled ? 'bg-green-400' : 'bg-gray-400'
    }`;

    const statusText = document.createElement('span');
    statusText.className = 'text-xs text-gray-600';
    statusText.textContent = worker.enabled ? 'Aktiv' : 'Inaktiv';

    workerStatus.appendChild(statusDot);
    workerStatus.appendChild(statusText);

    workerInfo.appendChild(workerName);
    workerInfo.appendChild(workerType);
    workerInfo.appendChild(workerStatus);

    // Worker actions
    const actions = document.createElement('div');
    actions.className = 'flex space-x-2';

    const editBtn = document.createElement('button');
    editBtn.className = 'text-blue-600 hover:text-blue-800 text-xs';
    editBtn.textContent = 'Rediger';
    editBtn.addEventListener('click', () => {
      this.editWorker(worker.id);
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.className = `text-xs ${worker.enabled ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`;
    toggleBtn.textContent = worker.enabled ? 'Deaktiver' : 'Aktiver';
    toggleBtn.addEventListener('click', () => {
      this.toggleWorker(worker.id);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-red-600 hover:text-red-800 text-xs';
    deleteBtn.textContent = 'Slett';
    deleteBtn.addEventListener('click', () => {
      this.deleteWorker(worker.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(deleteBtn);

    cardHeader.appendChild(workerInfo);
    cardHeader.appendChild(actions);

    // Worker details
    const details = document.createElement('div');
    details.className = 'text-xs text-gray-600 space-y-1';

    const triggers = document.createElement('div');
    triggers.textContent = `Triggers: ${worker.triggers.join(', ')}`;

    const endpoint = document.createElement('div');
    if (worker.type === 'api') {
      const handlerUrl = worker.config.handler?.url || 'Not configured';
      const controllerUrl = worker.config.controller?.url || 'Not configured';
      endpoint.innerHTML = `Handler: ${handlerUrl}<br>Controller: ${controllerUrl}`;
    } else {
      endpoint.textContent = `Storage: ${worker.config.storageType}`;
    }

    details.appendChild(triggers);
    details.appendChild(endpoint);

    card.appendChild(cardHeader);
    card.appendChild(details);

    return card;
  }

  createWorkerSettings() {
    const container = document.createElement('div');
    container.className = 'worker-settings';

    const settingsHeader = document.createElement('h4');
    settingsHeader.className = 'text-md font-medium text-gray-700 mb-4';
    settingsHeader.textContent = 'Worker Konfiguration';

    const formContainer = document.createElement('div');
    formContainer.className = 'worker-form-container bg-gray-50 rounded-lg p-4';
    formContainer.setAttribute('id', 'worker-form-container');

    // Default empty state
    const emptyState = document.createElement('div');
    emptyState.className = 'text-center py-8 text-gray-500 text-sm';
    emptyState.innerHTML = `
      <div class="mb-2">⚙️</div>
      <div>Velg en worker for å redigere</div>
      <div class="text-xs mt-1">eller opprett en ny worker</div>
    `;
    formContainer.appendChild(emptyState);

    container.appendChild(settingsHeader);
    container.appendChild(formContainer);

    return container;
  }

  showWorkerForm(worker = null) {
    const formContainer = document.getElementById('worker-form-container');
    if (!formContainer) return;

    formContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'space-y-4';
    form.setAttribute('data-worker-form', 'true');

    // Worker name
    const nameField = this.createFormField('text', 'name', 'Worker Navn', worker?.name || '', 'Skriv worker navn...');
    
    // Worker type
    const typeField = document.createElement('div');
    typeField.className = 'space-y-2';
    
    const typeLabel = document.createElement('label');
    typeLabel.className = 'block text-sm font-medium text-gray-700';
    typeLabel.textContent = 'Worker Type';
    
    const typeSelect = document.createElement('select');
    typeSelect.name = 'type';
    typeSelect.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
    typeSelect.innerHTML = `
      <option value="api">API Worker</option>
      <option value="storage">Storage Worker</option>
    `;
    typeSelect.value = worker?.type || 'api';
    
    typeField.appendChild(typeLabel);
    typeField.appendChild(typeSelect);

    // Triggers
    const triggersField = document.createElement('div');
    triggersField.className = 'space-y-2';
    
    const triggersLabel = document.createElement('label');
    triggersLabel.className = 'block text-sm font-medium text-gray-700';
    triggersLabel.textContent = 'Event Triggers';
    
    const triggerOptions = [
      'cellChange', 'rowAdded', 'rowDeleted', 'rowSheetOpened', 
      'autoSave', 'selectionChanged', 'tableRender'
    ];
    
    const triggersContainer = document.createElement('div');
    triggersContainer.className = 'grid grid-cols-2 gap-2';
    
    triggerOptions.forEach(trigger => {
      const checkboxContainer = document.createElement('div');
      checkboxContainer.className = 'flex items-center';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'triggers';
      checkbox.value = trigger;
      checkbox.id = `trigger-${trigger}`;
      checkbox.className = 'mr-2';
      checkbox.checked = worker?.triggers?.includes(trigger) || true;
      
      const label = document.createElement('label');
      label.htmlFor = `trigger-${trigger}`;
      label.className = 'text-sm text-gray-700 cursor-pointer';
      label.textContent = trigger;
      
      checkboxContainer.appendChild(checkbox);
      checkboxContainer.appendChild(label);
      triggersContainer.appendChild(checkboxContainer);
    });
    
    triggersField.appendChild(triggersLabel);
    triggersField.appendChild(triggersContainer);

    // Configuration section (dynamic based on type)
    const configSection = document.createElement('div');
    configSection.className = 'config-section space-y-4 border-t pt-4';
    configSection.setAttribute('id', 'config-section');

    // Form actions
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'flex justify-end space-x-3 pt-4 border-t';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50';
    cancelBtn.textContent = 'Avbryt';
    cancelBtn.addEventListener('click', () => {
      this.hideWorkerForm();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600';
    saveBtn.textContent = worker ? 'Oppdater Worker' : 'Opprett Worker';

    actionsContainer.appendChild(cancelBtn);
    actionsContainer.appendChild(saveBtn);

    // Assemble form
    form.appendChild(nameField);
    form.appendChild(typeField);
    form.appendChild(triggersField);
    form.appendChild(configSection);
    form.appendChild(actionsContainer);

    // Setup dynamic config section
    this.updateConfigSection(typeSelect.value, worker);
    
    typeSelect.addEventListener('change', (e) => {
      this.updateConfigSection(e.target.value, worker);
    });

    formContainer.appendChild(form);

    // Trigger initial config section update after form is in DOM
    setTimeout(() => {
      this.updateConfigSection(typeSelect.value, worker);
    }, 0);

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveWorker(form, worker);
    });
  }

  createFormField(type, name, label, value = '', placeholder = '') {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'space-y-2';

    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'block text-sm font-medium text-gray-700';
    fieldLabel.textContent = label;
    fieldLabel.htmlFor = name;

    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.id = name;
    input.value = value;
    input.placeholder = placeholder;
    input.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

    fieldContainer.appendChild(fieldLabel);
    fieldContainer.appendChild(input);

    return fieldContainer;
  }

  updateConfigSection(type, worker = null) {
    const configSection = document.getElementById('config-section');
    if (!configSection) return;

    configSection.innerHTML = '';

    const configTitle = document.createElement('h5');
    configTitle.className = 'text-sm font-medium text-gray-700 mb-3';
    configTitle.textContent = `${type.toUpperCase()} Konfiguration`;

    configSection.appendChild(configTitle);

    if (type === 'api') {
      // API Configuration with tabs
      const apiTabsContainer = this.createAPITabs(worker);
      configSection.appendChild(apiTabsContainer);
    } else {
      // Storage Configuration
      const storageTypeField = this.createSelectField('storageType', 'Storage Type', ['localStorage', 'sessionStorage'], worker?.config?.storageType || 'localStorage');
      const keyField = this.createFormField('text', 'storageKey', 'Storage Key', worker?.config?.storageKey || '', 'table_events');
      const formatField = this.createSelectField('format', 'Data Format', ['json', 'csv', 'raw'], worker?.config?.format || 'json');

      configSection.appendChild(storageTypeField);
      configSection.appendChild(keyField);
      configSection.appendChild(formatField);
    }
  }

  createSelectField(name, label, options, value = '') {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'space-y-2';

    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'block text-sm font-medium text-gray-700';
    fieldLabel.textContent = label;
    fieldLabel.htmlFor = name;

    const select = document.createElement('select');
    select.name = name;
    select.id = name;
    select.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option;
      optionElement.textContent = option;
      optionElement.selected = option === value;
      select.appendChild(optionElement);
    });

    fieldContainer.appendChild(fieldLabel);
    fieldContainer.appendChild(select);

    return fieldContainer;
  }

  createTextareaField(name, label, value = '') {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'space-y-2';

    const fieldLabel = document.createElement('label');
    fieldLabel.className = 'block text-sm font-medium text-gray-700';
    fieldLabel.textContent = label;
    fieldLabel.htmlFor = name;

    const textarea = document.createElement('textarea');
    textarea.name = name;
    textarea.id = name;
    textarea.value = value;
    textarea.rows = 4;
    textarea.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm';

    fieldContainer.appendChild(fieldLabel);
    fieldContainer.appendChild(textarea);

    return fieldContainer;
  }

  createAPITabs(worker = null) {
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'api-tabs-container';

    // Tab navigation
    const tabNav = document.createElement('div');
    tabNav.className = 'flex border-b border-gray-200 mb-4';

    const handlerTab = document.createElement('button');
    handlerTab.type = 'button';
    handlerTab.className = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600';
    handlerTab.textContent = 'Handler (CRUD)';
    handlerTab.setAttribute('data-api-tab', 'handler');

    const controllerTab = document.createElement('button');
    controllerTab.type = 'button';
    controllerTab.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    controllerTab.textContent = 'Controller (Fetch)';
    controllerTab.setAttribute('data-api-tab', 'controller');

    tabNav.appendChild(handlerTab);
    tabNav.appendChild(controllerTab);

    // Tab content container
    const tabContent = document.createElement('div');
    tabContent.className = 'api-tab-content';

    // Handler tab content
    const handlerContent = this.createHandlerTabContent(worker);
    handlerContent.setAttribute('data-api-content', 'handler');
    handlerContent.style.display = 'block';

    // Controller tab content
    const controllerContent = this.createControllerTabContent(worker);
    controllerContent.setAttribute('data-api-content', 'controller');
    controllerContent.style.display = 'none';

    tabContent.appendChild(handlerContent);
    tabContent.appendChild(controllerContent);

    // Tab switching logic
    const switchTab = (activeTab) => {
      // Update tab buttons
      tabNav.querySelectorAll('[data-api-tab]').forEach(tab => {
        if (tab.getAttribute('data-api-tab') === activeTab) {
          tab.className = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600';
        } else {
          tab.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        }
      });

      // Update tab content
      tabContent.querySelectorAll('[data-api-content]').forEach(content => {
        content.style.display = content.getAttribute('data-api-content') === activeTab ? 'block' : 'none';
      });
    };

    handlerTab.addEventListener('click', () => switchTab('handler'));
    controllerTab.addEventListener('click', () => switchTab('controller'));

    tabsContainer.appendChild(tabNav);
    tabsContainer.appendChild(tabContent);

    return tabsContainer;
  }

  createHandlerTabContent(worker = null) {
    const container = document.createElement('div');
    container.className = 'handler-content space-y-4';

    // Handler description
    const description = document.createElement('div');
    description.className = 'text-sm text-gray-600 bg-blue-50 p-3 rounded-md';
    description.innerHTML = `
      <strong>Handler:</strong> Håndterer CRUD operasjoner (Create, Read, Update, Delete) ved å sende data til API endpoint.
    `;

    // Handler configuration
    const urlField = this.createFormField('url', 'handler_url', 'Handler URL', worker?.config?.handler?.url || '', 'https://api.example.com/data');
    const methodField = this.createSelectField('handler_method', 'HTTP Method', ['POST', 'PUT', 'PATCH', 'DELETE'], worker?.config?.handler?.method || 'POST');
    const headersField = this.createTextareaField('handler_headers', 'Headers (JSON)', worker?.config?.handler?.headers ? JSON.stringify(worker.config.handler.headers, null, 2) : '{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer YOUR_TOKEN"\n}');
    const payloadField = this.createTextareaField('handler_payload', 'Payload Template (JSON)', worker?.config?.handler?.payload ? JSON.stringify(worker.config.handler.payload, null, 2) : '{\n  "action": "{{eventType}}",\n  "data": "{{eventData}}",\n  "timestamp": "{{timestamp}}",\n  "table": "{{collectionName}}"\n}');

    // Authentication section
    const authSection = document.createElement('div');
    authSection.className = 'border-t pt-4';
    
    const authTitle = document.createElement('h6');
    authTitle.className = 'text-sm font-medium text-gray-700 mb-2';
    authTitle.textContent = 'Autentisering';

    const authTypeField = this.createSelectField('handler_auth_type', 'Auth Type', ['none', 'bearer', 'basic', 'api_key'], worker?.config?.handler?.auth?.type || 'none');
    const authValueField = this.createFormField('text', 'handler_auth_value', 'Auth Value', worker?.config?.handler?.auth?.value || '', 'Token eller nøkkel...');

    authSection.appendChild(authTitle);
    authSection.appendChild(authTypeField);
    authSection.appendChild(authValueField);

    container.appendChild(description);
    container.appendChild(urlField);
    container.appendChild(methodField);
    container.appendChild(headersField);
    container.appendChild(payloadField);
    container.appendChild(authSection);

    return container;
  }

  createControllerTabContent(worker = null) {
    const container = document.createElement('div');
    container.className = 'controller-content space-y-4';

    // Controller description
    const description = document.createElement('div');
    description.className = 'text-sm text-gray-600 bg-green-50 p-3 rounded-md';
    description.innerHTML = `
      <strong>Controller:</strong> Henter data fra API for å verifisere at endringer ble lagret korrekt. Sammenligner lokale data med server data.
    `;

    // Controller configuration
    const urlField = this.createFormField('url', 'controller_url', 'Controller URL', worker?.config?.controller?.url || '', 'https://api.example.com/data/verify');
    const methodField = this.createSelectField('controller_method', 'HTTP Method', ['GET', 'POST'], worker?.config?.controller?.method || 'GET');
    const headersField = this.createTextareaField('controller_headers', 'Headers (JSON)', worker?.config?.controller?.headers ? JSON.stringify(worker.config.controller.headers, null, 2) : '{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer YOUR_TOKEN"\n}');
    
    // Query parameters for GET requests
    const queryField = this.createTextareaField('controller_query', 'Query Parameters (JSON)', worker?.config?.controller?.query ? JSON.stringify(worker.config.controller.query, null, 2) : '{\n  "table": "{{collectionName}}",\n  "id": "{{rowId}}"\n}');

    // Validation settings
    const validationSection = document.createElement('div');
    validationSection.className = 'border-t pt-4';
    
    const validationTitle = document.createElement('h6');
    validationTitle.className = 'text-sm font-medium text-gray-700 mb-2';
    validationTitle.textContent = 'Validering';

    const enableValidationField = document.createElement('div');
    enableValidationField.className = 'flex items-center space-x-2';
    
    const enableValidationCheckbox = document.createElement('input');
    enableValidationCheckbox.type = 'checkbox';
    enableValidationCheckbox.name = 'controller_validation_enabled';
    enableValidationCheckbox.id = 'controller_validation_enabled';
    enableValidationCheckbox.checked = worker?.config?.controller?.validation?.enabled || true;
    
    const enableValidationLabel = document.createElement('label');
    enableValidationLabel.htmlFor = 'controller_validation_enabled';
    enableValidationLabel.className = 'text-sm text-gray-700';
    enableValidationLabel.textContent = 'Aktiver automatisk validering etter lagring';

    enableValidationField.appendChild(enableValidationCheckbox);
    enableValidationField.appendChild(enableValidationLabel);

    const retryField = this.createFormField('number', 'controller_retry_count', 'Antall forsøk', worker?.config?.controller?.retryCount || '3', '3');
    const timeoutField = this.createFormField('number', 'controller_timeout', 'Timeout (sekunder)', worker?.config?.controller?.timeout || '5', '5');

    validationSection.appendChild(validationTitle);
    validationSection.appendChild(enableValidationField);
    validationSection.appendChild(retryField);
    validationSection.appendChild(timeoutField);

    // Authentication section
    const authSection = document.createElement('div');
    authSection.className = 'border-t pt-4';
    
    const authTitle = document.createElement('h6');
    authTitle.className = 'text-sm font-medium text-gray-700 mb-2';
    authTitle.textContent = 'Autentisering';

    const authTypeField = this.createSelectField('controller_auth_type', 'Auth Type', ['none', 'bearer', 'basic', 'api_key'], worker?.config?.controller?.auth?.type || 'none');
    const authValueField = this.createFormField('text', 'controller_auth_value', 'Auth Value', worker?.config?.controller?.auth?.value || '', 'Token eller nøkkel...');

    authSection.appendChild(authTitle);
    authSection.appendChild(authTypeField);
    authSection.appendChild(authValueField);

    container.appendChild(description);
    container.appendChild(urlField);
    container.appendChild(methodField);
    container.appendChild(headersField);
    container.appendChild(queryField);
    container.appendChild(validationSection);
    container.appendChild(authSection);

    return container;
  }

  // ------------------------------ Row Sheets ------------------------------
  toggleRowSheet(rowIndex) {
    if (this.openRowSheets.has(rowIndex)) {
      this.closeRowSheet(rowIndex);
    } else {
      this.openRowSheet(rowIndex);
    }
  }

  openRowSheet(rowIndex) {
    if (this.openRowSheets.has(rowIndex)) return;

    const { id, collection } = this.getRowIdentity(rowIndex);
    const rowData = this.data[rowIndex];
    
    // Add task for row sheet opening
    this.addTask('row_sheet_opened', `Rad skjema åpnet`, `Rad ${rowIndex + 1} (ID: ${id})`, 'in_progress');
    
    this.createRowSheet(rowIndex, rowData);
    
    this.emit("rowSheetOpened", {
      rowIndex,
      id,
      collection,
      rowData,
      table: this
    });
  }

  closeRowSheet(rowIndex) {
    const sheet = this.openRowSheets.get(rowIndex);
    if (!sheet) return;

    const { id, collection } = this.getRowIdentity(rowIndex);
    
    // Animate out and remove
    sheet.overlay.style.opacity = '0';
    sheet.sheet.style.transform = sheet.direction === 'bottom' ? 'translateY(100%)' : 'translateX(100%)';
    
    setTimeout(() => {
      if (sheet.overlay.parentNode) sheet.overlay.remove();
      if (sheet.sheet.parentNode) sheet.sheet.remove();
    }, 300);
    
    this.openRowSheets.delete(rowIndex);
    
    this.emit("rowSheetClosed", {
      rowIndex,
      id,
      collection,
      table: this
    });
  }

  createRowSheet(rowIndex, rowData) {
    const { direction, mobileBreakpoint } = this.options.expandedView;
    const isMobile = window.innerWidth <= mobileBreakpoint;
    const actualDirection = isMobile ? 'bottom' : direction;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300';
    overlay.style.opacity = '0';
    
    // Create sheet
    const sheet = document.createElement('div');
    sheet.className = this.getRowSheetClasses(actualDirection);
    sheet.setAttribute('data-row-sheet', rowIndex);

    // Create sheet header
    const sheetHeader = this.createRowSheetHeader(rowIndex, rowData, actualDirection);
    
    // Create form container
    const formContainer = this.createRowFormContainer(rowIndex, rowData);
    
    sheet.appendChild(sheetHeader);
    sheet.appendChild(formContainer);

    // Add to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
    
    // Store references
    this.openRowSheets.set(rowIndex, {
      overlay,
      sheet,
      direction: actualDirection
    });

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      if (actualDirection === 'bottom') {
        sheet.style.transform = 'translateY(0)';
      } else {
        sheet.style.transform = 'translateX(0)';
      }
    });

    // Setup event listeners
    this.setupRowSheetListeners(rowIndex, overlay, sheet);
  }

  getRowSheetClasses(direction) {
    const baseClasses = 'fixed bg-white shadow-2xl z-50 transition-transform duration-300 ease-out';
    
    if (direction === 'bottom') {
      return `${baseClasses} bottom-0 left-0 right-0 h-3/4 rounded-t-xl transform translate-y-full`;
    } else {
      return `${baseClasses} top-0 right-0 bottom-0 w-96 max-w-md rounded-l-xl transform translate-x-full`;
    }
  }

  createRowSheetHeader(rowIndex, rowData, direction) {
    const { id } = this.getRowIdentity(rowIndex);
    
    const header = document.createElement('div');
    header.className = 'flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50';
    
    if (direction === 'bottom') {
      header.className += ' rounded-t-xl';
    } else {
      header.className += ' rounded-tl-xl';
    }

    // Handle/grip line
    const handle = document.createElement('div');
    handle.className = 'w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3 cursor-pointer';
    handle.addEventListener('click', () => this.closeRowSheet(rowIndex));

    // Title and close button
    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex justify-between items-center';

    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-gray-800';
    title.textContent = `Rediger rad ${rowIndex + 1}`;

    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm text-gray-600 mt-1';
    subtitle.textContent = `ID: ${id}`;

    const closeButton = document.createElement('button');
    closeButton.className = 'px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-colors';
    closeButton.innerHTML = '✕ Lukk';
    closeButton.addEventListener('click', () => this.closeRowSheet(rowIndex));

    const titleSection = document.createElement('div');
    titleSection.appendChild(title);
    titleSection.appendChild(subtitle);

    titleContainer.appendChild(titleSection);
    titleContainer.appendChild(closeButton);

    header.appendChild(handle);
    header.appendChild(titleContainer);

    return header;
  }

  createRowFormContainer(rowIndex, rowData) {
    const container = document.createElement('div');
    container.className = 'flex-1 overflow-y-auto p-4';

    // Create form
    const form = document.createElement('form');
    form.className = 'space-y-4';
    form.setAttribute('data-row-form', rowIndex);

    // Generate form fields for each property
    this.headers.forEach(key => {
      const fieldContainer = this.createFormField(key, rowData[key] || '', rowIndex);
      form.appendChild(fieldContainer);
    });

    // Auto-save status
    const statusDiv = document.createElement('div');
    statusDiv.className = 'mt-4 p-2 text-sm text-green-600 bg-green-50 rounded hidden';
    statusDiv.setAttribute('data-save-status', rowIndex);
    statusDiv.textContent = 'Endringer lagret automatisk';

    container.appendChild(form);
    container.appendChild(statusDiv);

    return container;
  }

  createFormField(key, value, rowIndex) {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'space-y-2';

    // Label
    const label = document.createElement('label');
    label.className = 'block text-sm font-medium text-gray-700 capitalize';
    label.textContent = key;
    label.htmlFor = `field-${rowIndex}-${key}`;

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `field-${rowIndex}-${key}`;
    input.name = key;
    input.value = value;
    input.className = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
    input.setAttribute('data-row', rowIndex);
    input.setAttribute('data-key', key);

    // Auto-save on input
    let saveTimeout;
    input.addEventListener('input', (e) => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        this.autoSaveRowField(rowIndex, key, e.target.value);
      }, 500); // 500ms debounce
    });

    fieldContainer.appendChild(label);
    fieldContainer.appendChild(input);

    return fieldContainer;
  }

  autoSaveRowField(rowIndex, key, value) {
    // Update the data
    if (this.data[rowIndex]) {
      this.data[rowIndex][key] = value;
    }

    // Add task for auto-save
    const { id } = this.getRowIdentity(rowIndex);
    this.addTask('auto_save', `Auto-lagret: ${key} = "${value}"`, `Rad ${rowIndex + 1} (ID: ${id})`, 'completed');

    // Show save status
    const statusDiv = document.querySelector(`[data-save-status="${rowIndex}"]`);
    if (statusDiv) {
      statusDiv.classList.remove('hidden');
      setTimeout(() => {
        statusDiv.classList.add('hidden');
      }, 2000);
    }

    // Re-render the main table to reflect changes
    this.render();

    // Emit auto-save event
    const { id: updatedId, collection } = this.getRowIdentity(rowIndex);
    this.emit("rowFieldAutoSaved", {
      rowIndex,
      id: updatedId,
      collection,
      key,
      value,
      rowData: this.data[rowIndex],
      table: this
    });
  }

  setupRowSheetListeners(rowIndex, overlay, sheet) {
    // Close on overlay click
    overlay.addEventListener('click', () => this.closeRowSheet(rowIndex));

    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.closeRowSheet(rowIndex);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Prevent sheet clicks from closing
    sheet.addEventListener('click', (e) => e.stopPropagation());
  }

  // ------------------------------ Expanded View ------------------------------
  toggleExpandedView() {
    if (this.isExpanded) {
      this.closeExpandedView();
    } else {
      this.openExpandedView();
    }
  }

  openExpandedView() {
    if (!this.options.expandedView.enabled) return;

    this.isExpanded = true;
    this.createExpandedSheet();
    
    this.emit("expandedViewOpened", {
      direction: this.options.expandedView.direction,
      table: this
    });
  }

  closeExpandedView() {
    if (!this.isExpanded) return;

    this.isExpanded = false;
    if (this.expandedSheet) {
      this.expandedSheet.remove();
      this.expandedSheet = null;
    }
    if (this.expandedOverlay) {
      this.expandedOverlay.remove();
      this.expandedOverlay = null;
    }
    
    // Update button text
    const expandButton = document.querySelector('[data-expand-button]');
    if (expandButton) {
      expandButton.innerHTML = '↗️ Utvid';
    }
    
    this.emit("expandedViewClosed", {
      table: this
    });
  }

  createExpandedSheet() {
    const { direction, mobileBreakpoint } = this.options.expandedView;
    const isMobile = window.innerWidth <= mobileBreakpoint;
    const actualDirection = isMobile ? 'bottom' : direction;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300';
    overlay.style.opacity = '0';
    
    // Create sheet
    const sheet = document.createElement('div');
    sheet.className = this.getSheetClasses(actualDirection);
    sheet.setAttribute('data-expanded-sheet', 'true');

    // Create sheet header with handle
    const sheetHeader = this.createSheetHeader(actualDirection);
    
    // Create scrollable table container
    const tableContainer = this.createScrollableTableContainer();
    
    sheet.appendChild(sheetHeader);
    sheet.appendChild(tableContainer);

    // Add to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
    
    this.expandedSheet = sheet;
    this.expandedOverlay = overlay;

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      if (actualDirection === 'bottom') {
        sheet.style.transform = 'translateY(0)';
      } else {
        sheet.style.transform = 'translateX(0)';
      }
    });

    // Update button text
    const expandButton = document.querySelector('[data-expand-button]');
    if (expandButton) {
      expandButton.innerHTML = '↙️ Lukk';
    }

    // Setup event listeners
    this.setupExpandedViewListeners(overlay, sheet);
  }

  getSheetClasses(direction) {
    const baseClasses = 'fixed bg-white shadow-2xl z-50 transition-transform duration-300 ease-out';
    
    if (direction === 'bottom') {
      return `${baseClasses} bottom-0 left-0 right-0 h-4/5 rounded-t-xl transform translate-y-full`;
    } else {
      return `${baseClasses} top-0 right-0 bottom-0 w-4/5 max-w-4xl rounded-l-xl transform translate-x-full`;
    }
  }

  createSheetHeader(direction) {
    const header = document.createElement('div');
    header.className = 'flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50';
    
    if (direction === 'bottom') {
      header.className += ' rounded-t-xl';
    } else {
      header.className += ' rounded-tl-xl';
    }

    // Handle/grip line (like Snapchat)
    const handle = document.createElement('div');
    handle.className = 'w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3 cursor-pointer';
    handle.addEventListener('click', () => this.closeExpandedView());

    // Title and close button
    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex justify-between items-center';

    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold text-gray-800';
    title.textContent = `${this.options.collectionName || 'Tabell'} - Utvidet visning`;

    const closeButton = document.createElement('button');
    closeButton.className = 'px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-colors';
    closeButton.innerHTML = '✕ Lukk';
    closeButton.addEventListener('click', () => this.closeExpandedView());

    titleContainer.appendChild(title);
    titleContainer.appendChild(closeButton);

    header.appendChild(handle);
    header.appendChild(titleContainer);

    return header;
  }

  createScrollableTableContainer() {
    const container = document.createElement('div');
    container.className = 'flex-1 overflow-hidden relative';

    // Create horizontal scrollable area
    const scrollArea = document.createElement('div');
    scrollArea.className = 'h-full overflow-x-auto overflow-y-auto';

    // Create table with sticky columns
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'relative min-w-full';

    // Clone and modify the table for expanded view
    const expandedTable = this.createExpandedTable();
    tableWrapper.appendChild(expandedTable);
    
    scrollArea.appendChild(tableWrapper);
    container.appendChild(scrollArea);

    return container;
  }

  createExpandedTable() {
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-300 table-fixed';
    
    // Create thead with sticky columns
    const thead = this.createExpandedTableHeader();
    const tbody = this.createExpandedTableBody();
    
    table.appendChild(thead);
    table.appendChild(tbody);
    
    return table;
  }

  createExpandedTableHeader() {
    const thead = document.createElement('thead');
    thead.className = 'bg-gray-50 sticky top-0 z-10';

    const tr = document.createElement('tr');

    let columnIndex = 0;

    // Add global columns with sticky positioning
    if (this.options.globalColumns.index) {
      const th = this.createStickyHeaderCell('#', columnIndex, true);
      tr.appendChild(th);
      columnIndex++;
    }

    if (this.options.globalColumns.select) {
      const th = this.createStickyHeaderCell('Select', columnIndex, true);
      tr.appendChild(th);
      columnIndex++;
    }

    if (this.options.globalColumns.checked) {
      const th = this.createStickyHeaderCell('✓', columnIndex, true);
      tr.appendChild(th);
      columnIndex++;
    }

    // Add first regular column as sticky
    if (this.headers.length > 0) {
      const th = this.createStickyHeaderCell(this.headers[0], columnIndex, true);
      tr.appendChild(th);
      columnIndex++;
    }

    // Add remaining columns (scrollable)
    for (let i = 1; i < this.headers.length; i++) {
      const th = this.createStickyHeaderCell(this.headers[i], columnIndex, false);
      tr.appendChild(th);
      columnIndex++;
    }

    // Action column
    const actionTh = this.createStickyHeaderCell('Action', columnIndex, false);
    tr.appendChild(actionTh);

    thead.appendChild(tr);
    return thead;
  }

  createStickyHeaderCell(text, index, isSticky) {
    const th = document.createElement('th');
    th.className = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200';
    th.style.minWidth = '120px';
    th.textContent = text;

    if (isSticky) {
      th.className += ' sticky bg-gray-50 z-20';
      th.style.left = `${index * 120}px`;
      th.style.backdropFilter = 'blur(8px)';
      th.style.backgroundColor = 'rgba(249, 250, 251, 0.95)';
    }

    return th;
  }

  createExpandedTableBody() {
    const tbody = document.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-gray-200';

    this.data.forEach((obj, rowIndex) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50';

      let columnIndex = 0;

      // Add global column cells
      if (this.options.globalColumns.index) {
        const td = this.createStickyCellElement(rowIndex + 1, columnIndex, true);
        tr.appendChild(td);
        columnIndex++;
      }

      if (this.options.globalColumns.select) {
        const td = this.createStickyCellElement('☑️', columnIndex, true);
        tr.appendChild(td);
        columnIndex++;
      }

      if (this.options.globalColumns.checked) {
        const td = this.createStickyCellElement('✓', columnIndex, true);
        tr.appendChild(td);
        columnIndex++;
      }

      // Add first regular column as sticky
      if (this.headers.length > 0) {
        const value = obj[this.headers[0]] || '';
        const td = this.createStickyCellElement(value, columnIndex, true);
        tr.appendChild(td);
        columnIndex++;
      }

      // Add remaining columns (scrollable)
      for (let i = 1; i < this.headers.length; i++) {
        const value = obj[this.headers[i]] || '';
        const td = this.createStickyCellElement(value, columnIndex, false);
        tr.appendChild(td);
        columnIndex++;
      }

      // Action column
      const actionTd = this.createStickyCellElement('Delete', columnIndex, false);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });

    return tbody;
  }

  createStickyCellElement(content, index, isSticky) {
    const td = document.createElement('td');
    td.className = 'px-4 py-3 text-sm text-gray-900 border-r border-gray-100';
    td.style.minWidth = '120px';
    td.textContent = content;

    if (isSticky) {
      td.className += ' sticky bg-white z-10';
      td.style.left = `${index * 120}px`;
      td.style.backdropFilter = 'blur(8px)';
      td.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    }

    return td;
  }

  setupExpandedViewListeners(overlay, sheet) {
    // Close on overlay click
    overlay.addEventListener('click', () => this.closeExpandedView());

    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.closeExpandedView();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Prevent sheet clicks from closing
    sheet.addEventListener('click', (e) => e.stopPropagation());
  }

  // ------------------------------ Sletting ------------------------------
  deleteRow(rowIndex) {
    const { id, collection } = this.getRowIdentity(rowIndex);
    const deletedRow = this.data[rowIndex];
    
    // Add task for row deletion
    this.addTask('row_deleted', `Rad slettet: ${deletedRow.name || 'Ukjent'}`, `ID: ${id}`, 'completed');
    
    this.data.splice(rowIndex, 1);
    // reindeksering er ok; id er stabil i data
    this.headers = this.extractHeaders();
    this.render();
    this.emit("rowDeleted", { rowIndex, id, collection, data: this.data, table: this });
  }

  // ------------------------------ Events ------------------------------
  addEventListener(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(callback);
  }

  removeEventListener(eventType, callback) {
    if (this.eventListeners.has(eventType)) {
      const listeners = this.eventListeners.get(eventType);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(eventType, data) {
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).forEach((callback) => {
        callback(data);
      });
    }
  }

  setupEventListeners() {
    this.table.addEventListener("input", (e) => {
      if (e.target.tagName === "INPUT" || e.target.contentEditable === "true") {
        const key = e.target.getAttribute("data-key");
        const rowAttr = e.target.getAttribute("data-row");
        const rowIndex = rowAttr != null ? parseInt(rowAttr, 10) : NaN;
        const { id, collection } =
          Number.isInteger(rowIndex) && rowIndex >= 0
            ? this.getRowIdentity(rowIndex)
            : { id: null, collection: null };

        this.emit("cellChange", {
          element: e.target,
          value: e.target.value ?? e.target.textContent,
          key,
          rowIndex,
          id,
          collection,
          table: this,
        });
      }
    });

    this.table.addEventListener(
      "blur",
      (e) => {
        if (e.target.tagName === "INPUT" || e.target.contentEditable === "true") {
          const key = e.target.getAttribute("data-key");
          const rowAttr = e.target.getAttribute("data-row");
          const rowIndex = rowAttr != null ? parseInt(rowAttr, 10) : NaN;
          const { id, collection } =
            Number.isInteger(rowIndex) && rowIndex >= 0
              ? this.getRowIdentity(rowIndex)
              : { id: null, collection: null };

          this.emit("cellBlur", {
            element: e.target,
            value: e.target.value ?? e.target.textContent,
            key,
            rowIndex,
            id,
            collection,
            table: this,
          });
        }
      },
      true
    );
  }
}

export default Table;
