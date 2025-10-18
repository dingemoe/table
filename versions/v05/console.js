
class Console {
  constructor({ elem = null, set = {} }) {
    if (!elem) throw new Error("Console element is required");
    this.consoleEl = elem;
    this.webhookUrl = set.webhookUrl || null;
    this.toastContainer = this.createToastContainer();
    this.logs = [];
    this.openDropdown = null;
    
    this.consoleEl.style.height = set.height ? set.height + "px" : "300px";
    this.consoleEl.style.overflowY = "auto";
    this.consoleEl.style.overflowX = "visible";
    this.consoleEl.classList.add("space-y-1");
    this.consoleEl.style.position = "relative";
    
    this.createHeader();
  }

  createHeader() {
    const header = document.createElement("div");
    header.className = "sticky top-0 bg-gray-900 border-b border-gray-700 px-2 py-2 z-50";
    header.style.display = "flex";
    header.style.justifyContent = "flex-end";
    header.style.gap = "8px";
    
    const copyAllBtn = document.createElement("button");
    copyAllBtn.className = "bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded transition";
    copyAllBtn.textContent = "📋 Kopier alle";
    copyAllBtn.onclick = () => this.copyAllRows();
    
    header.appendChild(copyAllBtn);
    this.consoleEl.appendChild(header);
  }

  createToastContainer() {
    const container = document.createElement("div");
    container.className = "fixed top-4 right-4 z-9999 space-y-2 pointer-events-none";
    container.style.zIndex = "9999";
    document.body.appendChild(container);
    return container;
  }

  showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    const bgColor = {
      success: "bg-green-500",
      error: "bg-red-500",
      warning: "bg-yellow-500",
      info: "bg-blue-500"
    }[type] || "bg-blue-500";

    toast.className = `${bgColor} text-white px-4 py-2 rounded shadow-lg pointer-events-auto transition-opacity duration-300 opacity-100`;
    toast.textContent = message;
    toast.style.zIndex = "9999";

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  async sendWebhook(data) {
    if (!this.webhookUrl) {
      this.showToast("Webhook URL ikke konfigurert", "error");
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        this.showToast("Webhook sendt", "success");
      } else {
        this.showToast(`Webhook error: ${response.status}`, "error");
      }
    } catch (error) {
      this.showToast(`Webhook feil: ${error.message}`, "error");
      console.error("Webhook error:", error);
    }
  }

  async copyAllRows() {
    if (this.logs.length === 0) {
      this.showToast("Ingen rader å kopiere", "warning");
      return;
    }

    const text = this.logs.map(log => {
      const { date, msg, type, state } = log;
      return `${date}\t${msg}\t${type}\t${state}`;
    }).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      this.showToast(`Kopiert ${this.logs.length} rader`, "success");
    } catch (error) {
      this.showToast(`Kopieringsfeil: ${error.message}`, "error");
    }
  }

  async copyRowContent(data) {
    const { date, msg, type, state } = data;
    const text = `${date}\t${msg}\t${type}\t${state}`;

    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Rad kopiert", "success");
    } catch (error) {
      this.showToast(`Kopieringsfeil: ${error.message}`, "error");
    }
  }

  closeDropdown() {
    if (this.openDropdown) {
      const { dropdown } = this.openDropdown;
      dropdown.style.maxHeight = "0px";
      dropdown.style.opacity = "0";
      setTimeout(() => {
        dropdown.classList.add("hidden");
        dropdown.classList.remove("fixed");
      }, 300);
      this.openDropdown = null;
    }
  }

  set(data) {
    const { date, msg, type, state, fullJson } = data;
    
    this.logs.push({ date, msg, type, state, fullJson });

    const container = document.createElement("div");
    container.className = "border-b border-gray-700";
    container.style.position = "relative";
    container.style.zIndex = "auto";

    const row = document.createElement("div");
    row.className =
      "grid gap-2 items-center px-2 py-1 text-sm transition hover:bg-gray-800";
    row.style.gridTemplateColumns = "1fr 1fr 100px 80px 40px 40px";
    row.style.cursor = "pointer";

    row.innerHTML = `
      <div class="text-gray-400 truncate">${date}</div>
      <div class="text-white truncate">${msg}</div>
      <div class="text-blue-300 truncate">${type}</div>
      <div class="${state === 'ok' ? 'text-green-400' : 'text-red-400'} truncate">${state}</div>
      <div class="text-xs text-gray-500 text-center">▼</div>
      <div class="text-xs text-center"></div>
    `;

    // Kopier knapp i rad
    const copyBtn = document.createElement("button");
    copyBtn.className = "bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-2 py-1 rounded transition";
    copyBtn.textContent = "📋";
    copyBtn.title = "Kopier rad";
    copyBtn.style.height = "fit-content";
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      this.copyRowContent({ date, msg, type, state });
    };
    row.querySelector("div:last-child").appendChild(copyBtn);

    const dropdown = document.createElement("div");
    dropdown.className = "bg-gray-950 text-gray-300 rounded-xl text-xs p-3 hidden border-l-2 border-gray-600";
    dropdown.style.maxHeight = "0px";
    dropdown.style.minWidth = "400px";
    dropdown.style.transition = "max-height 0.3s ease-in-out, opacity 0.3s ease-in-out";
    dropdown.style.overflow = "hidden";
    dropdown.style.zIndex = "999";
    dropdown.style.opacity = "0";
    dropdown.style.top = "50px";
    dropdown.style.left = "50px";

    const pre = document.createElement("pre");
    pre.className = "whitespace-pre-wrap break-words overflow-x-auto";
    pre.textContent = JSON.stringify(fullJson || { date, msg, type, state }, null, 2);
    dropdown.appendChild(pre);

    // Toggle dropdown
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      
      if (this.openDropdown === null) {
        // Åpne denne
        this.closeDropdown();
        
        dropdown.classList.remove("hidden");
        dropdown.classList.add("fixed");
        
        setTimeout(() => {
          dropdown.style.maxHeight = dropdown.scrollHeight + 50 + "px";
          dropdown.style.opacity = "1";
          this.openDropdown = { row, dropdown };
        }, 10);
        
      } else if (this.openDropdown.dropdown === dropdown) {
        // Lukk denne
        this.closeDropdown();
      } else {
        // Lukk annen, åpne denne
        this.closeDropdown();
        setTimeout(() => {
          dropdown.classList.remove("hidden");
          dropdown.classList.add("fixed");
          
          setTimeout(() => {
            dropdown.style.maxHeight = dropdown.scrollHeight + 50 + "px";
            dropdown.style.opacity = "1";
            this.openDropdown = { row, dropdown };
          }, 10);
        }, 300);
      }
    });

    // Lukk ved klikk på Escape
    const escapeListener = (e) => {
      if (e.key === "Escape" && this.openDropdown?.dropdown === dropdown) {
        this.closeDropdown();
      }
    };
    document.addEventListener("keydown", escapeListener);

    // Lukk ved klikk utenfor
    const clickListener = (e) => {
      if (this.openDropdown?.dropdown === dropdown && 
          !dropdown.contains(e.target) && 
          !row.contains(e.target)) {
        this.closeDropdown();
      }
    };
    document.addEventListener("click", clickListener);

    container.appendChild(row);
    container.appendChild(dropdown);
    this.consoleEl.appendChild(container);
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }
}

export default Console;