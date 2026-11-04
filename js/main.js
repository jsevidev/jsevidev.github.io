const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const root = document.documentElement,
  rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
const tags = (a) => (a || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
const btn = (u, t, c = '') =>
  u ? `<a class="btn ${c}" href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : '';
const btns = (p) => btn(p.links?.demo, 'Live Demo →');
const io = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.1 }
);
const reveal = () => $$('.rv:not(.in)').forEach((x) => io.observe(x));
function theme() {
  const b = $('#theme'),
    set = (t) => {
      root.dataset.theme = t;
      b.setAttribute('aria-pressed', t === 'dark');
      $('meta[name=theme-color]').content = t === 'dark' ? '#0e1116' : '#f6f7f9';
    };
  set(root.dataset.theme || 'light');
  b.onclick = () => {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    set(t);
    try {
      localStorage.setItem('theme', t);
    } catch (e) {}
  };
}
function loader(ready) {
  const l = $('#loader'),
    done = () => {
      root.classList.add('ready');
      try {
        sessionStorage.setItem('seen', 1);
      } catch (e) {}
    };
  if (!l || rm || root.classList.contains('seen')) {
    l && l.remove();
    ready.then(done);
    return;
  }
  const bar = $('#ld-bar'),
    t0 = performance.now(),
    min = 1000;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / min);
    bar.style.transform = `scaleX(${p})`;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  Promise.all([ready, new Promise((r) => setTimeout(r, min))]).then(() => {
    l.classList.add('out');
    done();
    setTimeout(() => l.remove(), 600);
  });
}
theme();
const dataP = fetch('data/data.json').then((r) => r.json());
loader(
  Promise.race([
    Promise.all([dataP, document.fonts.ready]).catch(() => {}),
    new Promise((r) => setTimeout(r, 4000))
  ])
);
const foot = (n) => `<footer>© ${new Date().getFullYear()} ${esc(n)}</footer>`;
dataP
  .then((d) => {
    $('#logo').textContent = d.profile.name;
    document.body.dataset.page === 'project' ? project(d) : home(d);
    reveal();
  })
  .catch(() =>
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<p class="err">Could not load data/data.json. Deploy to GitHub Pages, or run: python -m http.server</p>'
    )
  );
const hasCase = (x) =>
  x.case &&
  (String(x.case.problem || '').trim() ||
    String(x.case.role || '').trim() ||
    (x.case.hard || []).some((h) => String(h).trim()));
const cardClass = (x) => {
  if (hasCase(x)) return ' case';
  if (x.featured) return ' big';
  return '';
};
const card = (x, i) =>
  `<article class="card rv${cardClass(x)}" style="--i:${i % 3}"><div class="cover">${x.images?.[0] ? `<img src="${esc(x.images[0])}" alt="" width="640" height="400" loading="lazy" decoding="async">` : esc(x.title[0])}</div><div class="cbody"><span class="pill">${esc(x.type)}</span><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><div>${tags(x.stack)}</div>${x.note ? `<small>${esc(x.note)}</small>` : ''}<div class="row">${hasCase(x) ? `<a class="btn" href="project.html?id=${esc(x.id)}">Read Case Study →</a>` : ''}${btns(x)}</div></div></article>`;
const projectsGridHtml = (list) => {
  const cases = list.filter(hasCase);
  const rest = list.filter((x) => !hasCase(x));
  let html = '';
  if (cases.length)
    html += `<div class="grid grid-cases">${cases.map((x, i) => card(x, i)).join('')}</div>`;
  if (rest.length) html += `<div class="grid">${rest.map((x, i) => card(x, i)).join('')}</div>`;
  return html || '<div class="grid"></div>';
};
function home(d) {
  const p = d.profile,
    P = d.projects;
  $('#name').textContent = p.name;
  $('#pitch').textContent = p.pitch;
  $('#aboutText').textContent = p.about;
  $('#certText').textContent = d.certs.text;
  $('#certLink').href = d.certs.url;
  $('#contactLinks').innerHTML = btn(p.github, 'GitHub') + btn(p.linkedin, 'LinkedIn', 'ghost');
  $('#stats').innerHTML = [
    [P.length, 'Projects'],
    [new Set(P.flatMap((x) => x.stack || [])).size, 'Technologies'],
    [P.filter((x) => x.links?.demo).length, 'Live Demos']
  ]
    .map(([a, b]) => `<div><dt>${b}</dt><dd>${a}</dd></div>`)
    .join('');
  const f = P.find((x) => x.featured && x.images?.[0]);
  if (f) {
    const s = $('#spot');
    s.hidden = false;
    s.href = 'project.html?id=' + f.id;
    s.innerHTML = `<img src="${esc(f.images[0])}" alt="Screenshot of ${esc(f.title)}" width="640" height="400"><span><b>Featured Project</b>${esc(f.title)} →</span>`;
  }
  $('#skillList').innerHTML = d.skills
    .map(
      (s, i) =>
        `<li class="rv" style="--i:${i % 4}"><b>${esc(s.name)}</b><span>${s.projects.map((id) => esc(P.find((q) => q.id === id)?.title || '')).join(', ')}</span></li>`
    )
    .join('');
  const types = ['all', ...new Set(P.map((x) => x.type))];
  const show = (t) => {
    $('#list').innerHTML = projectsGridHtml(P.filter((x) => t === 'all' || x.type === t));
    $$('#filters button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === t));
    reveal();
  };
  $('#filters').innerHTML = types
    .map((t) => `<button class="chip" data-t="${t}" aria-pressed="false">${t}</button>`)
    .join('');
  $('#filters').onclick = (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    show(t);
    history.replaceState(null, '', t === 'all' ? location.pathname : '?type=' + t);
  };
  const q = new URLSearchParams(location.search).get('type');
  show(types.includes(q) ? q : 'all');
  $('#foot').innerHTML = `© ${new Date().getFullYear()} ${esc(p.name)}`;
  const links = $$('.menu a'),
    so = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting)
            links.forEach((a) => a.setAttribute('aria-current', a.hash === '#' + e.target.id));
        }),
      { rootMargin: '-40% 0px -55% 0px' }
    );
  $$('main section').forEach((s) => so.observe(s));
}
function project(d) {
  const p = d.projects.find((x) => x.id === new URLSearchParams(location.search).get('id')),
    m = $('#main');
  if (!p || !p.case) {
    m.innerHTML =
      '<div class="wrap"><p>Project not found. <a href="index.html#projects">Back to projects</a></p></div>';
    return;
  }
  document.title = p.title + ' | ' + d.profile.name;
  const c = p.case;
  m.innerHTML = `<div class="wrap"><a class="back rv" href="index.html#projects">← All Projects</a><span class="pill rv" style="display:block;width:max-content;margin-top:1rem">${esc(p.type)}</span><h1 class="rv" style="--i:1">${esc(p.title)}</h1><p class="lead rv" style="--i:2">${esc(p.summary)}</p>
  <div class="gallery rv">${(p.images || []).map((s, n) => `<a href="${esc(s)}" target="_blank" rel="noopener" aria-label="Open full screenshot ${n + 1}"><img src="${esc(s)}" alt="${esc(p.title)} screenshot ${n + 1} of ${p.images.length}" width="640" height="400" loading="lazy" decoding="async"></a>`).join('')}</div>
  <div class="case-grid"><div class="prose rv"><h2>The Problem</h2><p>${esc(c.problem)}</p><h2>What I Built</h2><p>${esc(c.role)}</p><h2>Hard Parts</h2><ul>${c.hard.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
  <aside class="glance panel rv"><h3>At a Glance</h3><dl><dt>Type</dt><dd style="text-transform:capitalize">${esc(p.type)}</dd>${p.date ? `<dt>Date</dt><dd>${esc(p.date)}</dd>` : ''}<dt>Stack</dt><dd>${tags(p.stack)}</dd></dl><div class="row">${btns(p)}</div></aside></div>${foot(d.profile.name)}</div>`;
}
