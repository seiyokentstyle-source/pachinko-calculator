import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { machines } from './dist/machines.mjs';
import { initSession } from './dist/session-ui.mjs';

// These are DOM/event integration tests. They do not assert rendered layout or
// replace mobile/browser checks. No external resources or scripts are loaded.
const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
let instance = 0;
const ghoul = 'tokyo-ghoul-w';
const enako = 'okiumi6-enako-rbd';

async function mount(t, { storage = {}, app = true } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { url: 'https://example.test/pachinko-calculator/', virtualConsole });
  const { window } = dom;
  window.addEventListener('error', event => errors.push(event.error));
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.scrollTo = () => {};
  const globals = { window, document: window.document, localStorage: window.localStorage, Event: window.Event, HTMLElement: window.HTMLElement };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  t.after(() => {
    window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    assert.deepEqual(errors, [], 'application events must not throw');
  });
  if (app) await import(`./dist/app.mjs?ui-test=${++instance}`);
  const $ = id => {
    const element = window.document.getElementById(id);
    assert.ok(element, `missing #${id}`);
    return element;
  };
  const input = (id, value, event = 'input') => {
    const element = $(id);
    if (element.type === 'checkbox') element.checked = value;
    else element.value = String(value);
    element.dispatchEvent(new window.Event(event, { bubbles: true }));
    return element;
  };
  const view = name => {
    const button = window.document.querySelector(`.mode-nav button[data-view="${name}"]`);
    assert.ok(button, `missing ${name} navigation`);
    button.click();
  };
  return { window, document: window.document, $, input, view };
}

function expectView(ui, current) {
  assert.equal(ui.$('ev-view').hidden, current !== 'ev');
  assert.equal(ui.$('session-view').hidden, current === 'ev');
  assert.equal(ui.$('results').hidden, current !== 'ev');
  for (const button of ui.document.querySelectorAll('.mode-nav button[data-view]')) {
    assert.equal(button.getAttribute('aria-pressed'), String(button.dataset.view === current));
  }
  for (const id of ['machine', 'loan']) assert.equal(ui.$(id).closest('#ev-view, #session-view'), null, `${id} must remain shared`);
  if (current !== 'ev') assert.equal(ui.$('session-context').value, current);
}

function enterBefore(ui) {
  ui.input('machine', ghoul, 'change');
  ui.view('before');
  ui.input('session-spinMode', 'direct');
  ui.input('session-normalSpins', 600);
  ui.input('session-startDelta', 0);
  ui.input('session-endDelta', -3000);
  ui.input('session-gainMode', 'measured');
  ui.input('session-gain', 4000);
  ui.input('session-displayApprox', false);
}

test('three views mount once, preserve field references, and show shared conditions', async t => {
  const ui = await mount(t);
  expectView(ui, 'ev');
  const ids = [...ui.document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(ids.length, new Set(ids).size, 'all IDs must be unique after session mount');
  assert.equal(ui.$('session-panel').closest('#session-mount'), ui.$('session-mount'));
  for (const label of ui.document.querySelectorAll('label[for]')) assert.ok(ui.document.getElementById(label.htmlFor), `missing labelled field ${label.htmlFor}`);
  for (const element of ui.document.querySelectorAll('[aria-describedby]')) {
    for (const id of element.getAttribute('aria-describedby').split(/\s+/)) assert.ok(ui.document.getElementById(id), `missing description ${id}`);
  }
  for (const name of ['before', 'after', 'ev']) { ui.view(name); expectView(ui, name); }
  assert.ok(ui.$('session-context').hidden || ui.$('session-context').closest('[hidden]'), 'legacy context selector is not a second visible navigation');
});

test('before-seat data applies an unrounded rate and returns to EV without copying past spins by default', async t => {
  const ui = await mount(t);
  ui.input('spins', 975);
  enterBefore(ui);
  assert.equal(ui.$('session-method').value, 'display');
  assert.equal(ui.$('session-wallet').hidden, true);
  assert.equal(ui.$('session-spins').textContent, '600 回');
  assert.equal(ui.$('session-consumed').textContent, '7,000.00 玉');
  assert.equal(ui.$('session-rate').textContent, '21.43');
  assert.equal(ui.$('session-apply').disabled, false);
  assert.equal(ui.$('session-apply-spins').checked, false);
  ui.$('session-apply').click();
  expectView(ui, 'ev');
  assert.ok(Math.abs(Number(ui.$('rotation').value) - 150000 / 7000) < 1e-12);
  assert.equal(ui.$('spins').value, '975');
  assert.match(ui.$('rotation-source').textContent, /着席前/);
  assert.equal(ui.document.activeElement, ui.$('rotation'));
  assert.notEqual(ui.$('profit').textContent, '—');
});

test('explicit spin transfer remains available and a loan change invalidates the derived rate', async t => {
  const ui = await mount(t);
  enterBefore(ui);
  ui.input('session-apply-spins', true);
  ui.$('session-apply').click();
  assert.equal(ui.$('spins').value, '600');
  ui.input('loan', 220);
  assert.equal(ui.$('rotation').value, '0');
  assert.equal(ui.$('profit').textContent, '—');
  assert.match(ui.$('rotation-source').textContent, /貸玉条件/);
  ui.view('before');
  assert.equal(ui.$('session-rate').textContent, '18.86');
});

test('view and machine switching preserve independent records and reset optional transfer', async t => {
  const ui = await mount(t);
  enterBefore(ui);
  ui.input('session-apply-spins', true);
  ui.view('after');
  assert.equal(ui.$('session-method').value, 'wallet');
  assert.equal(ui.$('session-normalSpins').value, '0');
  ui.input('session-spinMode', 'direct');
  ui.input('session-normalSpins', 40);
  ui.input('machine', enako, 'change');
  assert.equal(ui.$('session-normalSpins').value, '0');
  ui.view('before');
  ui.input('session-spinMode', 'direct');
  ui.input('session-normalSpins', 77);
  ui.input('machine', ghoul, 'change');
  assert.equal(ui.$('session-normalSpins').value, '600');
  assert.equal(ui.$('session-apply-spins').checked, false);
  ui.view('after');
  assert.equal(ui.$('session-normalSpins').value, '40');
  const saved = JSON.parse(ui.window.localStorage.getItem('tamayomi.sessions.v1'));
  assert.equal(saved.records[`${ghoul}::before`].normalSpins, '600');
  assert.equal(saved.records[ghoul].normalSpins, '40');
  assert.equal(saved.records[`${enako}::before`].normalSpins, '77');
});

test('legacy after-seat records restore without populating a new before-seat record', async t => {
  const ui = await mount(t, { storage: {
    'tamayomi.sessions.v1': { version: 1, context: 'after', records: {
      [ghoul]: { method: 'wallet', spinMode: 'direct', normalSpins: '92', cash: '4000', startBalls: '0', endBalls: '0', gainMode: 'none' }
    } }
  } });
  ui.input('machine', ghoul, 'change');
  ui.view('after');
  assert.equal(ui.$('session-normalSpins').value, '92');
  assert.equal(ui.$('session-rate').textContent, '23.00');
  ui.view('before');
  assert.equal(ui.$('session-normalSpins').value, '0');
  assert.equal(ui.$('session-startDelta').value, '0');
  assert.equal(ui.$('session-apply').disabled, true);
});

test('manual EV inputs still produce the independent known numerical example', async t => {
  const ui = await mount(t);
  for (const id of ['rotation', 'probability', 'payout', 'speed', 'bonusMinutes']) assert.equal(ui.$(id).value, '0');
  ui.input('machine', 'manual', 'change');
  for (const [id, value] of Object.entries({ probability: 100, payout: 500, spins: 1000, rotation: 20, holding: 0, loan: 250, exchange: 25 })) ui.input(id, value);
  assert.equal(ui.$('profit').textContent, '−30,000');
  assert.equal(ui.$('revenue').textContent, '20,000 円');
  assert.equal(ui.$('cost').textContent, '50,000 円');
  assert.equal(ui.$('hits').textContent, '10.00 回');
  assert.equal(ui.$('hourly').textContent, '未設定');
  ui.input('speed', 200);
  assert.equal(ui.$('hourly').textContent, '−6,000');
  ui.input('bonusMinutes', 60);
  assert.equal(ui.$('hourly').textContent, '−2,000');
  ui.input('speed', 0);
  assert.equal(ui.$('hourly').textContent, '未設定');
  assert.equal(ui.$('profit').textContent, '−30,000');
  ui.$('reset').click();
  for (const id of ['rotation', 'probability', 'payout', 'speed', 'bonusMinutes']) assert.equal(ui.$(id).value, '0');
  assert.equal(ui.$('profit').textContent, '—');
});

test('zero defaults support a real wallet interval, but cleared fields and reset remove the result', async t => {
  const ui = await mount(t);
  ui.input('machine', ghoul, 'change');
  ui.view('after');
  assert.equal(ui.$('session-apply').disabled, true);
  ui.input('session-endSpins', 100);
  ui.input('session-cash', 5000);
  ui.input('session-gainMode', 'none');
  assert.equal(ui.$('session-rate').textContent, '20.00');
  assert.equal(ui.$('session-consumed').textContent, '1,250.00 玉');
  ui.input('session-startSpins', '');
  assert.equal(ui.$('session-rate').textContent, '—');
  assert.equal(ui.$('session-apply').disabled, true);
  ui.$('session-clear').click();
  for (const input of ui.$('session-panel').querySelectorAll('input[type="number"]')) {
    assert.equal(input.value, input.dataset.session === 'payoutRate' ? '100' : '0');
  }
  assert.equal(ui.$('session-historyText').value, '');
  assert.equal(ui.$('session-apply').disabled, true);
});

test('reopening blanks uses zero while saved observations and prize net values remain intact', async t => {
  const ui = await mount(t, { storage: {
    'tamayomi.conditions.v2': { version: 2, machine: ghoul, conditions: { rotation: '', speed: '', bonusMinutes: '', loan: '230' }, manual: { probability: '100', payout: '500' } },
    'tamayomi.sessions.v1': { version: 1, context: 'before', records: {
      [`${ghoul}::before`]: { startSpins: '', endSpins: '100', startDelta: '', endDelta: '-1250', gainMode: 'counts', netMode: 'measured' }
    } }
  } });
  for (const id of ['rotation', 'speed', 'bonusMinutes']) assert.equal(ui.$(id).value, '0');
  assert.equal(ui.$('loan').value, '230');
  assert.equal(ui.$('probability').value, '100');
  ui.view('before');
  assert.equal(ui.$('session-startSpins').value, '0');
  assert.equal(ui.$('session-endSpins').value, '100');
  assert.equal(ui.$('session-startDelta').value, '0');
  assert.equal(ui.$('session-endDelta').value, '-1250');
  const count = ui.document.querySelector('[data-prize]');
  const net = ui.document.querySelector(`[data-unit-net="${count.dataset.prize}"]`);
  assert.equal(count.value, '0');
  assert.equal(net.value, '0');
  count.value = '1';
  count.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
  assert.equal(ui.$('session-rate').textContent, '18.40');
  assert.equal(ui.$('session-gain-result').textContent, '0.00 玉');
  ui.input(net.id, 1400);
  assert.equal(ui.$('session-consumed').textContent, '2,650.00 玉');
  ui.view('after');
  ui.view('before');
  assert.equal(ui.$(net.id).value, '1400');
  assert.equal(ui.$('session-rate').textContent, '8.68');
});

test('submitting invalid advanced conditions reveals the field instead of hiding its error', async t => {
  const ui = await mount(t);
  ui.input('machine', ghoul, 'change');
  ui.input('rotation', 20);
  ui.input('exchange', '');
  const details = ui.$('exchange').closest('details');
  assert.ok(details, 'exchange is an advanced condition');
  details.open = false;
  ui.$('calculator').dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(details.open, true);
  assert.equal(ui.document.activeElement, ui.$('exchange'));
  assert.equal(ui.$('exchange').getAttribute('aria-invalid'), 'true');
  assert.notEqual(ui.$('exchange-error').textContent, '');
});

test('mounted session exposes context API without rebuilding or losing its fields', async t => {
  const ui = await mount(t, { app: false });
  const option = ui.document.createElement('option');
  option.value = ghoul;
  ui.$('machine').append(option);
  ui.$('machine').value = ghoul;
  const session = initSession({ mount: ui.$('session-mount'), getMachine: () => machines.find(machine => machine.id === ghoul), onApply() {} });
  assert.equal(typeof session.setContext, 'function');
  assert.equal(typeof session.getContext, 'function');
  const field = ui.$('session-normalSpins');
  session.setContext('before');
  ui.input('session-spinMode', 'direct');
  ui.input('session-normalSpins', 123);
  session.setContext('after');
  assert.equal(session.getContext(), 'after');
  assert.equal(field.value, '0');
  session.setContext('before');
  assert.equal(session.getContext(), 'before');
  assert.equal(ui.$('session-normalSpins'), field);
  assert.equal(field.value, '123');
});
