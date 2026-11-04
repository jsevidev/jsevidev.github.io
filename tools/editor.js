const DATA_URL = '../data/data.json';
const SAVE_URL = '/api/save-data';
const UPLOAD_URL = '/api/upload-image';
const EDITOR_API = '/api/editor';
const DRAFT_KEY = 'portfolio-editor-draft-v1';
const TYPES = [
  { value: 'school', label: 'School / coursework' },
  { value: 'personal', label: 'Personal' },
  { value: 'workshop', label: 'Workshop / event' }
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const slug = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'project';

const lines = (text) =>
  String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

const stackFrom = (text) =>
  String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const stackTo = (arr) => (arr || []).join(', ');

let state = emptyState();
let tab = 'projects';
let projectIndex = 0;
let idTouched = false;
let saveTimer;

function emptyState() {
  return {
    profile: { name: '', pitch: '', about: '', github: '', email: '', linkedin: '' },
    certs: { text: '', url: '' },
    skills: [],
    projects: []
  };
}

function defaultProject() {
  return {
    id: '',
    title: '',
    type: 'school',
    featured: false,
    date: '',
    summary: '',
    stack: [],
    note: '',
    links: { demo: '', repo: '' },
    images: [],
    case: { problem: '', role: '', hard: [] },
    _showCase: false
  };
}

function normalizeLoaded(data) {
  const d = structuredClone(data);
  d.profile ||= emptyState().profile;
  d.certs ||= emptyState().certs;
  d.skills ||= [];
  d.projects ||= [];
  d.projects.forEach((p) => {
    p.links ||= { demo: '', repo: '' };
    p.stack ||= [];
    p.images ||= [];
    if (p.case) {
      p._showCase = true;
      p.case.hard ||= [];
    } else {
      p.case = { problem: '', role: '', hard: [] };
      p._showCase = false;
    }
  });
  return d;
}

function projectToJson(p) {
  const out = {
    id: p.id.trim(),
    title: p.title.trim(),
    type: p.type,
    summary: p.summary.trim(),
    stack: p.stack.filter(Boolean)
  };
  if (p.featured) out.featured = true;
  if (p.date?.trim()) out.date = p.date.trim();
  if (p.note?.trim()) out.note = p.note.trim();
  out.links = {
    demo: (p.links.demo || '').trim(),
    repo: (p.links.repo || '').trim()
  };
  if (p.images?.length) out.images = p.images;
  if (p._showCase && (p.case.problem.trim() || p.case.role.trim() || p.case.hard.length)) {
    out.case = {
      problem: p.case.problem.trim(),
      role: p.case.role.trim(),
      hard: p.case.hard.filter(Boolean)
    };
  }
  return out;
}

function toExport() {
  const projects = state.projects.map(projectToJson).filter((p) => p.id && p.title);
  const used = new Set();
  for (const p of projects) {
    if (used.has(p.id)) throw new Error(`Duplicate project id: ${p.id}`);
    used.add(p.id);
  }
  return {
    profile: { ...state.profile },
    certs: { ...state.certs },
    skills: state.skills
      .map((s) => ({
        name: s.name.trim(),
        projects: (s.projects || []).filter(Boolean)
      }))
      .filter((s) => s.name),
    projects
  };
}

function scheduleDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch (e) {}
  }, 400);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function loadFromServer() {
  const r = await fetch(DATA_URL);
  if (!r.ok) throw new Error('Could not load data/data.json');
  state = normalizeLoaded(await r.json());
  projectIndex = Math.min(projectIndex, Math.max(0, state.projects.length - 1));
  idTouched = false;
  render();
  toast('Loaded data/data.json');
}

function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeLoaded(JSON.parse(reader.result));
      projectIndex = 0;
      idTouched = false;
      render();
      toast('Imported JSON file');
    } catch (e) {
      toast('Invalid JSON file');
    }
  };
  reader.readAsText(file);
}

function flushForm() {
  if (tab === 'projects') readProjectFromForm();
}

let canSaveToDisk = false;
let canUploadImages = false;

async function probeSaveServer() {
  canSaveToDisk = false;
  canUploadImages = false;
  const badge = $('#server-status');
  try {
    const r = await fetch(EDITOR_API);
    if (!r.ok) {
      badge && ((badge.textContent = 'Dev server not detected'), (badge.className = 'status err'));
      return false;
    }
    const j = await r.json();
    canSaveToDisk = !!j.save;
    canUploadImages = !!j.upload;
    if (badge) {
      if (canSaveToDisk && canUploadImages) {
        badge.textContent = 'Dev server connected';
        badge.className = 'status ok';
      } else if (canSaveToDisk) {
        badge.textContent = 'Old server — restart dev_server.py';
        badge.className = 'status err';
      } else {
        badge.textContent = 'Dev server not detected';
        badge.className = 'status err';
      }
    }
    $('#btn-save')?.setAttribute('title', canSaveToDisk ? 'Write data/data.json on disk' : 'Start dev_server.py first');
    return canSaveToDisk && canUploadImages;
  } catch (e) {
    badge && ((badge.textContent = 'Dev server not detected'), (badge.className = 'status err'));
    return false;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result;
      if (typeof s !== 'string') return reject(new Error('read failed'));
      resolve(s.split(',', 2)[1] || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Shrink large screenshots so upload stays fast and under server limits. */
async function prepareImageForUpload(file) {
  const rawType = (file.type || '').toLowerCase();
  if (rawType && !rawType.startsWith('image/')) return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    return null;
  }
  const maxW = 1600;
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) return null;
  return new File([blob], 'screenshot.jpg', { type: 'image/jpeg' });
}

function uploadErrorMessage(status) {
  if (status === 404)
    return 'No upload API — Ctrl+C all servers, run python tools/dev_server.py, open the URL it prints';
  if (status === 413) return 'Image still too large — crop the screenshot and try again';
  if (status === 400) return 'Server rejected the image — try Choose file';
  return `Upload failed (HTTP ${status})`;
}

async function pasteScreenshot() {
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          await uploadImageFile(new File([blob], 'screenshot.png', { type: blob.type || type }));
          return;
        }
      }
      toast('No image on clipboard — use Win+Shift+S, then try again');
    } catch (e) {
      toast('Click the drop zone, then Ctrl+V (or allow clipboard when prompted)');
    }
    return;
  }
  $('#img-drop')?.focus();
  toast('Click here, then press Ctrl+V to paste');
}

async function uploadImageFile(file) {
  if (!file) return;
  if (!canUploadImages) {
    await probeSaveServer();
    if (!canUploadImages) {
      toast(
        canSaveToDisk
          ? 'Old server on this port — stop all Python terminals, run python tools/dev_server.py'
          : 'Start python tools/dev_server.py and open the editor URL it prints'
      );
      return;
    }
  }
  readProjectFromForm();
  const p = state.projects[projectIndex];
  if (!p?.id?.trim()) {
    toast('Set a project id before uploading');
    return;
  }
  const prepared = await prepareImageForUpload(file);
  if (!prepared) {
    toast('Could not read that image — try PNG or JPG');
    return;
  }
  try {
    const data = await fileToBase64(prepared);
    const r = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: p.id.trim(),
        mime: prepared.type || 'image/jpeg',
        data
      })
    });
    if (!r.ok) throw new Error(uploadErrorMessage(r.status));
    const j = await r.json();
    p.images = p.images || [];
    p.images.push(j.path);
    render();
    scheduleDraft();
    toast(`Saved ${j.path}`);
  } catch (e) {
    toast(e.message || 'Upload failed');
  }
}

async function saveJson() {
  flushForm();
  let data;
  try {
    data = toExport();
  } catch (e) {
    toast(e.message || 'Fix errors before saving');
    return;
  }
  if (!canSaveToDisk) {
    toast('Start: python tools/dev_server.py — then open the editor from localhost');
    return;
  }
  try {
    const r = await fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error('Save failed');
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
    toast('Saved to data/data.json');
  } catch (e) {
    toast('Save failed — is python tools/dev_server.py running?');
  }
}

function bindInput(el, on) {
  el.addEventListener('input', on);
  el.addEventListener('change', on);
}

function field(label, hint, inputHtml) {
  return `<label class="field"><span>${label}</span>${hint ? `<small>${hint}</small>` : ''}${inputHtml}</label>`;
}

function renderProfile() {
  const p = state.profile;
  return `<div class="panel"><h2>Profile</h2>
    ${field('Full name', '', `<input data-k="profile.name" value="${esc(p.name)}">`)}
    ${field('One-line pitch', 'Shown under your name on the home page.', `<input data-k="profile.pitch" value="${esc(p.pitch)}">`)}
    ${field('About', 'A short paragraph in the About section.', `<textarea data-k="profile.about">${esc(p.about)}</textarea>`)}
    <div class="grid2">
      ${field('GitHub URL', '', `<input data-k="profile.github" type="url" value="${esc(p.github)}">`)}
      ${field('LinkedIn URL', '', `<input data-k="profile.linkedin" type="url" value="${esc(p.linkedin)}">`)}
    </div>
    ${field('Email', 'Not shown as a button today; keep for your records.', `<input data-k="profile.email" type="email" value="${esc(p.email)}">`)}
  </div>`;
}

function renderCerts() {
  const c = state.certs;
  return `<div class="panel"><h2>Certifications block</h2>
    ${field('Short text', '', `<textarea data-k="certs.text">${esc(c.text)}</textarea>`)}
    ${field('Achievement log URL', '', `<input data-k="certs.url" type="url" value="${esc(c.url)}">`)}
  </div>`;
}

function renderSkills() {
  const ids = state.projects.map((p) => p.id).filter(Boolean);
  const cards = state.skills
    .map(
      (s, i) => `<div class="skill-card" data-skill="${i}">
      <div class="row" style="justify-content:space-between">
        <h3>Skill ${i + 1}</h3>
        <button type="button" class="btn ghost danger" data-del-skill="${i}">Remove</button>
      </div>
      ${field('Name', 'e.g. Laravel and PHP', `<input data-skill-name="${i}" value="${esc(s.name)}">`)}
      <span style="font-size:0.8125rem;font-weight:600;color:var(--mute)">Shown on projects</span>
      <div class="proj-chips">${ids.length ? ids.map((id) => `<label class="check"><input type="checkbox" data-skill-proj="${i}" value="${esc(id)}" ${(s.projects || []).includes(id) ? 'checked' : ''}><span>${esc(id)}</span></label>`).join('') : '<p class="status">Add projects first, then link them here.</p>'}</div>
    </div>`
    )
    .join('');
  return `<div class="panel"><h2>Skills</h2>
    <p class="status" style="margin-bottom:1rem">Each skill lists which projects use it (by project id).</p>
    ${cards || '<p class="status">No skills yet.</p>'}
    <button type="button" class="btn ghost" id="add-skill">Add skill</button>
  </div>`;
}

function renderProjectForm() {
  const p = state.projects[projectIndex];
  if (!p) {
    return `<div class="panel"><p>No project selected.</p><button type="button" class="btn" id="add-project">Add your first project</button></div>`;
  }
  return `<div class="panel">
    <h2>Edit project</h2>
    ${field('Project title', 'Use the real product or deliverable name.', `<input id="p-title" value="${esc(p.title)}">`)}
    <div class="grid2">
      ${field('Project id', 'URL slug for project.html?id=… Auto-filled from title unless you edit this.', `<input id="p-id" value="${esc(p.id)}">`)}
      ${field('Type', 'Filter on the home page: school vs personal vs workshop.', `<select id="p-type">${TYPES.map((t) => `<option value="${t.value}" ${p.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>`)}
    </div>
    ${field('One-line summary', 'What it is + what you did. Shows on every card.', `<textarea id="p-summary">${esc(p.summary)}</textarea>`)}
    ${field('Stack / tags', 'Comma-separated tools (Laravel, Power BI, Figma, Game Dev, …).', `<input id="p-stack" value="${esc(stackTo(p.stack))}">`)}
    <div class="grid2">
      ${field('Live demo / gallery URL', 'Website, Tableau Public, Drive folder, itch.io, etc.', `<input id="p-demo" type="url" value="${esc(p.links.demo)}">`)}
      ${field('GitHub repo URL', 'Optional.', `<input id="p-repo" type="url" value="${esc(p.links.repo)}">`)}
    </div>
    <div class="grid2">
      ${field('Date', 'e.g. May 2026', `<input id="p-date" value="${esc(p.date || '')}">`)}
      ${field('Note', 'Optional small text under the card (e.g. slow cold start).', `<input id="p-note" value="${esc(p.note || '')}">`)}
    </div>
    <label class="check"><input type="checkbox" id="p-featured" ${p.featured ? 'checked' : ''}><span><strong>Featured</strong> — larger card; can link to a case study</span></label>
    ${renderImageUpload(p)}
    ${field('Image paths', 'First path is the card cover. Edit manually if needed.', `<textarea id="p-images">${esc((p.images || []).join('\n'))}</textarea>`)}
    <details class="case" ${p._showCase ? 'open' : ''}>
      <summary>Case study (optional — for flagship projects like a capstone)</summary>
      <label class="check" style="margin-top:0.75rem"><input type="checkbox" id="p-show-case" ${p._showCase ? 'checked' : ''}><span>Include case study on project page</span></label>
      ${field('The problem', '', `<textarea id="p-problem">${esc(p.case.problem)}</textarea>`)}
      ${field('What I built / my role', '', `<textarea id="p-role">${esc(p.case.role)}</textarea>`)}
      ${field('Hard parts', 'One bullet per line.', `<textarea id="p-hard">${esc((p.case.hard || []).join('\n'))}</textarea>`)}
    </details>
    <div class="row" style="margin-top:1rem;justify-content:space-between">
      <button type="button" class="btn ghost danger" id="del-project">Delete project</button>
      <button type="button" class="btn ghost" id="dup-project">Duplicate</button>
    </div>
  </div>`;
}

function renderImageUpload(p) {
  const imgs = p.images || [];
  const thumbs = imgs
    .map(
      (src, i) => `<figure class="img-thumb" data-img-i="${i}">
        <img src="/${esc(src.replace(/^\//, ''))}" alt="" width="160" height="100" loading="lazy">
        <figcaption>${i === 0 ? 'Cover' : `#${i + 1}`}</figcaption>
        <button type="button" class="img-rm" data-rm-img="${i}" title="Remove from project">×</button>
      </figure>`
    )
    .join('');
  return `<div class="img-block">
    <span class="field-label">Card screenshots</span>
    <small class="field-hint">Saved to <code>assets/images/</code> when you upload. Requires <code>dev_server.py</code>.</small>
    <div id="img-drop" class="img-drop" tabindex="0">
      <p><strong>Drop</strong> a file, or use the buttons below. Right-click Paste is normal to stay disabled — use <strong>Ctrl+V</strong> or <strong>Paste screenshot</strong>.</p>
      <div class="row" style="justify-content:center;margin-top:0.5rem">
        <button type="button" class="btn ghost" id="img-paste">Paste screenshot</button>
        <button type="button" class="btn ghost" id="img-pick">Choose file</button>
      </div>
      <input type="file" id="img-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
    </div>
    ${thumbs ? `<div class="img-thumbs">${thumbs}</div>` : ''}
  </div>`;
}

function renderProjects() {
  const list = state.projects
    .map(
      (p, i) => `<li><button type="button" data-pi="${i}" aria-current="${i === projectIndex ? 'true' : 'false'}">${esc(p.title || '(untitled)')}<span class="meta">${esc(p.type)} · ${esc(p.id || 'no id')}</span></button></li>`
    )
    .join('');
  return `<div class="projects-layout">
    <div class="panel">
      <h2>Projects</h2>
      <ul class="proj-list">${list || '<li class="status">No projects yet.</li>'}</ul>
      <button type="button" class="btn" id="add-project" style="width:100%;margin-top:0.75rem">Add project</button>
    </div>
    ${renderProjectForm()}
  </div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function render() {
  $('#panel').innerHTML =
    tab === 'profile'
      ? renderProfile()
      : tab === 'certs'
        ? renderCerts()
        : tab === 'skills'
          ? renderSkills()
          : renderProjects();
  $$('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
  wirePanel();
  scheduleDraft();
}

function readProjectFromForm() {
  const p = state.projects[projectIndex];
  if (!p) return;
  const title = $('#p-title')?.value ?? p.title;
  p.title = title;
  if ($('#p-id')) {
    if (!idTouched) p.id = slug(title);
    else p.id = $('#p-id').value.trim();
  }
  p.type = $('#p-type')?.value ?? p.type;
  p.summary = $('#p-summary')?.value ?? p.summary;
  p.stack = stackFrom($('#p-stack')?.value);
  p.links.demo = $('#p-demo')?.value ?? p.links.demo;
  p.links.repo = $('#p-repo')?.value ?? p.links.repo;
  p.date = $('#p-date')?.value ?? p.date;
  p.note = $('#p-note')?.value ?? p.note;
  p.featured = !!$('#p-featured')?.checked;
  p.images = lines($('#p-images')?.value);
  p._showCase = !!$('#p-show-case')?.checked;
  p.case.problem = $('#p-problem')?.value ?? p.case.problem;
  p.case.role = $('#p-role')?.value ?? p.case.role;
  p.case.hard = lines($('#p-hard')?.value);
}

function wirePanel() {
  $$('[data-k]').forEach((el) => {
    bindInput(el, () => {
      setPath(state, el.dataset.k, el.value);
      scheduleDraft();
    });
  });

  $('#add-skill')?.addEventListener('click', () => {
    state.skills.push({ name: '', projects: [] });
    render();
  });
  $$('[data-del-skill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.skills.splice(+btn.dataset.delSkill, 1);
      render();
    });
  });
  $$('[data-skill-name]').forEach((el) => {
    bindInput(el, () => {
      state.skills[+el.dataset.skillName].name = el.value;
      scheduleDraft();
    });
  });
  $$('[data-skill-proj]').forEach((el) => {
    el.addEventListener('change', () => {
      const i = +el.dataset.skillProj;
      const s = state.skills[i];
      const set = new Set(s.projects || []);
      el.checked ? set.add(el.value) : set.delete(el.value);
      s.projects = [...set];
      scheduleDraft();
    });
  });

  $$('[data-pi]').forEach((btn) => {
    btn.addEventListener('click', () => {
      readProjectFromForm();
      projectIndex = +btn.dataset.pi;
      idTouched = false;
      render();
    });
  });

  const syncProject = () => {
    readProjectFromForm();
    if ($('#p-id') && !idTouched) $('#p-id').value = state.projects[projectIndex].id;
    scheduleDraft();
  };

  ['p-title', 'p-summary', 'p-stack', 'p-demo', 'p-repo', 'p-date', 'p-note', 'p-images', 'p-problem', 'p-role', 'p-hard'].forEach(
    (id) => {
      const el = $('#' + id);
      if (el) bindInput(el, syncProject);
    }
  );
  ['p-type', 'p-featured', 'p-show-case'].forEach((id) => {
    const el = $('#' + id);
    if (el) el.addEventListener('change', () => {
      readProjectFromForm();
      render();
    });
  });
  $('#p-id')?.addEventListener('input', () => {
    idTouched = true;
    syncProject();
  });

  $('#add-project')?.addEventListener('click', () => {
    readProjectFromForm();
    const np = defaultProject();
    np.title = 'New project';
    np.id = slug('new-project-' + (state.projects.length + 1));
    state.projects.push(np);
    projectIndex = state.projects.length - 1;
    idTouched = true;
    render();
  });

  $('#dup-project')?.addEventListener('click', () => {
    readProjectFromForm();
    const copy = structuredClone(state.projects[projectIndex]);
    copy.title += ' (copy)';
    copy.id = slug(copy.title);
    copy.featured = false;
    state.projects.push(copy);
    projectIndex = state.projects.length - 1;
    idTouched = true;
    render();
  });

  $('#del-project')?.addEventListener('click', () => {
    if (!confirm('Delete this project?')) return;
    state.projects.splice(projectIndex, 1);
    projectIndex = Math.max(0, projectIndex - 1);
    idTouched = false;
    render();
  });

  const drop = $('#img-drop');
  const fileIn = $('#img-file');
  $('#img-paste')?.addEventListener('click', () => pasteScreenshot());
  $('#img-pick')?.addEventListener('click', () => fileIn?.click());
  drop?.addEventListener('click', () => drop.focus());
  fileIn?.addEventListener('change', () => {
    const f = fileIn.files?.[0];
    if (f) uploadImageFile(f);
    fileIn.value = '';
  });
  drop?.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('drag');
  });
  drop?.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    const f = e.dataTransfer?.files?.[0];
    if (f) uploadImageFile(f);
  });
  drop?.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const f = item.getAsFile();
        if (f) uploadImageFile(f);
        return;
      }
    }
  });
  $$('[data-rm-img]').forEach((btn) => {
    btn.addEventListener('click', () => {
      readProjectFromForm();
      const p = state.projects[projectIndex];
      const i = +btn.dataset.rmImg;
      p.images.splice(i, 1);
      render();
    });
  });
}

function initTabs() {
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (tab === 'projects') readProjectFromForm();
      tab = btn.dataset.tab;
      render();
    });
  });
}

function initActions() {
  $('#btn-reload').addEventListener('click', () => {
    if (!confirm('Reload from data/data.json? Unsaved draft in this tab will be replaced.')) return;
    loadFromServer().catch(() =>
      toast('Run python tools/dev_server.py from the portfolio folder, then open the editor URL')
    );
  });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) loadFromFile(f);
    e.target.value = '';
  });
  $('#btn-save').addEventListener('click', saveJson);
  $('#btn-copy').addEventListener('click', async () => {
    flushForm();
    try {
      await navigator.clipboard.writeText(JSON.stringify(toExport(), null, 2) + '\n');
      toast('Copied JSON to clipboard');
    } catch (e) {
      toast('Copy failed — use Download instead');
    }
  });
  $('#btn-clear-draft').addEventListener('click', () => {
    localStorage.removeItem(DRAFT_KEY);
    toast('Draft cleared');
  });
  document.addEventListener('paste', (e) => {
    if (tab !== 'projects' || !$('#img-drop')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const f = item.getAsFile();
        if (f) uploadImageFile(f);
        return;
      }
    }
  });
}

async function boot() {
  initTabs();
  initActions();
  await probeSaveServer();
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      const useDraft = confirm(
        'Restore your last unsaved editor draft?\n\nOK = use draft\nCancel = load fresh from data/data.json'
      );
      if (useDraft) {
        state = normalizeLoaded(JSON.parse(draft));
        render();
        toast('Restored draft from this browser');
        return;
      }
    }
  } catch (e) {}
  try {
    await loadFromServer();
  } catch (e) {
    state = emptyState();
    render();
    toast('Import data.json or run python tools/dev_server.py');
  }
}

boot();
