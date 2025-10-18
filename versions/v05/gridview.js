class GridView {
  constructor(config = {}) {
    this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
    this.items = config.items || [];
    this.columns = config.columns || 3;
    this.theme = config.theme || 'light'; // 'light' eller 'dark'
    this.itemClass = config.itemClass || '';
    this.callbacks = config.callbacks || {};

    this._init();
  }

  _init() {
    if (!this.container) throw new Error('GridView: container er påkrevd');

    this.container.className = this._gridClass();

    this.items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = this._itemStyle();
      card.dataset.index = i;

      card.innerHTML = `
        <div class="text-3xl mb-2">${item.icon || '📦'}</div>
        <div class="font-semibold mb-1">${item.title || ''}</div>
        <div class="text-sm">${item.html || ''}</div>
      `;

      card.addEventListener('click', () => {
        if (typeof this.callbacks.onItemClick === 'function') {
          this.callbacks.onItemClick(i, item);
        }
      });

      this.container.appendChild(card);
    });

    if (typeof this.callbacks.onInit === 'function') {
      this.callbacks.onInit(this.getState());
    }
  }

  _gridClass() {
    const theme = this.theme === 'dark'
      ? 'bg-gray-900 text-white'
      : 'bg-white text-gray-800';

    return `grid grid-cols-${this.columns} gap-4 p-4 ${theme}`;
  }

  _itemStyle() {
    const base = 'p-4 rounded shadow hover:shadow-md cursor-pointer transition-all';
    const theme = this.theme === 'dark'
      ? 'bg-gray-800 hover:bg-gray-700'
      : 'bg-gray-100 hover:bg-gray-200';
    return `${base} ${theme} ${this.itemClass}`;
  }

  getState() {
    return this.items.map((item, i) => ({
      title: item.title,
      icon: item.icon,
      html: item.html,
      active: false
    }));
  }

  addItem(item) {
    this.items.push(item);
    this._init(); // re-render
  }

  setTheme(theme) {
    this.theme = theme;
    this.container.className = this._gridClass();
    [...this.container.children].forEach((card) => {
      card.className = this._itemStyle();
    });
  }
}
export default GridView;
