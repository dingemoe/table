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

    // Add delete column header
    const thDelete = document.createElement("th");
    thDelete.setAttribute("class", "px-4 py-2 text-left font-semibold text-sm bg-red-100");
    thDelete.textContent = "Action";
    tr.appendChild(thDelete);

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

      // Add delete button cell
      const tdDelete = document.createElement("td");
      tdDelete.setAttribute("class", "px-4 py-2 text-sm");
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.setAttribute("data-row", rowIndex);
      deleteBtn.setAttribute("class", "px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs");
      deleteBtn.addEventListener("click", () => {
        this.emit('deleteRow', { rowIndex, table: this });
      });
      tdDelete.appendChild(deleteBtn);
      tr.appendChild(tdDelete);

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

  extractTableData() {
    const rows = this.table.querySelectorAll('tbody tr');
    const extracted = [];

    rows.forEach(row => {
      const obj = {};
      this.headers.forEach(key => {
        const cell = row.querySelector(`[data-key="${key}"]`);
        
        let value = '';
        if (cell) {
          if (cell.tagName === 'INPUT') {
            value = cell.value.trim();
          } else {
            value = cell.textContent.trim();
          }
        }
        
        obj[key] = value || '';
      });
      extracted.push(obj);
    });

    console.log('Extracted data:', extracted);
    return extracted;
  }

  deleteRow(rowIndex) {
    this.data.splice(rowIndex, 1);
    this.render();
    this.emit('rowDeleted', { rowIndex, data: this.data, table: this });
  }

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

  async set(key, value) {
    const data = Array.isArray(value) ? value : [value];
    this.session.setItem(key, JSON.stringify(data));
    
    await this.triggerWebhook('insert', key, data);
  }

  get(key) {
    const data = this.session.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  async update(key, value) {
    const data = Array.isArray(value) ? value : [value];
    this.session.setItem(key, JSON.stringify(data));
    
    await this.triggerWebhook('update', key, data);
  }

  async remove(key) {
    this.session.removeItem(key);
    
    await this.triggerWebhook('delete', key, null);
  }

  async clear() {
    this.session.clear();
    
    await this.triggerWebhook('clear', 'collection', null);
  }

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

  exists(key) {
    return this.session.getItem(key) !== null;
  }
}

class Curl {
  constructor(url) {
    this.url = url;
  }

  insert(options = {}) {
    const key = options.key || 'tasks';
    const data = options.data || [
      { navn: 'Alice', status: 'Aktiv', frist: '2025-10-20' },
      { navn: 'Bob', status: 'Venter', frist: '2025-10-25' }
    ];
    
    const payload = {
      operation: 'insert',
      key,
      data,
      timestamp: new Date().toISOString()
    };
    return this._buildCurl(payload);
  }

  update(options = {}) {
    const key = options.key || 'tasks';
    const data = options.data || [
      { navn: 'Alice', status: 'Ferdig', frist: '2025-10-20' }
    ];
    
    const payload = {
      operation: 'update',
      key,
      data,
      timestamp: new Date().toISOString()
    };
    return this._buildCurl(payload);
  }

  delete(options = {}) {
    const key = options.key || 'tasks';
    
    const payload = {
      operation: 'delete',
      key,
      data: null,
      timestamp: new Date().toISOString()
    };
    return this._buildCurl(payload);
  }

  clear(options = {}) {
    const payload = {
      operation: 'clear',
      key: 'collection',
      data: null,
      timestamp: new Date().toISOString()
    };
    return this._buildCurl(payload);
  }

  _buildCurl(payload) {
    const json = JSON.stringify(payload, null, 2);
    return `curl -X POST ${this.url} \\
  -H "Content-Type: application/json" \\
  -d '${json}'`;
  }
}

class App {
  constructor(documentRef, storageRef = sessionStorage, webhookUrl = null, collectionNameInputId = 'data_collection_name') {
    this.document = documentRef;
    this.storage = new Storage({ webhookUrl, storageType: storageRef });
    this.dynamicTable = null;
    this.uiElements = {};
    this.collectionNameInputId = collectionNameInputId;
    this.curl = new Curl(webhookUrl);
  }

  ready(callback) {
    if (this.document.readyState === 'loading') {
      this.document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  getCollectionName() {
    const input = this.document.getElementById(this.collectionNameInputId);
    if (!input) {
      console.warn(`Collection name input not found: ${this.collectionNameInputId}`);
      return 'defaultCollection';
    }
    const value = input.value.trim();
    return value || 'defaultCollection';
  }

  ui(data = null) {
    const ids = {
      import: 'import_json',
      feedback: 'json_feedback',
      table: 'data_table',
      collectionName: this.collectionNameInputId
    };

    const elements = {
      import: this.document.getElementById(ids.import),
      feedback: this.document.getElementById(ids.feedback),
      table: this.document.getElementById(ids.table),
      collectionName: this.document.getElementById(ids.collectionName)
    };

    const corePresent = [elements.import, elements.feedback, elements.table].every(el => el !== null);
    if (!corePresent) {
      throw new Error(`Missing required UI elements. Check IDs: import_json, json_feedback, data_table`);
    }

    this.uiElements = elements;

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

      this.dynamicTable.addEventListener('cellBlur', async (event) => {
        const collectionName = this.getCollectionName();
        const updatedData = this.dynamicTable.extractTableData();
        
        console.log('Cell blur - extracted data:', updatedData);
        
        if (!updatedData || updatedData.length === 0) {
          this.updateFeedback('No data to save');
          return;
        }
        
        await this.storage.update(collectionName, updatedData);
        this.updateFeedback(`Data saved to: ${collectionName}`);
      });

      this.dynamicTable.addEventListener('deleteRow', async (event) => {
        const collectionName = this.getCollectionName();
        const updatedData = this.dynamicTable.extractTableData();
        
        await this.storage.update(collectionName, updatedData);
        this.updateFeedback(`Row deleted - ${collectionName}`);
      });

      this.dynamicTable.addEventListener('dataChange', async (event) => {
        const collectionName = this.getCollectionName();
        await this.storage.set(collectionName, event.data);
        this.updateFeedback(`Data loaded in: ${collectionName}`);
      });
    }

    this.setupImportHandler();
    this.setupDeleteCollectionButton();

    return {
      import: elements.import,
      feedback: elements.feedback,
      table: this.dynamicTable,
      collectionName: elements.collectionName,
      storage: this.storage
    };
  }

  setupImportHandler() {
    if (!this.uiElements.import || !this.dynamicTable) return;

    this.uiElements.import.addEventListener('input', async (e) => {
      const raw = e.target.value.trim();
      if (!raw) return;
      
      const result = this.dynamicTable.loadJson(raw);
      const collectionName = this.getCollectionName();
      
      if (result.data) {
        await this.storage.set(collectionName, result.data);
        this.updateFeedback(`JSON loaded ${result.msg} - ${collectionName}`);
      } else {
        this.updateFeedback(`Parse failed ${result.msg}`);
      }
    });
  }

  setupDeleteCollectionButton() {
    if (!this.uiElements.collectionName) return;

    const buttonContainer = this.uiElements.collectionName.parentElement;
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Collection';
    deleteBtn.setAttribute('class', 'mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm');
    
    deleteBtn.addEventListener('click', async () => {
      const collectionName = this.getCollectionName();
      const confirmed = confirm(`Delete collection "${collectionName}"? This cannot be undone.`);
      
      if (confirmed) {
        await this.storage.remove(collectionName);
        this.dynamicTable.data = [];
        this.dynamicTable.render();
        this.updateFeedback(`Collection deleted: ${collectionName}`);
      }
    });

    buttonContainer.appendChild(deleteBtn);
  }

  updateFeedback(message) {
    if (this.uiElements.feedback) {
      this.uiElements.feedback.textContent = message;
      this.uiElements.feedback.style.color = message.includes('failed') ? '#ff6b6b' : '#4caf50';
    }
  }

  exportTableData() {
    if (!this.dynamicTable) {
      throw new Error('No table initialized');
    }
    const data = this.dynamicTable.extractTableData();
    return JSON.stringify(data, null, 2);
  }

  loadFromStorage(collectionName = null) {
    const name = collectionName || this.getCollectionName();
    const data = this.storage.get(name);
    if (!data) {
      throw new Error(`No data found in storage with collection: ${name}`);
    }
    if (this.dynamicTable) {
      this.dynamicTable.data = data;
      this.dynamicTable.headers = this.dynamicTable.extractHeaders();
      this.dynamicTable.render();
      this.updateFeedback(`Loaded from: ${name}`);
    }
    return data;
  }
}

export default App;