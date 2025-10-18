class DynamicTable {
  constructor(tableId, objectArray, options = {}) {
    this.tableId = tableId;
    this.table = document.getElementById(tableId);
    if (!this.table) throw new Error(`Fant ikke tabell med id: ${tableId}`);

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
        this.applyAttributes(input, this.inputAttr(key, key));
        th.appendChild(input);
      } else {
        th.setAttribute("contenteditable", "true");
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

    this.data.forEach(obj => {
      const tr = document.createElement("tr");
      this.applyAttributes(tr, this.attr.tr());

      this.headers.forEach(key => {
        const td = document.createElement("td");
        this.applyAttributes(td, this.attr.td(key, obj[key]));

        const val = this.onCellRender ? this.onCellRender(key, obj[key]) : (obj[key] ?? "");

        if (this.editableMode === "input") {
          const input = document.createElement("input");
          input.name = key;
          input.value = val;
          input.setAttribute("contenteditable", "true");
          this.applyAttributes(input, this.inputAttr(key, val));
          td.appendChild(input);
        } else {
          td.setAttribute("contenteditable", "true");
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

  /**
   * Robust JSON loader that updates table if valid array is parsed.
   * Returns status object with message and parsed data.
   */
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
    // Listen for input changes in editable cells
    this.table.addEventListener('input', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') {
        this.emit('cellChange', {
          element: e.target,
          value: e.target.value || e.target.textContent,
          key: e.target.getAttribute('data-key'),
          table: this
        });
      }
    });

    // Listen for blur events to capture final changes
    this.table.addEventListener('blur', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') {
        this.emit('cellBlur', {
          element: e.target,
          value: e.target.value || e.target.textContent,
          key: e.target.getAttribute('data-key'),
          table: this
        });
      }
    }, true);
  }
}

class App {
    constructor(document) {
        this.document = document;
    }

    ready(callback) {
        this.document.addEventListener("DOMContentLoaded", () => {
            callback();
        });
    }

    ui(data = null) {
        const prop = {
            id: {
                import: "import_json",
                feedback: "json_feedback",
                table: "data_table"
            },
            set: {},
            state: { ok: false }
        };

        prop.set.import = this.document.getElementById(prop.id.import);
        prop.set.feedback = this.document.getElementById(prop.id.feedback);
        prop.set.table = this.document.getElementById(prop.id.table);
        prop.state.ok = Object.values(prop.set).filter(Boolean).length === 3;

        return prop.state.ok === true ? {
            help: prop,
            import: this.document.getElementById(prop.id.import),
            feedback: this.document.getElementById(prop.id.feedback),
            table: data ? new DynamicTable(prop.id.table, data, {
                editableMode: "input",
                tableAttr: () => ({ class: "min-w-full divide-y divide-gray-300" }),
                theadAttr: () => ({ class: "bg-gray-200 text-gray-700" }),
                tbodyAttr: () => ({ class: "bg-white" }),
                trAttr: () => ({ class: "hover:bg-gray-50" }),
                thAttr: (key) => ({ class: "px-4 py-2 text-left font-semibold text-sm", "data-key": key }),
                tdAttr: (key, val) => ({ class: "px-4 py-2 text-sm text-gray-800", "data-key": key }),
                inputAttr: (key, val) => ({
                    class: "w-full text-sm px-2",
                    style: "background:none; border:none; outline:none;",
                    "data-key": key
                })
            }) : null
        } : prop;
    }
}

export default App;