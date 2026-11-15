/* BKO: Balmer Keys Orders */
(function () {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => $('#app');
const STATUS = [['go-to', 'Go-to'], ['good', 'Good'], ['mixed', 'Mixed'], ['new', 'Not sorted yet'], ['avoid', "Don't order again"]];
const CUISINES = ['Thai', 'Pizza', 'Chinese', 'Vietnamese', 'Indian', 'Italian', 'Burgers', 'Pub', 'Kebabs', 'Turkish', 'Chicken', 'Japanese', 'Mexican', 'Wraps'];
const MODES = ['Pick up', 'Delivery', 'Eat in'];
const modesOf = g => !g ? [] : g === 'Both' ? ['Pick up', 'Delivery'] : g.split(',').map(x => x.trim()).filter(Boolean);
const APPS = ['Uber Eats', 'DoorDash', 'Menulog', 'Direct'];
const VERDICT = { go: '★ Order again', ok: 'OK', no: '✕ Skip' };
const ICON = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B1B17" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  cam: c => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></svg>`,
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>',
  menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>'
};
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); const dt = new Date(y, m - 1, d);
  const s = dt.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }); return y === new Date().getFullYear() ? s : s + ' ' + y; };
const back = href => `<a class="back" href="${href || '#/'}" aria-label="Back">${ICON.back}</a>`;
const back_js = () => `<button class="back" onclick="history.back()" aria-label="Back">${ICON.back}</button>`;
const mini = '<a href="#/" class="board mini" aria-label="Home"><span class="big">BKO</span></a>';
const ticks = d => `<span class="ticks">${d.fav_tom ? '<span class="t T">T</span>' : ''}${d.fav_caley ? '<span class="t C">C</span>' : ''}</span>`;
const vchip = v => v ? `<span class="v ${v}">${VERDICT[v]}</span>` : '';
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- state ---------- */
let sb = null;            // supabase client
let me = null;            // { user_id, name, email }
let db = { members: [], places: [], dishes: [], orders: [], order_items: [], scores: [], photos: [] };
const urlCache = {};
let urlCacheAt = Date.now();

/* ---------- data ---------- */
const api = window.BKO_DEMO_API || {
  async init() {
    sb = window.supabase.createClient(BKO_CONFIG.supabaseUrl, BKO_CONFIG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  },
  async session() { const { data } = await sb.auth.getSession(); return data.session; },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signOut() { await sb.auth.signOut(); },
  async changePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw error; },
  async load() {
    const q = t => sb.from(t).select('*');
    const [members, places, dishes, orders, order_items, scores, photos] = await Promise.all(
      [q('members'), q('places').order('name'), q('dishes').order('created_at'), q('orders').order('ordered_on', { ascending: false }).order('created_at', { ascending: false }),
       q('order_items'), q('scores'), q('photos').order('created_at', { ascending: false })]);
    for (const r of [members, places, dishes, orders, order_items, scores, photos]) if (r.error) throw r.error;
    return { members: members.data, places: places.data, dishes: dishes.data, orders: orders.data, order_items: order_items.data, scores: scores.data, photos: photos.data };
  },
  async uid() { const { data } = await sb.auth.getUser(); return data.user && data.user.id; },
  async insert(table, row) { const { data, error } = await sb.from(table).insert(row).select().single(); if (error) throw error; return data; },
  async insertMany(table, rows) { if (!rows.length) return []; const { data, error } = await sb.from(table).insert(rows).select(); if (error) throw error; return data; },
  async update(table, id, fields) { const { error } = await sb.from(table).update(fields).eq('id', id); if (error) throw error; },
  async remove(table, id) { const { error } = await sb.from(table).delete().eq('id', id); if (error) throw error; },
  async upsertScore(row) { const { error } = await sb.from('scores').upsert(row, { onConflict: 'order_id,user_id' }); if (error) throw error; },
  async upload(path, blob) { const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }); if (error) throw error; },
  async removeFiles(paths) { if (paths.length) await sb.storage.from('photos').remove(paths); },
  async signedUrls(paths) {
    const { data, error } = await sb.storage.from('photos').createSignedUrls(paths, 60 * 60 * 6); if (error) throw error;
    const out = {}; data.forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; }); return out;
  }
};

async function refresh() { db = await api.load(); await warmUrls(); }
async function warmUrls() {
  if (Date.now() - urlCacheAt > 5 * 3600 * 1000) { for (const k in urlCache) delete urlCache[k]; urlCacheAt = Date.now(); }
  const paths = new Set();
  db.places.forEach(p => p.cover_path && paths.add(p.cover_path));
  db.dishes.forEach(d => d.photo_path && paths.add(d.photo_path));
  db.photos.forEach(p => paths.add(p.path));
  const need = [...paths].filter(p => !urlCache[p]);
  for (let i = 0; i < need.length; i += 100) Object.assign(urlCache, await api.signedUrls(need.slice(i, i + 100)));
}
const img = path => path && urlCache[path] ? `background-image:url('${urlCache[path]}')` : '';

/* lookups */
const place = id => db.places.find(p => p.id === id);
const dishesOf = pid => db.dishes.filter(d => d.place_id === pid);
const photosOf = pid => db.photos.filter(p => p.place_id === pid);
const order = id => db.orders.find(o => o.id === id);
const orderDishes = oid => db.order_items.filter(i => i.order_id === oid).map(i => db.dishes.find(d => d.id === i.dish_id)).filter(Boolean);
const orderPhotos = oid => db.photos.filter(p => p.order_id === oid);
const scoresOf = oid => db.scores.filter(s => s.order_id === oid);
const memberName = uid => (db.members.find(m => m.user_id === uid) || {}).name || '?';
const otherName = () => me.name === 'Tom' ? 'Caley' : 'Tom';
const initial = n => n === 'Tom' ? 'T' : 'C';
function coverOf(p) { if (p.cover_path) return p.cover_path; const ph = photosOf(p.id)[0]; return ph && ph.path; }
function avgFor(pid, name) {
  const m = db.members.find(x => x.name === name); if (!m) return null;
  const oids = db.orders.filter(o => o.place_id === pid).map(o => o.id);
  const s = db.scores.filter(x => x.user_id === m.user_id && oids.includes(x.order_id) && x.score);
  return s.length ? { avg: s.reduce((a, b) => a + b.score, 0) / s.length, n: s.length } : null;
}
const myFavKey = () => me.name === 'Tom' ? 'fav_tom' : 'fav_caley';

/* ---------- photos ---------- */
function compress(file, max = 1600, q = 0.8) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Could not read that photo')), 'image/jpeg', q);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that photo')); };
    im.src = url;
  });
}
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));

/* ---------- router ---------- */
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
async function render() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  const params = new URLSearchParams(qs || '');
  if (!me) return;
  app().onclick = null;
  for (const [re, fn] of routes) { const m = path.match(re); if (m) { window.scrollTo(0, 0); fn(...m.slice(1), params); renderNav(path); return; } }
  location.hash = '#/';
}
function renderNav(path) {
  let nav = $('.nav');
  const hide = /^\/(snap|score|place-form|settings)/.test(path);
  if (hide) { nav && nav.remove(); return; }
  if (!nav) { nav = document.createElement('nav'); nav.className = 'nav'; document.body.appendChild(nav); }
  nav.innerHTML = `<a href="#/" class="${path === '/' ? 'on' : ''}">${ICON.home}Home</a>
    <a href="#/snap" class="snap" aria-label="Snap a meal">${ICON.cam('#FFFDF7')}</a>
    <a href="#/menu" class="${path.startsWith('/menu') ? 'on' : ''}">${ICON.menu}Our menu</a>`;
}
window.addEventListener('hashchange', render);

/* ---------- sign in ---------- */
function signInView(err) {
  $('.nav') && $('.nav').remove();
  app().innerHTML = `<form class="signin" id="f">
    <div style="text-align:center"><div class="board"><span class="big">BKO</span><span class="sm">Balmer Keys Orders</span></div></div>
    <div><label class="lbl" for="em">Email</label><input class="input" id="em" type="email" autocomplete="username" required></div>
    <div><label class="lbl" for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="current-password" required></div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    <button class="btn" type="submit">Sign in</button>
  </form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const b = $('button', e.target); b.disabled = true; b.textContent = 'Signing in…';
    try { await api.signIn($('#em').value.trim(), $('#pw').value); await boot(); }
    catch (x) { signInView(/invalid/i.test(x.message) ? 'That email or password is not right.' : x.message); }
  };
}
function notMemberView() {
  app().innerHTML = `<div class="signin"><div style="text-align:center"><div class="board"><span class="big">BKO</span></div></div>
    <p style="text-align:center;font-size:18px">You're signed in, but this account isn't on the BKO list yet.</p>
    <p class="muted" style="text-align:center">Check the email in the setup script matches this account, run it again, then reopen the app.</p>
    <button class="btn ghost" id="so">Sign out</button></div>`;
  $('#so').onclick = async () => { await api.signOut(); signInView(); };
}

/* ---------- home ---------- */
route(/^\/$/, () => {
  const rail = db.orders.filter(o => o.status === 'rail');
  const favs = db.dishes.filter(d => d.verdict === 'go').map(d => ({ d, p: place(d.place_id) })).filter(x => x.p)
    .sort((a, b) => (b.d.fav_tom + b.d.fav_caley) - (a.d.fav_tom + a.d.fav_caley) || (b.p.status === 'go-to') - (a.p.status === 'go-to') || ((b.d.photo_path || coverOf(b.p)) ? 1 : 0) - ((a.d.photo_path || coverOf(a.p)) ? 1 : 0))
    .slice(0, 6);
  app().innerHTML = `
  <div class="top"><div class="board"><span class="big">BKO</span><span class="sm">Orders</span></div>
    <a class="who" href="#/settings">${esc(me.name)} ▾</a></div>
  <div class="stack">
    <a href="#/snap" class="btn" style="min-height:96px;justify-content:flex-start;padding:16px 20px;gap:16px;border-radius:22px;box-shadow:0 5px 0 #2B1B17">
      <span style="width:58px;height:58px;border-radius:50%;background:var(--cream);display:flex;align-items:center;justify-content:center;flex-shrink:0">${ICON.cam('#B3261E')}</span>
      <span style="display:flex;flex-direction:column;gap:4px;text-align:left"><span class="h" style="font-size:26px">Snap a meal</span><span style="font-size:15px;font-weight:500;color:#FBE7C2">Photo now, scores after you eat</span></span></a>
    <section>
      <div class="row-between" style="margin-bottom:10px"><h2 class="h" style="font-size:22px">On the rail</h2>
        <span style="font-weight:600;font-size:15px;color:${rail.length ? 'var(--red)' : 'var(--mute)'}">${rail.length ? rail.length + ' to score' : 'All scored'}</span></div>
      <div class="rail">${rail.length ? `<div class="rail-grid">${rail.map(railCard).join('')}</div>` : '<div class="empty">Nothing waiting. Snap tonight\'s order and it hangs here.</div>'}</div>
    </section>
    <section class="stack tight">
      <div class="row-between"><h2 class="h" style="font-size:22px">Our go-to dishes</h2><a class="link" href="#/menu">${db.places.length} places</a></div>
      ${favs.length ? favs.map(({ d, p }) => `<a class="card fav" href="#/place/${p.id}"><div class="ph" style="${img(d.photo_path || coverOf(p))}"></div>
        <span style="flex:1;min-width:0"><b style="display:block;font-size:16px">${esc(d.name)}</b><span class="muted" style="font-size:14px">${esc(p.name)}</span></span>${ticks(d)}</a>`).join('')
        : `<div class="empty">Dishes you mark ★ Order again show up here.${db.places.length ? '' : ' <a class="link" href="#/settings">Import your note</a>'}</div>`}
    </section>
  </div>`;
});
function railCard(o) {
  const p = place(o.place_id) || { name: '?' }; const ds = orderDishes(o.id); const ph = orderPhotos(o.id)[0];
  const mine = scoresOf(o.id).find(s => s.user_id === me.user_id && s.score);
  return `<a class="docket rail-card" href="#/score/${o.id}"><div class="ph" style="height:92px;${img(ph && ph.path)}"></div>
    <b style="font-size:16px;line-height:1.2">${esc(ds.length ? ds[0].name + (ds.length > 1 ? ' +' + (ds.length - 1) : '') : 'Order')}</b>
    <span class="muted" style="font-size:14px">${esc(p.name)}</span>
    <span class="go">${mine ? esc(otherName()) + ' still to score' : 'Score it'}</span></a>`;
}

/* ---------- menu ---------- */
let menuFilter = { cuisine: 'All', q: '' };
route(/^\/menu$/, () => {
  const cuisines = ['All', ...new Set(db.places.map(p => p.cuisine).filter(Boolean).sort())];
  app().innerHTML = `
  <div class="top"><div class="left"><h1 class="h" style="font-size:28px">Our menu</h1></div>${mini}</div>
  <div class="stack tight">
    <input class="input" id="q" type="search" placeholder="Search places and dishes" value="${esc(menuFilter.q)}">
    <div class="chips" id="cz">${cuisines.map(c => `<button class="chip ${menuFilter.cuisine === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div id="list"></div>
    <a class="btn ghost" href="#/place-form" style="margin-top:12px">+ Add a place</a>
  </div>`;
  const draw = () => {
    const q = menuFilter.q.toLowerCase();
    const ok = p => (menuFilter.cuisine === 'All' || p.cuisine === menuFilter.cuisine) &&
      (!q || p.name.toLowerCase().includes(q) || dishesOf(p.id).some(d => d.name.toLowerCase().includes(q)));
    let html = '';
    for (const [k, label] of STATUS) {
      const ps = db.places.filter(p => (p.status || 'new') === k && ok(p)); if (!ps.length) continue;
      html += `<div class="grp">${label} · ${ps.length}</div>` + ps.map(p => {
        const t = avgFor(p.id, 'Tom'), c = avgFor(p.id, 'Caley');
        return `<a class="mrow ${k === 'avoid' ? 'dim' : ''}" href="#/place/${p.id}"><span class="nm">${esc(p.name)}</span>
          ${t ? `<span class="mini-score T">${t.avg.toFixed(1)}</span>` : ''}${c ? `<span class="mini-score C">${c.avg.toFixed(1)}</span>` : ''}
          <span class="cu">${esc(p.cuisine || '')}</span></a>`;
      }).join('');
    }
    $('#list').innerHTML = html || '<div class="empty" style="margin-top:10px">Nothing matches.</div>';
  };
  draw();
  $('#q').oninput = e => { menuFilter.q = e.target.value; draw(); };
  $('#cz').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; menuFilter.cuisine = b.dataset.c;
    $('#cz').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); draw(); };
});

/* ---------- place page ---------- */
route(/^\/place\/([\w-]+)$/, pid => {
  const p = place(pid); if (!p) { location.hash = '#/menu'; return; }
  const ds = dishesOf(pid).sort((a, b) => ({ go: 0, ok: 1, null: 2, no: 3 }[a.verdict] - { go: 0, ok: 1, null: 2, no: 3 }[b.verdict]));
  const phs = photosOf(pid); const orders = db.orders.filter(o => o.place_id === pid);
  const st = STATUS.find(s => s[0] === (p.status || 'new'));
  const avgBox = n => { const a = avgFor(pid, n);
    return `<div class="avg ${initial(n)}"><b style="font-size:15px">${n}</b><div class="h ${a ? '' : 'sm'}">${a ? a.avg.toFixed(1) : 'Not scored'}</div>
      ${a ? `<span style="font-size:13px;opacity:.85">${a.n} order${a.n > 1 ? 's' : ''}</span>` : ''}</div>`; };
  const cmts = [];
  orders.forEach(o => scoresOf(o.id).forEach(s => { if (s.comment || s.score) cmts.push({ o, s }); }));
  app().innerHTML = `
  <div class="cover ph" style="${img(coverOf(p))}">${back('#/menu')}<a class="edit" href="#/place-form/${p.id}">Edit</a>
    <div class="board left"><span class="big">${esc(p.name)}</span><span class="sm">${esc([p.cuisine, p.suburb].filter(Boolean).join(' · ') || 'Takeaway')}</span></div></div>
  <div class="stack">
    <div class="chips">
      <span class="v ${p.status === 'go-to' ? 'go' : p.status === 'avoid' ? 'no' : ''}">${p.status === 'go-to' ? '★ ' : ''}${esc(st[1])}</span>
      ${modesOf(p.get_mode).map(m => `<span class="chip info">${esc(m)}</span>`).join('')}${(p.order_via || []).map(a => `<span class="chip info">${esc(a)}</span>`).join('')}
      ${p.price ? `<span class="chip info on" style="color:var(--mus)">${esc(p.price)}</span>` : ''}
    </div>
    ${(p.house_rules || []).length ? `<div class="rules"><div class="rt">House rules</div>${p.house_rules.map(esc).join('<br>')}</div>` : ''}
    <div><div class="pair">${avgBox('Tom')}${avgBox('Caley')}</div><span class="muted" style="font-size:14px;display:block;margin-top:8px">Average score out of 10</span></div>
    <section>
      <div class="row-between"><h2 class="h" style="font-size:22px">What we've tried</h2><button class="link" id="addDish">+ Dish</button></div>
      ${ds.length ? ds.map(d => `<div class="dish">${dthumb(d)}<button class="dish-main" data-d="${d.id}"><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:16px">${esc(d.name)}</b>${ticks(d)}</div>
        ${d.note ? `<div class="n">${esc(d.note)}</div>` : ''}</div>${vchip(d.verdict)}</button></div>`).join('') : '<p class="muted">No dishes yet.</p>'}
    </section>
    ${p.notes ? `<section><h2 class="h" style="font-size:22px;margin-bottom:8px">Notes</h2><p style="margin:0;line-height:1.45;white-space:pre-line">${esc(p.notes)}</p></section>` : ''}
    ${phs.length ? `<section><h2 class="h" style="font-size:22px;margin-bottom:10px">Photos</h2><div class="gallery">${phs.map(x => `<button class="ph" data-ph="${esc(x.path)}" style="${img(x.path)}" aria-label="Open photo"></button>`).join('')}</div></section>` : ''}
    ${cmts.length ? `<section class="stack tight"><h2 class="h" style="font-size:22px">Orders and comments</h2>${cmts.map(({ o, s }) => { const n = memberName(s.user_id);
      return `<a class="cmt" href="#/score/${o.id}"><span class="t ${initial(n)}" style="width:32px;height:32px">${initial(n)}</span><div><span class="muted" style="font-size:13px;font-weight:600">${fmtDate(o.ordered_on)}${s.score ? ' · ' + s.score + '/10' : ''}</span>
        ${s.comment ? `<div style="line-height:1.45">${esc(s.comment)}</div>` : ''}</div></a>`; }).join('')}</section>` : ''}
    <a class="btn" href="#/snap?place=${p.id}">${ICON.cam('#FFFDF7')} Snap a meal from here</a>
  </div>`;
  app().onclick = e => {
    const dp = e.target.closest('[data-dp]'); if (dp) return photoPicker(db.dishes.find(x => x.id === dp.dataset.dp), { after: render });
    const d = e.target.closest('[data-d]'); if (d) return dishSheet(db.dishes.find(x => x.id === d.dataset.d));
    const ph = e.target.closest('[data-ph]'); if (ph) return viewer(ph.dataset.ph, pid);
    if (e.target.id === 'addDish') return dishSheet(null, pid);
  };
});
function viewer(path, pid) {
  const v = document.createElement('div'); v.className = 'viewer';
  v.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px;align-items:center"><img src="${urlCache[path]}" alt="">
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="btn ghost" style="min-height:46px;width:auto" id="ud">Use for a dish</button><button class="btn ghost" style="min-height:46px;width:auto" id="cv">Use as cover</button><button class="btn ghost" style="min-height:46px;width:auto" id="cl">Close</button></div></div>`;
  document.body.appendChild(v);
  v.onclick = async e => {
    if (e.target.id === 'ud') { v.remove(); return pickDishFor(path, pid); }
    if (e.target.id === 'cv') { await api.update('places', pid, { cover_path: path }); await refresh(); v.remove(); render(); toast('Cover photo updated'); }
    else if (e.target.id === 'cl' || e.target === v) v.remove();
  };
}

/* ---------- dish photos ---------- */
function dthumb(d) {
  return d.photo_path && urlCache[d.photo_path]
    ? `<button class="dthumb ph" data-dp="${d.id}" style="${img(d.photo_path)}" aria-label="Change photo for ${esc(d.name)}"></button>`
    : `<button class="dthumb empty-th" data-dp="${d.id}" aria-label="Add a photo for ${esc(d.name)}">${ICON.cam('#B3261E').replace(/30/g, '22')}</button>`;
}
async function setDishPhoto(d, path) {
  await api.update('dishes', d.id, { photo_path: path });
  if (path) { const ph = db.photos.find(x => x.path === path); if (ph && !ph.dish_id) await api.update('photos', ph.id, { dish_id: d.id }); }
  d.photo_path = path;
}
function photoPicker(d, opts = {}) {
  const orderFirst = opts.orderId ? orderPhotos(opts.orderId) : [];
  const pool = [...orderFirst, ...photosOf(d.place_id).filter(x => !orderFirst.includes(x))];
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet stack">
    <div class="row-between"><h2 class="h" style="font-size:22px">Photo for ${esc(d.name)}</h2><button class="link" id="x">Close</button></div>
    ${d.photo_path ? `<div class="ph" style="height:200px;border-radius:14px;border:2px solid var(--grill);${img(d.photo_path)}"></div>` : ''}
    <input type="file" id="pf" accept="image/*" hidden>
    <button class="btn" id="np">${ICON.cam('#FFFDF7')} Take or choose a new photo</button>
    ${pool.length ? `<div><span class="lbl">Or pick one already in BKO</span><div class="pick-grid">${pool.map(x =>
      `<button class="ph ${x.path === d.photo_path ? 'on' : ''}" data-pp="${esc(x.path)}" style="${img(x.path)}" aria-label="Use this photo"></button>`).join('')}</div></div>` : ''}
    ${d.photo_path ? '<button class="link" id="rp" style="align-self:center">Remove photo from this dish</button>' : ''}
  </div>`;
  document.body.appendChild(bg);
  const done = async msg => { await refresh(); bg.remove(); toast(msg); (opts.after || render)(); };
  bg.onclick = async e => {
    if (e.target === bg || e.target.id === 'x') return bg.remove();
    if (e.target.closest('#np')) return $('#pf', bg).click();
    const pp = e.target.closest('[data-pp]');
    if (pp) { await setDishPhoto(d, pp.dataset.pp); return done('Photo set for ' + d.name); }
    if (e.target.id === 'rp') { await setDishPhoto(d, null); return done('Photo removed'); }
  };
  $('#pf', bg).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const b = $('#np', bg); b.disabled = true; b.textContent = 'Uploading…';
    try {
      const blob = await compress(f); const path = `${d.place_id}/${opts.orderId || 'dish'}/${rid()}.jpg`;
      await api.upload(path, blob);
      await api.insert('photos', { place_id: d.place_id, order_id: opts.orderId || null, dish_id: d.id, path });
      await setDishPhoto(d, path);
      const p = place(d.place_id); if (p && !p.cover_path) await api.update('places', p.id, { cover_path: path });
      await done('Photo added to ' + d.name);
    } catch (x) { toast(x.message); b.disabled = false; b.textContent = 'Take or choose a new photo'; }
  };
}
function pickDishFor(path, pid) {
  const ds = dishesOf(pid);
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet stack">
    <div class="row-between"><h2 class="h" style="font-size:22px">Which dish is this?</h2><button class="link" id="x">Close</button></div>
    <div class="ph" style="height:180px;border-radius:14px;border:2px solid var(--grill);${img(path)}"></div>
    <div class="stack tight">${ds.map(d => `<button class="mrow" data-pd="${d.id}">${d.photo_path ? `<span class="ph" style="width:40px;height:40px;border-radius:8px;flex-shrink:0;${img(d.photo_path)}"></span>` : ''}<span class="nm">${esc(d.name)}</span>${d.photo_path === path ? '<span class="v go">Current</span>' : ''}</button>`).join('')}</div>
  </div>`;
  document.body.appendChild(bg);
  bg.onclick = async e => {
    if (e.target === bg || e.target.id === 'x') return bg.remove();
    const b = e.target.closest('[data-pd]'); if (!b) return;
    const d = db.dishes.find(x => x.id === b.dataset.pd);
    await setDishPhoto(d, path); await refresh(); bg.remove(); toast('Photo set for ' + d.name); render();
  };
}

/* ---------- dish sheet ---------- */
function dishSheet(d, pid) {
  const isNew = !d; d = d || { name: '', verdict: null, note: '', fav_tom: false, fav_caley: false, place_id: pid };
  const key = myFavKey(); let verdict = d.verdict; let fav = !!d[key];
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet stack">
    <div class="row-between"><h2 class="h" style="font-size:24px">${isNew ? 'Add a dish' : 'Dish'}</h2><button class="link" id="x">Close</button></div>
    <div><label class="lbl" for="dn">Name</label><input class="input" id="dn" value="${esc(d.name)}" placeholder="e.g. Massaman beef"></div>
    ${isNew ? '' : `<div><span class="lbl">Photo</span><div style="display:flex;align-items:center;gap:12px">${dthumb(d).replace('dthumb', 'dthumb big')}<button class="link" data-dp="${d.id}">${d.photo_path ? 'Change photo' : 'Add a photo'}</button></div></div>`}
    <div><span class="lbl">Verdict</span><div class="vbtns" id="vb">${['go', 'ok', 'no'].map(v => `<button class="${v} ${verdict === v ? 'on' : ''}" data-v="${v}">${VERDICT[v]}</button>`).join('')}</div></div>
    <div><span class="lbl">Favourite</span><div style="display:flex;gap:8px">
      <button class="tick ${fav ? 'on' : ''} ${initial(me.name)}" id="fv">${fav ? '✓ ' : ''}${esc(me.name)}</button>
      ${d[me.name === 'Tom' ? 'fav_caley' : 'fav_tom'] ? `<span class="tick on ${initial(otherName())}" style="opacity:.8">✓ ${otherName()}</span>` : ''}</div></div>
    <div><label class="lbl" for="dt">Note</label><textarea class="input" id="dt" placeholder="What's it like? Any ordering tips?">${esc(d.note || '')}</textarea></div>
    <button class="btn" id="sv">Save</button>
    ${isNew ? '' : '<button class="link" id="del" style="align-self:center">Delete this dish</button>'}
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = async e => {
    if (e.target === bg || e.target.id === 'x') return close();
    if (e.target.closest('[data-dp]')) { close(); return photoPicker(d, { after: () => { render(); dishSheet(db.dishes.find(x => x.id === d.id)); } }); }
    const vb = e.target.closest('[data-v]');
    if (vb) { verdict = verdict === vb.dataset.v ? null : vb.dataset.v; bg.querySelectorAll('#vb button').forEach(b => b.classList.toggle('on', b.dataset.v === verdict)); return; }
    if (e.target.id === 'fv') { fav = !fav; e.target.classList.toggle('on', fav); e.target.textContent = (fav ? '✓ ' : '') + me.name; return; }
    if (e.target.id === 'sv') {
      const name = $('#dn', bg).value.trim(); if (!name) return toast('Give the dish a name');
      const fields = { name, verdict, note: $('#dt', bg).value.trim() || null, [key]: fav };
      e.target.disabled = true;
      try { isNew ? await api.insert('dishes', { ...fields, place_id: pid }) : await api.update('dishes', d.id, fields); await refresh(); close(); render(); }
      catch (x) { toast(x.message); e.target.disabled = false; }
    }
    if (e.target.id === 'del' && confirm(`Delete ${d.name}?`)) { await api.remove('dishes', d.id); await refresh(); close(); render(); }
  };
}

/* ---------- add / edit place ---------- */
route(/^\/place-form(?:\/([\w-]+))?$/, (pid, params) => {
  const p = pid ? place(pid) : null;
  const f = p ? { ...p, order_via: [...(p.order_via || [])] } : { name: params.get('name') || '', suburb: '', cuisine: '', get_mode: '', order_via: [], price: '', status: 'new', house_rules: [], notes: '' };
  f.modes = modesOf(f.get_mode);
  const ret = params.get('return');
  const cuisineList = () => [...new Set([...CUISINES, ...db.places.map(x => x.cuisine).filter(Boolean), ...(f.cuisine ? [f.cuisine] : [])])].filter(c => c !== 'Other');
  const cuisineChips = () => cuisineList().map(c => `<button type="button" class="chip ${f.cuisine === c ? 'on' : ''}" data-cu="${esc(c)}">${esc(c)}</button>`).join('') +
    '<button type="button" class="chip add" id="cuAdd">+ Add a cuisine</button>';
  app().innerHTML = `
  <div class="top"><div class="left">${back_js()}<h1 class="h" style="font-size:26px">${p ? 'Edit place' : 'Add a place'}</h1></div>${mini}</div>
  <form class="stack" id="pf">
    <div><label class="lbl" for="pn">Name</label><input class="input" id="pn" required value="${esc(f.name)}" placeholder="e.g. Nung Leng"></div>
    <div><label class="lbl" for="ps">Suburb</label><input class="input" id="ps" value="${esc(f.suburb || '')}" placeholder="e.g. Darlinghurst"></div>
    <div><span class="lbl">Cuisine</span><div class="chips" id="cu">${cuisineChips()}</div>
      <div id="cuNew" style="display:none;gap:8px;margin-top:10px"><input class="input" id="cuIn" placeholder="e.g. Korean" style="flex:1"><button type="button" class="btn" id="cuOk" style="width:auto;min-height:52px">Add</button></div></div>
    <div><span class="lbl">How do you get it? <span class="muted" style="font-weight:500">(pick any)</span></span><div class="chips" id="gm">${MODES.map(g => `<button type="button" class="chip must ${f.modes.includes(g) ? 'on' : ''}" data-gm="${g}">${f.modes.includes(g) ? '✓ ' : ''}${g}</button>`).join('')}</div></div>
    <div><span class="lbl">Order through <span class="muted" style="font-weight:500">(pick any)</span></span><div class="chips" id="ov">${APPS.map(a => `<button type="button" class="chip must ${f.order_via.includes(a) ? 'on' : ''}" data-ov="${a}">${f.order_via.includes(a) ? '✓ ' : ''}${a}</button>`).join('')}</div></div>
    <div><span class="lbl">Price</span><div class="seg" id="pr">${['$', '$$', '$$$'].map(x => `<button type="button" class="${f.price === x ? 'on' : ''}" data-pr="${x}" style="font-family:var(--slab)">${x}</button>`).join('')}</div></div>
    ${p ? `<div><span class="lbl">Where does it sit?</span><div class="chips" id="stx">${STATUS.map(([k, l]) => `<button type="button" class="chip ${f.status === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div></div>` : ''}
    <div><label class="lbl" for="hr">House rules <span class="muted" style="font-weight:500">(one per line)</span></label><textarea class="input" id="hr" placeholder="e.g. Add red cabbage">${esc((f.house_rules || []).join('\n'))}</textarea></div>
    <div><label class="lbl" for="nt">Notes</label><textarea class="input" id="nt" placeholder="Anything else worth remembering">${esc(f.notes || '')}</textarea></div>
    <button class="btn" type="submit">${p ? 'Save changes' : 'Save place'}</button>
    ${p ? '<button type="button" class="link" id="delp" style="align-self:center">Delete this place</button>' : '<p class="muted" style="text-align:center;margin:0;font-size:14px">Only the name is needed. Fill in the rest any time.</p>'}
  </form>`;
  const one = (sel, attr, k) => $(sel).onclick = e => { const b = e.target.closest(`[data-${attr}]`); if (!b) return;
    f[k] = f[k] === b.dataset[attr] ? '' : b.dataset[attr]; $(sel).querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset[attr] === f[k])); };
  one('#pr', 'pr', 'price'); p && one('#stx', 'st', 'status');
  $('#cu').onclick = e => {
    if (e.target.id === 'cuAdd') { $('#cuNew').style.display = 'flex'; $('#cuIn').focus(); return; }
    const b = e.target.closest('[data-cu]'); if (!b) return;
    f.cuisine = f.cuisine === b.dataset.cu ? '' : b.dataset.cu; $('#cu').innerHTML = cuisineChips();
  };
  const addCuisine = () => { const v = $('#cuIn').value.trim(); if (!v) return;
    const match = cuisineList().find(c => c.toLowerCase() === v.toLowerCase());
    f.cuisine = match || v.charAt(0).toUpperCase() + v.slice(1); $('#cuIn').value = ''; $('#cuNew').style.display = 'none'; $('#cu').innerHTML = cuisineChips(); };
  $('#cuOk').onclick = addCuisine;
  $('#cuIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addCuisine(); } };
  $('#gm').onclick = e => { const b = e.target.closest('[data-gm]'); if (!b) return; const g = b.dataset.gm;
    f.modes = f.modes.includes(g) ? f.modes.filter(x => x !== g) : MODES.filter(x => x === g || f.modes.includes(x));
    b.classList.toggle('on', f.modes.includes(g)); b.textContent = (f.modes.includes(g) ? '✓ ' : '') + g; };
  $('#ov').onclick = e => { const b = e.target.closest('[data-ov]'); if (!b) return; const a = b.dataset.ov;
    f.order_via = f.order_via.includes(a) ? f.order_via.filter(x => x !== a) : [...f.order_via, a];
    b.classList.toggle('on', f.order_via.includes(a)); b.textContent = (f.order_via.includes(a) ? '✓ ' : '') + a; };
  $('#pf').onsubmit = async e => {
    e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true;
    const fields = { name: $('#pn').value.trim(), suburb: $('#ps').value.trim() || null, cuisine: f.cuisine || null, get_mode: f.modes.join(', ') || null,
      order_via: f.order_via, price: f.price || null, house_rules: $('#hr').value.split('\n').map(s => s.trim()).filter(Boolean), notes: $('#nt').value.trim() || null };
    if (p) fields.status = f.status || 'new';
    try {
      let id = pid;
      if (p) await api.update('places', pid, fields); else id = (await api.insert('places', fields)).id;
      await refresh();
      if (ret === 'snap') { snapDraft.place = id; location.replace('#/snap'); } else location.replace('#/place/' + id);
    } catch (x) { toast(x.message); b.disabled = false; }
  };
  const del = $('#delp'); if (del) del.onclick = async () => {
    if (!confirm(`Delete ${p.name} and everything in it? This can't be undone.`)) return;
    await api.removeFiles(photosOf(pid).map(x => x.path)); await api.remove('places', pid); await refresh(); location.replace('#/menu');
  };
});

/* ---------- snap a meal ---------- */
let snapDraft = { files: [], previews: [], place: null, dishes: [''], date: null };
route(/^\/snap$/, params => {
  if (params.get('place')) snapDraft.place = params.get('place');
  if (!snapDraft.date) snapDraft.date = todayISO();
  const recentIds = [...new Set(db.orders.map(o => o.place_id))];
  const ordered = [...recentIds.map(place).filter(Boolean), ...db.places.filter(p => !recentIds.includes(p.id))];
  app().innerHTML = `
  <div class="top"><div class="left">${back('#/')}<h1 class="h" style="font-size:26px">Snap a meal</h1></div>${mini}</div>
  <div class="stack">
    <input type="file" id="fi" accept="image/*" multiple hidden>
    <div id="photos"></div>
    <div><span class="lbl">Where's it from?</span>
      <input class="input" id="pq" type="search" placeholder="Search your places" style="margin-bottom:10px">
      <div class="chips" id="pc"></div></div>
    <div><span class="lbl">What did you order?</span><div class="stack tight" id="dl"></div>
      <button class="link" id="ad">+ Add another dish</button></div>
    <div><label class="lbl" for="dt">When</label><input class="input" type="date" id="dt" value="${snapDraft.date}"></div>
    <button class="btn" id="go">Hang it on the rail</button>
    <span class="muted" style="text-align:center;font-size:14px;margin-top:-10px">Score it after you eat. It waits on Home.</span>
  </div>`;
  const drawPhotos = () => {
    $('#photos').innerHTML = snapDraft.previews.length
      ? `<div class="thumbs">${snapDraft.previews.map((u, i) => `<div class="ph" style="background-image:url('${u}')"><button class="x" data-rm="${i}" aria-label="Remove">✕</button></div>`).join('')}
         <button class="ph photo-drop" style="width:110px;height:110px;flex-shrink:0;border-radius:12px;border-width:2px" id="more">+</button></div>`
      : `<div class="photo-drop">${ICON.cam('#B3261E')}<button class="btn" style="width:auto;min-height:48px" id="pick">Take or choose a photo</button></div>`;
  };
  const drawPlaces = () => {
    const q = $('#pq').value.trim().toLowerCase();
    let list = ordered.filter(p => !q || p.name.toLowerCase().includes(q));
    if (!q) list = list.slice(0, 8);
    const sel = place(snapDraft.place);
    if (sel && !list.includes(sel)) list = [sel, ...list];
    $('#pc').innerHTML = list.map(p => `<button class="chip ${snapDraft.place === p.id ? 'on' : ''}" data-p="${p.id}">${esc(p.name)}</button>`).join('') +
      `<a class="chip add" href="#/place-form?return=snap&name=${encodeURIComponent($('#pq').value.trim())}">+ New place</a>`;
  };
  const drawDishes = () => {
    const known = snapDraft.place ? dishesOf(snapDraft.place).map(d => d.name) : [];
    $('#dl').innerHTML = `<datalist id="kd">${known.map(n => `<option value="${esc(n)}">`).join('')}</datalist>` +
      snapDraft.dishes.map((n, i) => `<input class="input" list="kd" data-i="${i}" value="${esc(n)}" placeholder="${i ? 'Another dish' : 'e.g. Pad Thai'}">`).join('');
  };
  drawPhotos(); drawPlaces(); drawDishes();
  $('#pq').oninput = drawPlaces;
  $('#pc').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; snapDraft.place = b.dataset.p; drawPlaces(); drawDishes(); };
  $('#dl').oninput = e => { if (e.target.dataset.i != null) snapDraft.dishes[+e.target.dataset.i] = e.target.value; };
  $('#dt').onchange = e => snapDraft.date = e.target.value;
  $('#ad').onclick = () => { snapDraft.dishes.push(''); drawDishes(); $('#dl').lastElementChild.focus(); };
  $('#photos').onclick = e => {
    if (e.target.id === 'pick' || e.target.id === 'more') return $('#fi').click();
    const rm = e.target.closest('[data-rm]'); if (rm) { const i = +rm.dataset.rm; URL.revokeObjectURL(snapDraft.previews[i]); snapDraft.files.splice(i, 1); snapDraft.previews.splice(i, 1); drawPhotos(); }
  };
  $('#fi').onchange = e => { for (const f of e.target.files) { snapDraft.files.push(f); snapDraft.previews.push(URL.createObjectURL(f)); } e.target.value = ''; drawPhotos(); };
  $('#go').onclick = async e => {
    const names = snapDraft.dishes.map(s => s.trim()).filter(Boolean);
    if (!snapDraft.place) return toast('Pick where it\'s from');
    const b = e.target; b.disabled = true; b.textContent = 'Hanging it up…';
    try {
      const pid = snapDraft.place; const o = await api.insert('orders', { place_id: pid, ordered_on: snapDraft.date || todayISO() });
      const ids = [];
      for (const n of names) {
        let d = dishesOf(pid).find(x => x.name.toLowerCase() === n.toLowerCase());
        if (!d) { d = await api.insert('dishes', { place_id: pid, name: n }); db.dishes.push(d); }
        if (!ids.includes(d.id)) ids.push(d.id);
      }
      await api.insertMany('order_items', ids.map(id => ({ order_id: o.id, dish_id: id })));
      for (let i = 0; i < snapDraft.files.length; i++) {
        b.textContent = `Uploading photo ${i + 1} of ${snapDraft.files.length}…`;
        const blob = await compress(snapDraft.files[i]); const path = `${pid}/${o.id}/${rid()}.jpg`;
        await api.upload(path, blob);
        const single = ids.length === 1 ? ids[0] : null;
        await api.insert('photos', { place_id: pid, order_id: o.id, dish_id: single, path });
        if (i === 0) {
          if (single) await api.update('dishes', single, { photo_path: path });
          if (!place(pid).cover_path) await api.update('places', pid, { cover_path: path });
        }
      }
      snapDraft.previews.forEach(u => URL.revokeObjectURL(u));
      snapDraft = { files: [], previews: [], place: null, dishes: [''], date: null };
      await refresh(); toast('On the rail. Enjoy!'); location.replace('#/');
    } catch (x) { toast(x.message); b.disabled = false; b.textContent = 'Hang it on the rail'; }
  };
});

/* ---------- score it ---------- */
route(/^\/score\/([\w-]+)$/, oid => {
  const o = order(oid); if (!o) { location.hash = '#/'; return; }
  const p = place(o.place_id); const ds = orderDishes(oid); const phs = orderPhotos(oid);
  const mine = scoresOf(oid).find(s => s.user_id === me.user_id) || {};
  const theirs = scoresOf(oid).find(s => s.user_id !== me.user_id);
  let score = mine.score || 7; let touched = !!mine.score;
  const key = myFavKey(); const otherKey = key === 'fav_tom' ? 'fav_caley' : 'fav_tom';
  const M = initial(me.name);
  app().innerHTML = `
  <div class="top"><div class="left">${back_js()}<h1 class="h" style="font-size:26px">Score it</h1></div>${mini}</div>
  <div class="stack">
    <article class="docket stack" style="box-shadow:5px 5px 0 var(--grill);border-radius:6px;padding:18px;gap:16px">
      <div><span style="font-family:var(--cond);font-weight:700;font-size:15px;letter-spacing:1px;color:var(--red)">ORDER DOCKET</span>
        <a href="#/place/${p.id}"><h2 class="h" style="font-size:26px;margin-top:2px">${esc(p.name)}</h2></a>
        <span class="muted" style="font-size:15px">${fmtDate(o.ordered_on)}</span></div>
      ${phs.length ? `<div class="thumbs">${phs.map(x => `<div class="ph" style="${img(x.path)}"></div>`).join('')}</div>` : ''}
      <div class="dash"></div>
      <span style="font-weight:700;font-size:16px">Dishes <span class="muted" style="font-weight:500">(tap a square to set its photo)</span></span>
      ${ds.length ? ds.map(d => `<div class="stack tight" data-dish="${d.id}" style="gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">${dthumb(d)}<b style="font-size:17px;flex:1;min-width:0">${esc(d.name)}</b>
            <button class="tick ${d[key] ? 'on' : ''} ${M}" data-fav="${d.id}">${d[key] ? '✓ ' : '♡ '}${esc(me.name)}</button></div>
          <div class="vbtns">${['go', 'ok', 'no'].map(v => `<button class="${v} ${d.verdict === v ? 'on' : ''}" data-v="${v}" data-vd="${d.id}">${VERDICT[v]}</button>`).join('')}</div>
          ${d[otherKey] ? `<span class="muted" style="font-size:14px">${otherName()} ticked this as a favourite</span>` : ''}
        </div>`).join('<div style="border-top:2px dashed var(--line)"></div>') : '<p class="muted" style="margin:0">No dishes on this order.</p>'}
      <div class="dash"></div>
      <span style="font-weight:700;font-size:16px">Your score for ${esc(p.name)}</span>
      <div class="score ${M}"><b style="font-size:18px;width:60px">${esc(me.name)}</b>
        <div style="display:flex;align-items:center;gap:10px"><button class="pm" id="dn" aria-label="Lower">−</button>
        <span class="num" id="sc" style="opacity:${touched ? 1 : .45}">${score}<small> /10</small></span>
        <button class="pm" id="up" aria-label="Raise">+</button></div></div>
      <div><label class="lbl" for="cm" style="font-size:16px">Your comment</label>
        <textarea class="input" id="cm" placeholder="What stood out? What would you order next time?" style="background:var(--cream)">${esc(mine.comment || '')}</textarea></div>
      <div class="dash"></div>
      <div class="cmt"><span class="t ${initial(otherName())}" style="width:32px;height:32px">${initial(otherName())}</span>
        <div>${theirs && theirs.score ? `<b>${otherName()}: ${theirs.score}/10</b>${theirs.comment ? `<div style="line-height:1.45">${esc(theirs.comment)}</div>` : ''}` : `<span class="muted">${otherName()} hasn't scored this yet.</span>`}</div></div>
    </article>
    <button class="btn" id="sv">Save my review</button>
    <button class="link" id="delo" style="align-self:center">Remove this order</button>
  </div>`;
  const show = () => { $('#sc').innerHTML = `${score}<small> /10</small>`; $('#sc').style.opacity = 1; };
  $('#up').onclick = () => { score = touched ? Math.min(10, score + 1) : score; touched = true; show(); };
  $('#dn').onclick = () => { score = touched ? Math.max(1, score - 1) : score; touched = true; show(); };
  app().onclick = async e => {
    const dp = e.target.closest('[data-dp]');
    if (dp) { const cm = $('#cm').value; return photoPicker(db.dishes.find(x => x.id === dp.dataset.dp), { orderId: oid, after: () => { render(); $('#cm').value = cm; } }); }
    const vb = e.target.closest('[data-vd]');
    if (vb) { const d = db.dishes.find(x => x.id === vb.dataset.vd); const v = d.verdict === vb.dataset.v ? null : vb.dataset.v;
      d.verdict = v; vb.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      api.update('dishes', d.id, { verdict: v }).catch(x => toast(x.message)); return; }
    const fb = e.target.closest('[data-fav]');
    if (fb) { const d = db.dishes.find(x => x.id === fb.dataset.fav); d[key] = !d[key];
      fb.classList.toggle('on', d[key]); fb.textContent = (d[key] ? '✓ ' : '♡ ') + me.name;
      api.update('dishes', d.id, { [key]: d[key] }).catch(x => toast(x.message)); }
  };
  $('#sv').onclick = async e => {
    e.target.disabled = true;
    try {
      await api.upsertScore({ order_id: oid, user_id: me.user_id, score, comment: $('#cm').value.trim() || null, updated_at: new Date().toISOString() });
      const bothDone = theirs && theirs.score;
      if (bothDone && o.status !== 'scored') await api.update('orders', oid, { status: 'scored' });
      await refresh(); toast(bothDone ? 'Docket closed. Both scored!' : `Saved. Waiting on ${otherName()}.`); location.replace('#/place/' + p.id);
    } catch (x) { toast(x.message); e.target.disabled = false; }
  };
  $('#delo').onclick = async () => {
    if (!confirm('Remove this order and its photos? Dishes stay on the place.')) return;
    const paths = phs.map(x => x.path); await api.remove('orders', oid);
    for (const x of phs) await api.remove('photos', x.id);
    await api.removeFiles(paths); await refresh(); location.replace('#/');
  };
});

/* ---------- settings ---------- */
route(/^\/settings$/, () => {
  app().innerHTML = `
  <div class="top"><div class="left">${back('#/')}<h1 class="h" style="font-size:26px">Settings</h1></div>${mini}</div>
  <div class="stack">
    <div class="card" style="padding:16px"><b>Signed in as ${esc(me.name)}</b><div class="muted" style="font-size:15px;margin-top:4px">${esc(me.email || '')}</div></div>
    <section class="stack tight"><h2 class="h" style="font-size:22px">Change password</h2>
      <input class="input" type="password" id="np" autocomplete="new-password" placeholder="New password (8+ characters)">
      <button class="btn ghost" id="cp">Update password</button></section>
    <section class="stack tight"><h2 class="h" style="font-size:22px">Import your note</h2>
      <p class="muted" style="margin:0;line-height:1.45">Choose the <b>bko-note-import.json</b> file. Places already in BKO with the same name are skipped, so it's safe to run again.</p>
      <input type="file" id="imf" accept=".json,application/json" hidden>
      <button class="btn ghost" id="im">Choose import file</button><div id="imp" class="muted"></div></section>
    <section class="stack tight"><h2 class="h" style="font-size:22px">Backup</h2>
      <p class="muted" style="margin:0;line-height:1.45">Downloads all your places, dishes, orders and scores as a file (photos stay in BKO).</p>
      <button class="btn ghost" id="bk">Download backup</button></section>
    <button class="btn" id="so" style="background:var(--grill)">Sign out</button>
  </div>`;
  $('#cp').onclick = async () => { const v = $('#np').value; if (v.length < 8) return toast('Use at least 8 characters');
    try { await api.changePassword(v); $('#np').value = ''; toast('Password updated'); } catch (x) { toast(x.message); } };
  $('#im').onclick = () => $('#imf').click();
  $('#imf').onchange = async e => { const f = e.target.files[0]; if (!f) return; $('#im').disabled = true;
    try { await importNote(JSON.parse(await f.text()), m => $('#imp').textContent = m); await refresh(); toast('Note imported'); location.hash = '#/menu'; }
    catch (x) { $('#imp').textContent = 'Import stopped: ' + x.message; $('#im').disabled = false; } };
  $('#bk').onclick = () => { const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ exported: new Date().toISOString(), ...db }, null, 2)], { type: 'application/json' }));
    a.download = `bko-backup-${todayISO()}.json`; a.click(); };
  $('#so').onclick = async () => { await api.signOut(); me = null; signInView(); };
});

async function importNote(data, progress) {
  const have = new Set(db.places.map(p => p.name.toLowerCase()));
  const list = (data.places || []).filter(p => !have.has(p.name.toLowerCase()));
  let i = 0;
  for (const p of list) {
    i++; progress(`Adding ${p.name} (${i} of ${list.length})…`);
    const row = await api.insert('places', { name: p.name, suburb: p.suburb || null, cuisine: p.cuisine || null, order_via: p.order_via || [],
      status: p.status || 'new', house_rules: p.house_rules || [], notes: p.notes || null });
    const dishes = await api.insertMany('dishes', (p.dishes || []).map(d => ({ place_id: row.id, name: d.name, verdict: d.verdict || null, note: d.note || null,
      fav_tom: !!d.fav_tom, fav_caley: !!d.fav_caley })));
    let first = null;
    for (const [j, ph] of (p.photos || []).entries()) {
      progress(`Uploading ${p.name} photo ${j + 1} of ${p.photos.length}…`);
      const blob = await (await fetch('data:image/jpeg;base64,' + ph.data)).blob();
      const path = `${row.id}/note/${rid()}.jpg`; await api.upload(path, blob);
      const dish = ph.dish ? dishes.find(d => d.name === ph.dish) : null;
      await api.insert('photos', { place_id: row.id, dish_id: dish ? dish.id : null, path });
      if (dish && !dish.photo_path) { await api.update('dishes', dish.id, { photo_path: path }); dish.photo_path = path; }
      if (!first) first = path;
    }
    if (first) await api.update('places', row.id, { cover_path: first });
  }
  progress(list.length ? `Done: ${list.length} places added.` : 'Nothing new to add.');
}

/* ---------- boot ---------- */
async function boot() {
  try {
    await api.init();
    const s = await api.session(); if (!s) return signInView();
    db = await api.load();
    const uid = await api.uid();
    me = db.members.find(m => m.user_id === uid);
    if (!me) return notMemberView();
    await warmUrls(); render();
  } catch (x) {
    app().innerHTML = `<div class="signin"><p class="err" style="text-align:center">Couldn't reach BKO: ${esc(x.message)}</p><button class="btn ghost" onclick="location.reload()">Try again</button></div>`;
  }
}
// Refresh data when the app comes back to the front (e.g. the other person scored)
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && me) { try { await refresh(); render(); } catch (_) {} } });
window.BKO = { boot, get db() { return db; } };
if (!window.BKO_NO_AUTOBOOT) boot();
})();
