/*
 * Небольшой слой данных для отдельного сайта.
 * Грузит JSON из папки data/, хранит выбранные параметры (квартал, сценарий,
 * норматив, режим карты) в адресной строке и перерисовывает страницу
 * при загрузке данных, смене параметров и изменении ширины.
 */
(function () {
  var IDS = ['quarters', 'yields', 'losses', 'years', 'summary', 'scenarios', 'sections'];
  var DEFAULTS = { q: '2-20', scenario: '400 га', norm: '200 руб/дерево', mode: 'decision' };
  var store = {};
  var fns = [];
  IDS.forEach(function (id) { store[id] = { status: 'loading', data: [], columns: [] }; });

  // Параметры из адреса: ?q=2-20&s=400&n=200&m=program
  var params = Object.assign({}, DEFAULTS);
  var qs = new URLSearchParams(location.search);
  if (qs.get('q')) params.q = qs.get('q');
  if (['300', '400', '500'].indexOf(qs.get('s')) >= 0) params.scenario = qs.get('s') + ' га';
  if (['150', '200'].indexOf(qs.get('n')) >= 0) params.norm = qs.get('n') + ' руб/дерево';
  if (['decision', 'program'].indexOf(qs.get('m')) >= 0) params.mode = qs.get('m');

  var syncUrl = function () {
    var u = new URLSearchParams();
    if (params.q !== DEFAULTS.q) u.set('q', params.q);
    if (params.scenario !== DEFAULTS.scenario) u.set('s', String(params.scenario).split(' ')[0]);
    if (params.norm !== DEFAULTS.norm) u.set('n', String(params.norm).split(' ')[0]);
    if (params.mode !== DEFAULTS.mode) u.set('m', params.mode);
    var s = u.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  };

  var pending = false;
  var run = function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      fns.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    });
  };

  window.dash = {
    data: function (id) { return store[id] || { status: 'missing', data: [], columns: [] }; },
    onData: function (fn) { fns.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params: function () { return Object.assign({}, params); },
    setParams: function (o) { Object.assign(params, o); syncUrl(); run(); },
    resetParams: function () { params = Object.assign({}, DEFAULTS); syncUrl(); run(); },
    setLink: function () {},
    refresh: function () {},
    calc: function () {},
    colors: []
  };

  IDS.forEach(function (id) {
    fetch('data/' + id + '.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) { store[id] = { status: 'ok', data: rows, columns: Object.keys(rows[0] || {}) }; run(); })
      .catch(function (e) { console.error('data/' + id + '.json', e); store[id] = { status: 'error', data: [], columns: [], message: String(e) }; run(); });
  });

  // Перерисовка при изменении ширины страницы
  var lastW = 0, timer = null;
  var onResize = function () {
    var w = document.documentElement.clientWidth;
    if (Math.abs(w - lastW) < 4) return;
    lastW = w;
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  };
  window.addEventListener('resize', onResize);
  lastW = document.documentElement.clientWidth;
})();
