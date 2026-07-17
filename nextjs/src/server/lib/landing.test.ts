import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landingPath } from './landing';
import { isMobileUA } from './device';

// ── редиректы по ролям после логина ──────────────────────────
test('master → /master на любом устройстве', () => {
  assert.equal(landingPath('master', true), '/master');
  assert.equal(landingPath('master', false), '/master');
});

test('director → /director с телефона, ERP с компьютера', () => {
  assert.equal(landingPath('director', true), '/director');
  assert.equal(landingPath('director', false), '/sketch_screens.html');
});

test('admin / accountant / manager → ERP независимо от устройства', () => {
  for (const r of ['admin', 'accountant', 'manager']) {
    assert.equal(landingPath(r, true), '/sketch_screens.html');
    assert.equal(landingPath(r, false), '/sketch_screens.html');
  }
});

test('неизвестная / пустая роль → ERP (безопасный дефолт)', () => {
  assert.equal(landingPath(undefined, true), '/sketch_screens.html');
  assert.equal(landingPath(null, false), '/sketch_screens.html');
  assert.equal(landingPath('whatever', true), '/sketch_screens.html');
});

// ── определение мобильного устройства по user-agent ──────────
test('isMobileUA: телефоны — да, десктопы — нет', () => {
  assert.equal(isMobileUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile/15E Safari/604'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537 Chrome/120 Mobile Safari/537'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120 Safari/537'), false);
  assert.equal(isMobileUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605 Safari/605'), false);
  assert.equal(isMobileUA(''), false);
  assert.equal(isMobileUA(null), false);
  assert.equal(isMobileUA(undefined), false);
});
