class DialButton {
  constructor(config = {}) {
    this.position = config.position || 'bottom-right'; // 'bottom-left', 'top-right', etc.
    this.icon = config.icon || '➕';
    this.content = config.content || '';
    this.container = typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
    this.callbacks = config.callbacks || {};
    this.theme = config.theme || 'light'; // 'light' eller 'dark'
    this.buttonClass = config.buttonClass || '';
    this.contentClass = config.contentClass || '';
    this._init();
  }

  _init() {
    if (!this.container) throw new Error('DialButton: container er påkrevd');

    this.wrapper = document.createElement('div');
    this.wrapper.className = this._positionClass();

    this.button = document.createElement('button');
    this.button.innerHTML = this.icon;
    this.button.className = this._buttonStyle();
    this.button.addEventListener('click', () => this._toggle());

    this.contentBox = document.createElement('div');
    this.contentBox.innerHTML = this.content;
    this.contentBox.className = this._contentStyle();
    this.contentBox.style.display = 'none';

    this.wrapper.append(this.button, this.contentBox);
    this.container.appendChild(this.wrapper);

    if (typeof this.callbacks.onInit === 'function') {
      this.callbacks.onInit({ button: this.button, content: this.contentBox });
    }
  }

  _positionClass() {
    const base = 'fixed z-50';
    const map = {
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'top-right': 'top-4 right-4',
      'top-left': 'top-4 left-4'
    };
    return `${base} ${map[this.position] || map['bottom-right']}`;
  }

  _buttonStyle() {
    const base = 'rounded-full p-4 shadow-lg transition-colors';
    const theme = this.theme === 'dark'
      ? 'bg-gray-800 text-white hover:bg-gray-700'
      : 'bg-blue-500 text-white hover:bg-blue-600';
    return `${base} ${theme} ${this.buttonClass}`;
  }

  _contentStyle() {
    const base = 'absolute mt-2 p-4 rounded shadow-lg transition-all';
    const theme = this.theme === 'dark'
      ? 'bg-gray-900 text-white border border-gray-700'
      : 'bg-white text-gray-800 border border-gray-300';
    return `${base} ${theme} ${this.contentClass}`;
  }

  _toggle() {
    const visible = this.contentBox.style.display === 'block';
    this.contentBox.style.display = visible ? 'none' : 'block';

    if (typeof this.callbacks.onClick === 'function') {
      this.callbacks.onClick({ visible: !visible });
    }
  }

  setContent(html) {
    this.contentBox.innerHTML = html;
  }

  setIcon(icon) {
    this.button.innerHTML = icon;
  }

  setTheme(theme) {
    this.theme = theme;
    this.button.className = this._buttonStyle();
    this.contentBox.className = this._contentStyle();
  }
}
export default DialButton;
