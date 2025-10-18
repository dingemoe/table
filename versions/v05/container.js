class Container {
  constructor(config = {}) {
    this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
    this.options = Object.assign({
      header: true,
      footer: true,
      theme: 'light' // 'light' eller 'dark'
    }, config.options || {});
    this.content = config.content || {};
    this.callbacks = config.callbacks || {};

    this._init();
  }

  _init() {
    if (!this.container) throw new Error('FlexContainer: container er påkrevd');

    this.container.className = this._baseClass();

    if (this.options.header) {
      this.header = document.createElement('header');
      this.header.className = this._sectionClass('header');
      this.header.innerHTML = this.content.header || '';
      this.container.appendChild(this.header);

      if (typeof this.callbacks.onHeader === 'function') {
        this.callbacks.onHeader(this.header);
      }
    }

    this.body = document.createElement('main');
    this.body.className = this._sectionClass('body');
    this.body.innerHTML = this.content.body || '';
    this.container.appendChild(this.body);

    if (typeof this.callbacks.onBody === 'function') {
      this.callbacks.onBody(this.body);
    }

    if (this.options.footer) {
      this.footer = document.createElement('footer');
      this.footer.className = this._sectionClass('footer');
      this.footer.innerHTML = this.content.footer || '';
      this.container.appendChild(this.footer);

      if (typeof this.callbacks.onFooter === 'function') {
        this.callbacks.onFooter(this.footer);
      }
    }
  }

  _baseClass() {
    const theme = this.options.theme === 'dark'
      ? 'bg-gray-900 text-white'
      : 'bg-white text-gray-800';
    return `flex flex-col h-full w-full ${theme}`;
  }

  _sectionClass(type) {
    const base = 'px-4 py-3 border';
    const theme = this.options.theme === 'dark'
      ? 'border-gray-700'
      : 'border-gray-300';

    const map = {
      header: `border-b ${base}`,
      body: `flex-1 overflow-auto ${base}`,
      footer: `border-t ${base}`
    };

    return `${map[type]} ${theme}`;
  }

  setContent(section, html) {
    if (section === 'header' && this.header) this.header.innerHTML = html;
    if (section === 'body' && this.body) this.body.innerHTML = html;
    if (section === 'footer' && this.footer) this.footer.innerHTML = html;
  }

  setTheme(theme) {
    this.options.theme = theme;
    this.container.className = this._baseClass();
    if (this.header) this.header.className = this._sectionClass('header');
    if (this.body) this.body.className = this._sectionClass('body');
    if (this.footer) this.footer.className = this._sectionClass('footer');
  }
}
export default Container;