/* =====================================
   State & Globals
===================================== */

let state = loadState();
let undoStack = [];

const lists = document.querySelectorAll('.list');
const input = document.getElementById('new-card-input');

let activeCard = null;
let startColumn = null;

/* =====================================
   Persistence
===================================== */

function saveState(pushUndo = true) {
  if (pushUndo) undoStack.push(JSON.stringify(state));
  localStorage.setItem('kanban-state', JSON.stringify(state));
}

function loadState() {
  return JSON.parse(localStorage.getItem('kanban-state')) || {
    backlog: [],
    todo: [],
    "in-progress": [],
    done: []
  };
}

/* =====================================
   Rendering
===================================== */

function render() {
  lists.forEach(list => {
    const id = list.id;

    list.querySelectorAll('.card').forEach(c => c.remove());

    state[id].forEach(card => {
      list.appendChild(createCard(card));
    });

    updateAnalytics(list);
  });
}

function createCard(card) {
  const el = document.createElement('div');
  el.className = `card priority-${card.priority.toLowerCase()}`;
  el.dataset.id = card.id;
  el.tabIndex = 0;

  el.innerHTML = `
    <button class="delete-button">×</button>
    <div class="title" contenteditable="true">${card.text}</div>
    <div class="meta">
      ${card.priority} • ${new Date(card.created).toLocaleDateString()}
    </div>
  `;

  attachEvents(el);
  return el;
}

/* =====================================
   Event Binding
===================================== */

function attachEvents(card) {
  const title = card.querySelector('.title');
  const deleteBtn = card.querySelector('.delete-button');

  /* Inline editing */
  title.onblur = () => {
    updateCard(card.dataset.id, { text: title.textContent.trim() });
  };

  title.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      title.blur();
    }
    if (e.key === 'Escape') {
      render();
    }
  };

  /* Keyboard shortcuts */
  card.onkeydown = e => {
    if (['1', '2', '3'].includes(e.key)) {
      updateCard(card.dataset.id, {
        priority:
          e.key === '1'
            ? 'High'
            : e.key === '2'
            ? 'Normal'
            : 'Low'
      });
    }

    if (e.key === 'Delete') {
      removeCard(card.dataset.id);
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const order = ['backlog', 'todo', 'in-progress', 'done'];
      const current = findCard(card.dataset.id).list;
      const index = order.indexOf(current);
      const target =
        e.key === 'ArrowRight' ? order[index + 1] : order[index - 1];

      if (target) moveCard(card.dataset.id, target);
    }
  };

  /* Delete button — FIXED */
  deleteBtn.onclick = () => removeCard(card.dataset.id);
  deleteBtn.onpointerdown = e => e.stopPropagation();

  /* Pointer dragging */
  card.addEventListener('pointerdown', pointerStart);
}

/* =====================================
   Pointer Dragging
===================================== */

function pointerStart(e) {
  // Prevent drag when clicking delete button
  if (e.target.closest('.delete-button')) return;

  // Prevent drag when editing text
  if (e.target.isContentEditable) return;

  activeCard = e.currentTarget;
  startColumn = activeCard.closest('.list').id;

  activeCard.setPointerCapture(e.pointerId);
  activeCard.classList.add('dragging');
}

document.addEventListener('pointermove', e => {
  if (!activeCard) return;

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const list = el?.closest('.list');

  document.querySelectorAll('.list').forEach(l =>
    l.classList.remove('drag-over')
  );

  if (list) list.classList.add('drag-over');
});

document.addEventListener('pointerup', e => {
  if (!activeCard) return;

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const targetList = el?.closest('.list');

  document.querySelectorAll('.list').forEach(l =>
    l.classList.remove('drag-over')
  );

  activeCard.classList.remove('dragging');
  activeCard.releasePointerCapture(e.pointerId);

  if (targetList && targetList.id !== startColumn) {
    moveCard(activeCard.dataset.id, targetList.id);
  }

  activeCard = null;
  startColumn = null;
});

/* =====================================
   Analytics & WIP
===================================== */

function updateAnalytics(list) {
  const count = state[list.id].length;
  const limit = Number(list.dataset.wip);
  const meta = list.querySelector('.meta');

  meta.textContent = `${count}/${limit}`;
  meta.style.color = count > limit ? 'red' : '';
}

function canAccept(listId) {
  const limit = Number(document.getElementById(listId).dataset.wip);
  return state[listId].length < limit;
}

/* =====================================
   State Mutations
===================================== */

function findCard(cardId) {
  for (const col in state) {
    const card = state[col].find(c => c.id === cardId);
    if (card) return { card, list: col };
  }
}

function updateCard(id, updates) {
  saveState();

  for (const col in state) {
    const card = state[col].find(c => c.id === id);
    if (card) Object.assign(card, updates);
  }

  render();
}

function moveCard(cardId, targetList) {
  if (!canAccept(targetList)) {
    alert('WIP limit reached');
    return;
  }

  saveState();

  let moved;

  for (const col in state) {
    const index = state[col].findIndex(c => c.id === cardId);
    if (index !== -1) {
      moved = state[col][index];
      state[col].splice(index, 1);
      break;
    }
  }

  if (!moved) return;

  state[targetList].push(moved);
  render();
}

function removeCard(id) {
  saveState();

  for (const col in state) {
    state[col] = state[col].filter(c => c.id !== id);
  }

  render();
}

/* =====================================
   Add New Card
===================================== */

input.onkeydown = e => {
  if (e.key !== 'Enter') return;
  if (!input.value.trim()) return;

  state.backlog.push({
    id: crypto.randomUUID(),
    text: input.value.trim(),
    priority: 'Normal',
    created: new Date().toISOString()
  });

  input.value = '';
  saveState();
  render();
};

/* =====================================
   Undo
===================================== */

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    const prev = undoStack.pop();
    if (prev) {
      state = JSON.parse(prev);
      saveState(false);
      render();
    }
  }
});

/* =====================================
   Export / Import
===================================== */

document.getElementById('export-btn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kanban-board.json';
  a.click();
};

document.getElementById('import-btn').onclick = () =>
  document.getElementById('import-input').click();

document.getElementById('import-input').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  file.text().then(text => {
    state = JSON.parse(text);
    saveState(false);
    render();
  });
};

/* =====================================
   Dark Mode
===================================== */

const toggle = document.getElementById('theme-toggle');
const root = document.documentElement;

const savedTheme = localStorage.getItem('theme');
if (savedTheme) root.setAttribute('data-theme', savedTheme);

toggle.onclick = () => {
  const next =
    root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
};

/* =====================================
   Init
===================================== */

render();