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
      ...restOptions
    } = options || {};

    this.options = {
      idKey,
      collectionKey,
      collectionName,
      id,
      ...restOptions,
    };

    this.data = Array.isArray(objectArray) ? [...objectArray] : [];
    this.eventListeners = new Map();

    this.initAttributes();

    // Sørg for ID-er før headers/renderer
    this.ensureRowIds();
    this.headers = this.extractHeaders();

    this.render();
    this.setupEventListeners();
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
    for (const row of this.data) {
      if (row && typeof row === "object" && row[idKey]) {
        existing.add(String(row[idKey]).toUpperCase());
      }
    }
    for (const row of this.data) {
      if (!row || typeof row !== "object") continue;
      if (!row[idKey]) {
        row[idKey] = this._generateUniqueId(existing);
        existing.add(row[idKey]);
      } else {
        row[idKey] = String(row[idKey]).toUpperCase();
      }
    }
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
  renderHeader() {
    const thead = document.createElement("thead");
    this.applyAttributes(thead, this.attr.thead());

    const tr = document.createElement("tr");
    this.applyAttributes(tr, this.attr.tr());

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

      // Action / Delete
      const tdDelete = document.createElement("td");
      tdDelete.setAttribute("class", "px-4 py-2 text-sm");
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.setAttribute("data-row", rowIndex);
      deleteBtn.setAttribute(
        "class",
        "px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
      );
      deleteBtn.addEventListener("click", () => {
        const { id, collection } = this.getRowIdentity(rowIndex);
        this.emit("deleteRow", { rowIndex, id, collection, table: this });
      });
      tdDelete.appendChild(deleteBtn);
      tr.appendChild(tdDelete);

      tbody.appendChild(tr);
    });

    this._replaceSection("tbody", tbody);
  }

  render() {
    // sørg for ID-er alltid er tilstede
    this.ensureRowIds();
    this.applyAttributes(this.table, this.attr.table());
    this.table.setAttribute("data-dynamic", "true");

    // header og rows
    this.renderHeader();
    this.renderRows();

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

  // ------------------------------ Sletting ------------------------------
  deleteRow(rowIndex) {
    const { id, collection } = this.getRowIdentity(rowIndex);
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
