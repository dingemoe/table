class ChatView {
  constructor(config = {}) {
    this.container = typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;

    this.theme = config.theme || 'light';
    this.options = Object.assign({
      storageKey: 'chat_config',
      commands: {}
    }, config.options || {});
    this.callbacks = config.callbacks || {};

    this.messages = [];
    this.thread = [];
    this.commands = this._restoreCommands(this.options.commands);
    this.activeTab = sessionStorage.getItem('chat_config_tab') || 'chat';
    this.activeWizard = null;
    this.wizardEl = null;

    if (!this.container) throw new Error('ChatView: container er påkrevd');
    this._init();
  }

  // ---------------------------
  // Init layout
  // ---------------------------
  _init() {
    this.container.className = this._baseClass();
    this._injectMinimalStyles();

    this._renderTabs();
    this._renderBodies();
    this._renderFooter();
    this._switchTab(this.activeTab);

    this.callbacks.onInit?.();
  }

  _baseClass() {
    const theme = this.theme === 'dark'
      ? 'bg-gray-900 text-white'
      : 'bg-white text-gray-800';
    return `flex flex-col h-[600px] w-full border rounded shadow ${theme}`;
  }

  _renderTabs() {
    this.tabHeader = document.createElement('div');
    this.tabHeader.className = 'flex border-b';

    ['chat', 'config'].forEach(tab => {
      const btn = document.createElement('button');
      btn.textContent = tab === 'chat' ? 'Meny' : 'Config';
      btn.className = 'px-4 py-2 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700';
      btn.addEventListener('click', () => this._switchTab(tab));
      this.tabHeader.appendChild(btn);
    });

    this.container.appendChild(this.tabHeader);
  }

  _switchTab(tab) {
    this.activeTab = tab;
    sessionStorage.setItem('chat_config_tab', tab);
    this.chatBody.style.display = tab === 'chat' ? 'block' : 'none';
    this.configBody.style.display = tab === 'config' ? 'block' : 'none';
  }

  _renderBodies() {
    this.chatBody = document.createElement('div');
    this.chatBody.className = 'flex-1 px-4 py-3 space-y-2 overflow-y-auto';

    this.configBody = document.createElement('div');
    this.configBody.className = 'flex-1 px-4 py-3 overflow-y-auto hidden';

    this.container.appendChild(this.chatBody);
    this.container.appendChild(this.configBody);

    this._renderConfig();
  }

  _renderFooter() {
    this.footer = document.createElement('div');
    this.footer.className = 'border-t px-4 py-3 flex items-center';

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center w-full bg-gray-100 dark:bg-gray-800 rounded-full px-3';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Skriv her...';
    this.input.className = 'flex-1 bg-transparent px-2 py-2 outline-none text-sm';

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._handleInput();
        e.preventDefault();
      }
      if (e.key === 'Tab') {
        if (this.input.placeholder && !this.input.value) {
          this.input.value = this.input.placeholder;
          this.input.placeholder = '';
          e.preventDefault();
        }
      }
    });

    this.sendIcon = document.createElement('span');
    this.sendIcon.innerHTML = '➤';
    this.sendIcon.className = 'ml-2 text-gray-500 cursor-pointer hover:text-blue-500';
    this.sendIcon.addEventListener('click', () => this._handleInput());

    wrapper.appendChild(this.input);
    wrapper.appendChild(this.sendIcon);
    this.footer.appendChild(wrapper);
    this.container.appendChild(this.footer);
  }

  // ---------------------------
  // Input handling
  // ---------------------------
  _handleInput() {
    const text = (this.input.value || '').trim();
    if (!text) return;
    this.input.value = '';

    if (text.startsWith('/')) {
      const name = text.slice(1).trim();
      if (!name) return;
      this._startCommandWizard(name);
      return;
    }

    if (this.activeWizard) {
      this._handleWizardInput(text);
      return;
    }

    this._addMessage(text, 'user');
  }

  // ---------------------------
  // Messages
  // ---------------------------
  _addMessage(text, sender) {
    const msg = document.createElement('div');
    const userBubble = this.theme === 'dark'
      ? 'bg-blue-600 text-white'
      : 'bg-blue-500 text-white';
    const botBubble = this.theme === 'dark'
      ? 'bg-gray-700 text-white'
      : 'bg-gray-200 text-gray-900';

    msg.className = sender === 'user'
      ? `self-end ${userBubble} px-4 py-2 rounded-lg text-sm animate-fade-in`
      : `self-start ${botBubble} px-4 py-2 rounded-lg text-sm animate-fade-in`;

    msg.textContent = text;
    this.chatBody.appendChild(msg);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;
    this.messages.push({ sender, text });
  }

  // ---------------------------
  // Wizard menu
  // ---------------------------
  _startCommandWizard(name) {
    const cmd = this.commands[name];
    this.activeWizard = {
      name,
      index: 0,
      options: [
        { item: 'Beskrivelse', index: 1, answer: '', active: true, example: cmd?.examples?.description || 'Kort beskrivelse...' },
        { item: 'Flags', index: 2, answer: '', active: false, example: cmd?.examples?.flags || '--add, --list',
          sub: [
            { key: 'a', label: 'Flag A', example: '--add' },
            { key: 'b', label: 'Flag B', example: '--list' },
            { key: 'c', label: 'Flag C', example: '--remove' }
          ],
          activeSub: null
        },
        { item: 'Params', index: 3, answer: '', active: false, example: cmd?.examples?.params || '{"scope":"global"}' },
        { item: 'Render', index: 4, answer: '', active: false, example: cmd?.examples?.render || '<div>Hei</div>' },
        { item: 'Action', index: 5, answer: '', active: false, example: cmd?.examples?.action || 'ctx.send("Hei")' }
      ]
    };
    this._renderWizardMenu();
  }

  _renderWizardMenu() {
    if (this.wizardEl) this.wizardEl.remove();

    this.wizardEl = document.createElement('div');
    this.wizardEl.className = 'self-start bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm space-y-2 animate-fade-in';

    this.activeWizard.options.forEach((opt, i) => {
      const row = document.createElement('div');
      row.className = `px-3 py-2 rounded flex justify-between items-center cursor-pointer transition ${
        opt.active ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-900'
      }`;

      row.innerHTML = `
        <span>${opt.index}. ${opt.item}</span>
        <span class="text-xs opacity-75">${opt.answer ? opt.answer.length + ' tegn' : 'ingen'}</span>
      `;

      row.addEventListener('click', () => {
        this.activeWizard.index = i;
        this.activeWizard.options.forEach((o, j) => o.active = j === i);
        this._renderWizardMenu();
        this.input.placeholder = opt.example || 'Skriv her...';
      });

      this.wizardEl.appendChild(row);

      // Sub‑meny for Flags
      if (opt.item === 'Flags' && opt.active && opt.sub) {
        const subList = document.createElement('div');
        subList.className = 'ml-4 space-y-1';
        opt.sub.forEach(sub => {
          const subRow = document.createElement('div');
          subRow.className = `px-2 py-1 rounded cursor-pointer ${
            opt.activeSub === sub.key ? 'bg-blue-400 text-white' : 'bg-gray-200 dark:bg-gray-700'
          }`;
          subRow.textContent = `${sub.key}) ${sub.label}`;
          subRow.addEventListener('click', () => {
            opt.activeSub = sub.key;
            this.input.placeholder = sub.example;
            this._renderWizardMenu(); // re‑render for å markere valgt sub
          });
          subList.appendChild(subRow);
        });
        this.wizardEl.appendChild(subList);
      }
    });

    this.chatBody.appendChild(this.wizardEl);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;

    // Sett placeholder til aktivt felt eller sub
    const activeOpt = this.activeWizard.options[this.activeWizard.index];
    if (activeOpt.activeSub) {
      const sub = activeOpt.sub.find(s => s.key === activeOpt.activeSub);
      this.input.placeholder = sub?.example || activeOpt.example || 'Skriv her...';
    } else {
      this.input.placeholder = activeOpt.example || 'Skriv her...';
    }
  }

  // ---------------------------
  // Wizard input
  // ---------------------------
  _handleWizardInput(text) {
    const opt = this.activeWizard.options[this.activeWizard.index];

    // Hvis Flags med sub‑valg
    if (opt.item === 'Flags' && opt.activeSub) {
      const sub = opt.sub.find(s => s.key === opt.activeSub);
      if (sub) {
        opt.answer = sub.example;
      }
    } else {
      opt.answer = text;
    }

    // Gå videre til neste felt
    if (this.activeWizard.index < this.activeWizard.options.length - 1) {
      this.activeWizard.index++;
      this.activeWizard.options.forEach((o, j) => o.active = j === this.activeWizard.index);
      this._renderWizardMenu();
    } else {
      this._saveWizardCommand();
      this.activeWizard = null;
      if (this.wizardEl) this.wizardEl.remove();
    }
  }

  // ---------------------------
  // Lagre kommando
  // ---------------------------
  _saveWizardCommand() {
    const w = this.activeWizard;
    this.commands[w.name] = {
      description: w.options[0].answer,
      flags: w.options[1].answer ? w.options[1].answer.split(',').map(s => s.trim()) : [],
      params: (() => { try { return JSON.parse(w.options[2].answer || '{}'); } catch { return {}; } })(),
      render: () => w.options[3].answer,
      action: () => console.log('Action:', w.options[4].answer)
    };
    this._persistCommands();
    this._renderConfig(true);
    this._addMessage(`Kommando /${w.name} lagret`, 'bot');
  }

  // ---------------------------
  // Config‑tab
  // ---------------------------
  _renderConfig(force = false) {
    if (!force && this.configRendered) return;
    this.configRendered = true;
    this.configBody.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = 'Config (kommandoer)';
    title.className = 'text-lg font-semibold mb-2';
    this.configBody.appendChild(title);

    Object.entries(this.commands).forEach(([name, cmd]) => {
      const card = document.createElement('div');
      card.className = 'mb-3 p-3 rounded border bg-white dark:bg-gray-900 text-sm';

      card.innerHTML = `
        <div class="font-bold mb-1">/${name}</div>
        <div>Beskrivelse: ${cmd.description || ''}</div>
        <div>Flags: ${cmd.flags?.join(', ') || ''}</div>
        <div>Params: ${JSON.stringify(cmd.params)}</div>
      `;

      this.configBody.appendChild(card);
    });
  }

  // ---------------------------
  // Persistence
  // ---------------------------
  _persistCommands() {
    const exportable = {};
    Object.entries(this.commands).forEach(([n, c]) => {
      exportable[n] = {
        description: c.description,
        flags: c.flags,
        params: c.params
      };
    });
    sessionStorage.setItem(this.options.storageKey, JSON.stringify(exportable));
  }

  _restoreCommands(defaults = {}) {
    try {
      const raw = sessionStorage.getItem(this.options.storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return defaults;
    }
  }

  // ---------------------------
  // Utils
  // ---------------------------
  _injectMinimalStyles() {
    if (document.getElementById('chatview-fade-style')) return;
    const style = document.createElement('style');
    style.id = 'chatview-fade-style';
    style.textContent = `
      .animate-fade-in { animation: cvi-fade 160ms ease-out; }
      @keyframes cvi-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }
}
export default ChatView;