/**
 * Chat App Render System
 * Basert på manifest.tml konfigurasjonen
 * 
 * 2 Hovedklasser:
 * 1. HtmlRenderer - Render HTML struktur
 * 2. ComponentInitializer - Init klasser, metoder og configs
 */

// Import basert på manifest.tml regler
const baseUrl = 'https://cdn.jsdelivr.net/gh/dingemoe/table@main/versions/v05/';

/**
 * Klasse 1: HTML Renderer
 * Ansvarlig for å generere HTML-struktur
 */
class HtmlRenderer {
  constructor(config = {}) {
    this.config = {
      theme: config.theme || 'light',
      container: config.container || 'body',
      title: config.title || 'Dynamic Table Chat',
      ...config
    };
  }

  /**
   * Render hovedstruktur for chat-appen
   */
  renderMainStructure() {
    const html = `
      <div class="max-w-4xl mx-auto p-6 bg-gray-100 min-h-screen">
        <h1 class="text-3xl font-bold mb-6 text-gray-800">
          ${this.config.title}
        </h1>

        <!-- Collection Name -->
        <div class="mb-4 bg-white p-4 rounded-lg shadow">
          <label for="data_collection_name" class="block font-semibold text-gray-700 mb-2">
            Collection Name:
          </label>
          <input
            id="data_collection_name"
            type="text"
            value="tasks"
            placeholder="Enter collection name..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <!-- JSON Import -->
        <div class="mb-4 bg-white p-4 rounded-lg shadow">
          <label for="import_json" class="block font-semibold text-gray-700 mb-2">
            Import JSON:
          </label>
          <textarea
            id="import_json"
            placeholder="Paste JSON array here..."
            class="w-full h-24 p-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>
        </div>

        <!-- Feedback -->
        <div
          id="json_feedback"
          class="mb-4 p-3 rounded-lg bg-green-100 text-green-800 font-semibold"
        >
          Ready to import data
        </div>

        <!-- Table Container -->
        <div class="bg-white rounded-lg shadow overflow-hidden mb-6">
          <table id="data_table" class="min-w-full divide-y divide-gray-300">
            <thead></thead>
            <tbody></tbody>
          </table>
        </div>

        <!-- Chat Container -->
        <div id="chat" class="w-full max-w-xl mx-auto"></div>
      </div>
    `;

    return html;
  }

  /**
   * Render Tailwind CSS imports
   */
  renderStyles() {
    return `
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .animate-fade-in { 
          animation: fadeIn 0.3s ease-in-out; 
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    `;
  }

  /**
   * Render komplett HTML dokument
   */
  renderDocument() {
    return `
      <!DOCTYPE html>
      <html lang="no">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${this.config.title}</title>
          ${this.renderStyles()}
        </head>
        <body class="bg-gray-100">
          ${this.renderMainStructure()}
        </body>
      </html>
    `;
  }

  /**
   * Inject HTML inn i eksisterende container
   */
  injectIntoContainer(containerId = null) {
    const container = containerId 
      ? document.getElementById(containerId)
      : document.querySelector(this.config.container);
    
    if (container) {
      container.innerHTML = this.renderMainStructure();
      return true;
    }
    return false;
  }
}

/**
 * Klasse 2: Component Initializer
 * Ansvarlig for å initialisere klasser, metoder og configs
 */
class ComponentInitializer {
  constructor(htmlRenderer) {
    this.htmlRenderer = htmlRenderer;
    this.components = {};
    this.configs = {};
    this.initialized = false;
  }

  /**
   * Last inn komponenter basert på manifest.tml
   */
  async loadComponents() {
    try {
      // Import App og ChatView basert på manifest regler
      const [AppModule, ChatViewModule] = await Promise.all([
        import(baseUrl + 'app.js'),
        import(baseUrl + 'chatview.js')
      ]);

      this.components.App = AppModule.default;
      this.components.ChatView = ChatViewModule.default;

      console.log('✅ Komponenter lastet fra:', baseUrl);
      return true;
    } catch (error) {
      console.error('❌ Feil ved lasting av komponenter:', error);
      return false;
    }
  }

  /**
   * Initialiser App-komponenten
   */
  initializeApp() {
    if (!this.components.App) {
      throw new Error('App-komponent ikke lastet');
    }

    const app = new this.components.App(
      document,
      sessionStorage,
      'https://leinad-st.deno.dev/webhook',
      'data_collection_name'
    );

    this.configs.app = app;
    return app;
  }

  /**
   * Initialiser ChatView-komponenten
   */
  initializeChatView() {
    if (!this.components.ChatView) {
      throw new Error('ChatView-komponent ikke lastet');
    }

    const chatConfig = {
      container: '#chat',
      theme: 'dark',
      options: {
        aiEndpoint: null,
        webhookUrl: null,
        storageKey: 'chat_config',
        commands: {
          rules: {
            description: 'Regelstyring',
            flags: ['--add', '--list'],
            params: { scope: 'global' },
            fetchOptions: async (ctx) => {
              return [{ name: 'Rule A' }, { name: 'Rule B' }];
            },
            render: (ctx) => {
              const rows = (ctx.options || []).map((r, i) =>
                `<tr><td class="px-2 py-1">${i + 1}</td><td class="px-2 py-1">${r.name}</td></tr>`
              ).join('');
              return `
                <div class="text-sm">
                  <h3 class="font-bold mb-2">Regler (${ctx.params.scope})</h3>
                  <table class="table-auto text-left text-xs border">
                    <thead><tr><th>#</th><th>Navn</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="2" class="px-2 py-1">Ingen</td></tr>'}</tbody>
                  </table>
                </div>
              `;
            },
            action: (ctx) => {
              if (ctx.flags.includes('--add')) ctx.send('Legger til regel...');
            }
          }
        }
      },
      callbacks: {
        onInit: () => console.log('ChatView klar'),
        onSend: (msg) => console.log('Sendt:', msg),
        onReceive: (msg) => console.log('Mottatt:', msg),
        onCommandRun: (cmd, ctx) => console.log('Kommando:', cmd, ctx),
        onError: (err) => console.error('Feil:', err)
      }
    };

    const chat = new this.components.ChatView(chatConfig);
    this.configs.chat = chat;
    return chat;
  }

  /**
   * Setup event listeners og data binding
   */
  setupEventListeners(app, table) {
    // Data change event
    table.addEventListener('dataChange', (event) => {
      console.log('📊 Data changed:', event);
      const collectionName = app.getCollectionName();
      const feedback = document.getElementById('json_feedback');
      if (feedback) {
        feedback.textContent = `📊 ${event.data.length} rows loaded → ${collectionName}`;
        feedback.style.color = '#2563eb';
      }
    });

    // Cell change event
    table.addEventListener('cellChange', (event) => {
      console.log('✏️ Cell changed:', event.key, '=', event.value);
    });

    // Cell blur event (save)
    table.addEventListener('cellBlur', (event) => {
      console.log('💾 Cell saved:', event.key, '=', event.value);
    });

    // Table render event
    table.addEventListener('tableRender', (event) => {
      console.log('🎨 Table rendered with', event.data.length, 'rows');
    });

    // Collection name change
    const collectionInput = document.getElementById('data_collection_name');
    if (collectionInput) {
      collectionInput.addEventListener('change', () => {
        const newName = app.getCollectionName();
        const feedback = document.getElementById('json_feedback');
        if (feedback) {
          feedback.textContent = `📝 Collection changed to: ${newName}`;
          feedback.style.color = '#f59e0b';
        }
      });
    }
  }

  /**
   * Hovedinitialiseringsmetode
   */
  async initialize() {
    if (this.initialized) {
      console.warn('ComponentInitializer allerede initialisert');
      return this.configs;
    }

    try {
      // 1. Last komponenter
      const loaded = await this.loadComponents();
      if (!loaded) throw new Error('Kunne ikke laste komponenter');

      // 2. Initialiser App
      const app = this.initializeApp();

      // 3. Vent på DOM ready
      await new Promise(resolve => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', resolve);
        } else {
          resolve();
        }
      });

      // 4. Initialiser UI med sample data
      const sampleData = [
        { navn: 'Alice', status: 'Aktiv', frist: '2025-10-20' },
        { navn: 'Bob', status: 'Venter', frist: '2025-10-25' },
        { navn: 'Charlie', status: 'Ferdig', frist: '2025-10-15' },
      ];

      const ui = app.ui(sampleData);
      const table = ui.table;

      // 5. Setup event listeners
      this.setupEventListeners(app, table);

      // 6. Initialiser ChatView
      const chat = this.initializeChatView();

      // 7. Eksporter til window for console access
      window.app = app;
      window.table = table;
      window.chat = chat;
      window.exportData = () => app.exportTableData();
      window.loadFromStorage = () => app.loadFromStorage();

      this.initialized = true;
      console.log('✅ Chat App fullstendig initialisert!');
      console.log('Tilgjengelige kommandoer:');
      console.log('  exportData() - Eksporter tabell som JSON');
      console.log('  loadFromStorage() - Last data fra storage');
      console.log('  app.getCollectionName() - Få gjeldende collection');

      return this.configs;

    } catch (error) {
      console.error('❌ Feil ved initialisering:', error);
      throw error;
    }
  }
}

/**
 * Hovedklasse som kombinerer HTML rendering og component initialization
 */
class ChatAppRenderer {
  constructor(config = {}) {
    this.htmlRenderer = new HtmlRenderer(config);
    this.componentInitializer = new ComponentInitializer(this.htmlRenderer);
  }

  /**
   * Render og initialiser komplett chat app
   */
  async render(containerId = null) {
    try {
      // 1. Render HTML struktur
      if (containerId) {
        this.htmlRenderer.injectIntoContainer(containerId);
      } else {
        document.body.innerHTML = this.htmlRenderer.renderMainStructure();
      }

      // 2. Initialiser komponenter
      await this.componentInitializer.initialize();

      return {
        htmlRenderer: this.htmlRenderer,
        componentInitializer: this.componentInitializer,
        configs: this.componentInitializer.configs
      };

    } catch (error) {
      console.error('❌ Feil ved rendering av chat app:', error);
      throw error;
    }
  }

  /**
   * Få komplett HTML dokument som string
   */
  getDocumentHtml() {
    return this.htmlRenderer.renderDocument();
  }
}

// Eksporter klasser
export { HtmlRenderer, ComponentInitializer, ChatAppRenderer };
export default ChatAppRenderer;