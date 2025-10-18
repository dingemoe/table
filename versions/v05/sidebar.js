class Sidebar {
  constructor(config = {}) {
    this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
    this.items = config.items || [];
    this.theme = config.theme || 'light'; // 'light' eller 'dark'
    this.width = config.width || 'w-64';
    this.position = config.position || 'left'; // 'left' eller 'right'
    this.callbacks = config.callbacks || {};
    this.activeIndex = null;

    this._init();
  }

  _init() {
    if (!this.container) throw new Error('SidebarExplorer: container er påkrevd');

    this.sidebar = document.createElement('nav');
    this.sidebar.className = this._sidebarClass();

    this.list = document.createElement('ul');
    this.list.className = 'flex flex-col';

    this.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = this._itemClass(false);
      li.dataset.index = i;

      li.innerHTML = `
        <span class="mr-2">${item.icon || '📁'}</span>
        <span>${item.name}</span>
      `;

      li.addEventListener('click', () => this._select(i));
      this.list.appendChild(li);
    });

    this.sidebar.appendChild(this.list);
    this.container.appendChild(this.sidebar);

    if (typeof this.callbacks.onInit === 'function') {
      this.callbacks.onInit(this.getState());
    }
  }

  _sidebarClass() {
    const base = `flex-shrink-0 ${this.width} h-full overflow-y-auto border-r`;
    const theme = this.theme === 'dark'
      ? 'bg-gray-900 text-white border-gray-700'
      : 'bg-white text-gray-800 border-gray-200';
    const position = this.position === 'right' ? 'order-last' : '';
    return `${base} ${theme} ${position}`;
  }

  _itemClass(active) {
    const base = 'flex items-center px-4 py-2 cursor-pointer transition-colors';
    const theme = this.theme === 'dark'
      ? active ? 'bg-gray-700 text-white' : 'hover:bg-gray-800'
      : active ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100';
    return `${base} ${theme}`;
  }

  _select(index) {
    if (index === this.activeIndex) return;
    this.activeIndex = index;

    [...this.list.children].forEach((li, i) => {
      li.className = this._itemClass(i === index);
    });

    const item = this.items[index];
    if (typeof this.callbacks.onSelect === 'function') {
      this.callbacks.onSelect(index, item);
    }
  }

  getState() {
    return this.items.map((item, i) => ({
      name: item.name,
      icon: item.icon,
      active: i === this.activeIndex
    }));
  }

  addItem(item) {
    const i = this.items.length;
    this.items.push(item);

    const li = document.createElement('li');
    li.className = this._itemClass(false);
    li.dataset.index = i;

    li.innerHTML = `<span class="mr-2">${item.icon || '📁'}</span><span>${item.name}</span>`;
    li.addEventListener('click', () => this._select(i));
    this.list.appendChild(li);
  }

  setTheme(theme) {
    this.theme = theme;
    this.sidebar.className = this._sidebarClass();
    [...this.list.children].forEach((li, i) => {
      li.className = this._itemClass(i === this.activeIndex);
    });
  }
}
export default Sidebar;