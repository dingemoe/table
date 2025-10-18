class DynamicTable {
  constructor(tableId, objectArray, options = {}) {
    this.tableId = tableId;
    this.table = document.getElementById(tableId);
    if (!this.table) throw new Error(`Table not found with id: ${tableId}`);

    this.options = options;
    this.data = objectArray;
    this.eventListeners = new Map();
    this.initAttributes();
    this.headers = this.extractHeaders();
    this.render();
    this.setupEventListeners();
  }

  initAttributes() {
    const options = this.options;
    this.attr = {
      table: options.tableAttr || (() => ({})),
      thead: options.theadAttr || (() => ({})),
      tbody: options.tbodyAttr || (() => ({})),
      tr: options.trAttr || (() => ({})),
      th: options.thAttr || ((key) => ({})),
      td: options.tdAttr || ((key, val) => ({}))
    };

    this.inputAttr = options.inputAttr || ((key, val) => ({
      style: "background:none; border:none; outline:none;"
    }));

    this.onCellRender = options.onCellRender || null;
    this.editableMode = options.editableMode || "cell";
  }

  extractHeaders() {
    const keys = new Set();
    this.data.forEach(obj => Object.keys(obj).forEach(key => keys.add(key)));
    return Array.from(keys);
  }

  applyAttributes(el, attrObj) {
    if (typeof attrObj === 'string') {
      const matches = attrObj.match(/(\w+)="([^"]*)"/g);
      if (matches) {
        matches.forEach(match => {
          const [, key, val] = match.match(/(\w+)="([^"]*)"/);
          el.setAttribute(key, val);
        });
      }
    } else if (typeof attrObj === 'object' && attrObj !== null) {
      Object.entries(attrObj).forEach(([key, val]) => el.setAttribute(key, val));
    }
  }

  renderHeader() {
    const thead = document.createElement("thead");
    this.applyAttributes(thead, this.attr.thead());

    const tr = document.createElement("tr");
    this.applyAttributes(tr, this.attr.tr());

    this.headers.forEach(key => {
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

    thead.appendChild(tr);
    this.table.replaceChild(thead, this.table.querySelector("thead"));
  }

  renderRows() {
    const tbody = document.createElement("tbody");
    this.applyAttributes(tbody, this.attr.tbody());

    this.data.forEach((obj, rowIndex) => {
      const tr = document.createElement("tr");
      this.applyAttributes(tr, this.attr.tr());
      tr.setAttribute("data-row", rowIndex);

      this.headers.forEach(key => {
        const td = document.createElement("td");
        this.applyAttributes(td, this.attr.td(key, obj[key]));

        const val = this.onCellRender ? this.onCellRender(key, obj[key]) : (obj[key] ?? "");

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

      tbody.appendChild(tr);
    });

    this.table.replaceChild(tbody, this.table.querySelector("tbody"));
  }

  render() {
    this.applyAttributes(this.table, this.attr.table());
    this.table.setAttribute("data-dynamic", "true");
    this.renderHeader();
    this.renderRows();
    this.emit('tableRender', { data: this.data, headers: this.headers, table: this });
  }

  loadJson(raw) {
    const res = { msg: "", data: null };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.data = parsed;
        this.headers = this.extractHeaders();
        this.render();
        this.emit('dataChange', { data: parsed, source: 'json', table: this });
        res.data = parsed;
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
          this.headers = this.extractHeaders();
          this.render();
          this.emit('dataChange', { data: parsed, source: 'json-converted', table: this });
          res.data = parsed;
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

  // Extract current data from edited table
  extractTableData() {
    const rows = this.table.querySelectorAll('tbody tr');
    const extracted = [];

    rows.forEach(row => {
      const obj = {};
      this.headers.forEach(key => {
        const cell = row.querySelector(`[data-key="${key}"]`);
        obj[key] = cell ? (cell.value || cell.textContent) : '';
      });
      extracted.push(obj);
    });

    return extracted;
  }

  // Event handling methods
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
      this.eventListeners.get(eventType).forEach(callback => {
        callback(data);
      });
    }
  }

  setupEventListeners() {
    this.table.addEventListener('input', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') {
        this.emit('cellChange', {
          element: e.target,
          value: e.target.value || e.target.textContent,
          key: e.target.getAttribute('data-key'),
          row: e.target.getAttribute('data-row'),
          table: this
        });
      }
    });

    this.table.addEventListener('blur', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') {
        this.emit('cellBlur', {
          element: e.target,
          value: e.target.value || e.target.textContent,
          key: e.target.getAttribute('data-key'),
          row: e.target.getAttribute('data-row'),
          table: this
        });
      }
    }, true);
  }
}

class Storage {
  constructor({ webhookUrl, storageType = sessionStorage }) {
    this.session = storageType;
    this.webhookUrl = webhookUrl;
  }

  // Store (object/array → array)
  async set(key, value) {
    const data = Array.isArray(value) ? value : [value];
    this.session.setItem(key, JSON.stringify(data));
    
    await this.triggerWebhook('insert', key, data);
  }

  // Get
  get(key) {
    const data = this.session.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  // Update
  async update(key, value) {
    const data = Array.isArray(value) ? value : [value];
    this.session.setItem(key, JSON.stringify(data));
    
    await this.triggerWebhook('update', key, data);
  }

  // Delete
  async remove(key) {
    this.session.removeItem(key);
    
    await this.triggerWebhook('delete', key, null);
  }

  // Clear all
  async clear() {
    this.session.clear();
    
    await this.triggerWebhook('clear', 'collection', null);
  }

  // Webhook trigger
  async triggerWebhook(operation, key, data) {
    if (!this.webhookUrl) return;
    
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          key,
          data,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Webhook error:', error);
    }
  }

  // Check if exists
  exists(key) {
    return this.session.getItem(key) !== null;
  }
}

class App {
  constructor(documentRef, storageRef, webhookUrl) {
    this.document = documentRef;
    this.storage = new Storage({ webhookUrl, storageType: storageRef });
    this.dynamicTable = null;
    this.uiElements = {};
  }

  ready(callback) {
    if (this.document.readyState === 'loading') {
      this.document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  ui(data = null) {
    const ids = {
      import: 'import_json',
      feedback: 'json_feedback',
      table: 'data_table'
    };

    const elements = {
      import: this.document.getElementById(ids.import),
      feedback: this.document.getElementById(ids.feedback),
      table: this.document.getElementById(ids.table)
    };

    // Validate all required elements exist
    const allPresent = Object.values(elements).every(el => el !== null);
    if (!allPresent) {
      throw new Error(`Missing required UI elements. Check IDs: ${JSON.stringify(ids)}`);
    }

    this.uiElements = elements;

    // Create DynamicTable if data provided
    if (data && Array.isArray(data)) {
      this.dynamicTable = new DynamicTable(ids.table, data, {
        editableMode: 'input',
        tableAttr: () => ({ class: 'min-w-full divide-y divide-gray-300' }),
        theadAttr: () => ({ class: 'bg-gray-200 text-gray-700' }),
        tbodyAttr: () => ({ class: 'bg-white' }),
        trAttr: () => ({ class: 'hover:bg-gray-50' }),
        thAttr: (key) => ({ 
          class: 'px-4 py-2 text-left font-semibold text-sm',
          'data-key': key 
        }),
        tdAttr: (key, val) => ({ 
          class: 'px-4 py-2 text-sm text-gray-800',
          'data-key': key 
        }),
        inputAttr: (key, val) => ({
          class: 'w-full text-sm px-2',
          style: 'background:none; border:none; outline:none;',
          'data-key': key
        })
      });

      // Listen to table changes and sync with storage
      this.dynamicTable.addEventListener('cellBlur', async (event) => {
        const updatedData = this.dynamicTable.extractTableData();
        await this.storage.update('tableData', updatedData);
        this.updateFeedback('Data saved to storage');
      });

      this.dynamicTable.addEventListener('dataChange', async (event) => {
        await this.storage.set('tableData', event.data);
        this.updateFeedback('Data loaded and stored');
      });
    }

    // Setup import handler
    this.setupImportHandler();

    return {
      import: elements.import,
      feedback: elements.feedback,
      table: this.dynamicTable,
      storage: this.storage
    };
  }

  setupImportHandler() {
    if (!this.uiElements.import || !this.dynamicTable) return;

    this.uiElements.import.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target.result;
          const result = this.dynamicTable.loadJson(content);
          
          if (result.data) {
            await this.storage.set('tableData', result.data);
            this.updateFeedback(`Import successful ${result.msg}`);
          } else {
            this.updateFeedback(`Import failed ${result.msg}`);
          }
        } catch (error) {
          this.updateFeedback(`Import error: ${error.message}`);
        }
      };
      reader.readAsText(file);
    });
  }

  updateFeedback(message) {
    if (this.uiElements.feedback) {
      this.uiElements.feedback.textContent = message;
      this.uiElements.feedback.style.color = message.includes('error') ? 'red' : 'green';
    }
  }

  exportTableData() {
    if (!this.dynamicTable) {
      throw new Error('No table initialized');
    }
    const data = this.dynamicTable.extractTableData();
    return JSON.stringify(data, null, 2);
  }

  loadFromStorage(key) {
    const data = this.storage.get(key);
    if (!data) {
      throw new Error(`No data found in storage with key: ${key}`);
    }
    if (this.dynamicTable) {
      this.dynamicTable.data = data;
      this.dynamicTable.headers = this.dynamicTable.extractHeaders();
      this.dynamicTable.render();
    }
    return data;
  }
}

export default App;