import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postLoginPath, mobileCabinetRedirect } from './landing';
import { isMobileUA } from './device';

// ── куда ведём после логина ──────────────────────────────────
test('postLoginPath: master → /master, остальные → ERP', () => {
  assert.equal(postLoginPath('master'), '/master');
  for (const r of ['admin', 'director', 'accountant', 'manager', undefined, null]) {
    assert.equal(postLoginPath(r as string), '/sketch_screens.html');
  }
});

// ── мобильный редирект в кабинет при заходе на ERP ───────────
test('mobileCabinetRedirect: мастер с телефона → /master (всегда)', () => {
  assert.equal(mobileCabinetRedirect({ role: 'master', mobile: true, fullErp: false }), '/master');
  assert.equal(mobileCabinetRedirect({ role: 'master', mobile: true, fullErp: true }), '/master');
});

test('mobileCabinetRedirect: директор с телефона → /director, если не выбрал полную версию', () => {
  assert.equal(mobileCabinetRedirect({ role: 'director', mobile: true, fullErp: false }), '/director');
  assert.equal(mobileCabinetRedirect({ role: 'director', mobile: true, fullErp: true }), null); // остаётся в ERP
});

test('mobileCabinetRedirect: на десктопе никого не уводим', () => {
  assert.equal(mobileCabinetRedirect({ role: 'master', mobile: false, fullErp: false }), null);
  assert.equal(mobileCabinetRedirect({ role: 'director', mobile: false, fullErp: false }), null);
});

test('mobileCabinetRedirect: прочие роли не трогаем даже на телефоне', () => {
  for (const r of ['admin', 'accountant', 'manager']) {
    assert.equal(mobileCabinetRedirect({ role: r, mobile: true, fullErp: false }), null);
  }
});

// ── определение мобильного устройства ────────────────────────
test('isMobileUA: телефоны — да, десктопы — нет', () => {
  assert.equal(isMobileUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile/15E'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537 Chrome/120 Mobile Safari/537'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120 Safari/537'), false);
  assert.equal(isMobileUA(''), false);
  assert.equal(isMobileUA(null), false);
});
