// SplitView.js
class SplitView {
  constructor(config = {}) {
    this.elem = typeof config.elem === 'string' ? document.querySelector(config.elem) : config.elem;
    this.views = config.views || [];
    this.callbacks = config.callbacks || {};
    this.orientation = config.orientation || 'horizontal'; // 'horizontal' eller 'vertical'
    this.gutterSize = config.gutterSize || 8;

    this._init();
  }

  _init() {
    if (!this.elem) throw new Error('SplitView: elem er påkrevd');

    this.elem.classList.add('flex', 'overflow-hidden');
    this.elem.classList.add(this.orientation === 'horizontal' ? 'flex-row' : 'flex-col');

    this.panels = [];

    this.views.forEach((view, i) => {
      const panel = document.createElement('div');
      panel.className = `overflow-auto ${view.class || ''}`;
      panel.dataset.name = view.name || `panel-${i}`;
      panel.innerHTML = view.html || '';

      const size = view.size || 1 / this.views.length;
      this._applySize(panel, size);

      this.panels.push(panel);
      this.elem.appendChild(panel);

      if (i < this.views.length - 1) {
        const gutter = document.createElement('div');
        gutter.className = `bg-gray-300 ${this.orientation === 'horizontal' ? 'cursor-col-resize w-2' : 'cursor-row-resize h-2'}`;
        gutter.addEventListener('mousedown', (e) => this._startDrag(e, i));
        this.elem.appendChild(gutter);
      }
    });

    if (typeof this.callbacks.onInit === 'function') {
      this.callbacks.onInit(this.getState());
    }
  }

  _applySize(panel, ratio) {
    const percent = `${ratio * 100}%`;
    if (this.orientation === 'horizontal') {
      panel.style.width = percent;
    } else {
      panel.style.height = percent;
    }
  }

  _startDrag(e, index) {
    e.preventDefault();
    this.dragIndex = index;
    this.startPos = this.orientation === 'horizontal' ? e.clientX : e.clientY;
    this.startSizes = this.panels.map(p => this.orientation === 'horizontal' ? p.offsetWidth : p.offsetHeight);
    this.totalSize = this.startSizes.reduce((a, b) => a + b, 0);

    document.addEventListener('mousemove', this._onDrag);
    document.addEventListener('mouseup', this._endDrag);
  }

  _onDrag = (e) => {
    const delta = (this.orientation === 'horizontal' ? e.clientX : e.clientY) - this.startPos;
    const newSizeA = this.startSizes[this.dragIndex] + delta;
    const newSizeB = this.startSizes[this.dragIndex + 1] - delta;

    const ratioA = newSizeA / (newSizeA + newSizeB);
    const ratioB = 1 - ratioA;

    this._applySize(this.panels[this.dragIndex], ratioA * (newSizeA + newSizeB) / this.totalSize);
    this._applySize(this.panels[this.dragIndex + 1], ratioB * (newSizeA + newSizeB) / this.totalSize);

    if (typeof this.callbacks.onResize === 'function') {
      this.callbacks.onResize(this.getState());
    }
  };

  _endDrag = () => {
    document.removeEventListener('mousemove', this._onDrag);
    document.removeEventListener('mouseup', this._endDrag);
  };

  getState() {
    return this.panels.map((p, i) => ({
      name: p.dataset.name,
      size: this.orientation === 'horizontal' ? p.offsetWidth / this.elem.offsetWidth : p.offsetHeight / this.elem.offsetHeight,
      html: p.innerHTML,
      class: p.className
    }));
  }

  setView(index, { html, className, size }) {
    const panel = this.panels[index];
    if (!panel) return;

    if (html !== undefined) panel.innerHTML = html;
    if (className !== undefined) panel.className = className;
    if (size !== undefined) this._applySize(panel, size);

    if (typeof this.callbacks.onViewChange === 'function') {
      this.callbacks.onViewChange(index, this.getState()[index]);
    }
  }
}
export default SplitView;