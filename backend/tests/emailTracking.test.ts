import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteTrackingLinks } from '../src/utils/emailTracking';

test('rewriteTrackingLinks rewrites normal anchors', () => {
  const html = '<a href="https://example.com/page">Visit</a>';
  const result = rewriteTrackingLinks(html, {
    campaignId: 'cmp-1',
    subscriberToken: 'tok-1',
    publicUrl: 'https://app.test'
  });
  assert.ok(
    result.includes('https://app.test/t/c/cmp-1/tok-1?u=https%3A%2F%2Fexample.com%2Fpage'),
    'expected href to be rewritten with tracking'
  );
});

test('rewriteTrackingLinks skips mailto and hash links', () => {
  const html = '<a href="mailto:test@example.com">Mail</a><a href="#section">Jump</a>';
  const result = rewriteTrackingLinks(html, {
    campaignId: 'cmp-2',
    subscriberToken: 'tok-2',
    publicUrl: 'https://app.test'
  });
  assert.ok(result.includes('href="mailto:test@example.com"'));
  assert.ok(result.includes('href="#section"'));
});

test('rewriteTrackingLinks skips unsubscribe and preferences links', () => {
  const html =
    '<a href="/unsubscribe?token=abc">Unsub</a><a href="https://app.test/unsubscribe?token=abc">Unsub2</a><a href="https://app.test/preferences?token=abc">Prefs</a>';
  const result = rewriteTrackingLinks(html, {
    campaignId: 'cmp-3',
    subscriberToken: 'tok-3',
    publicUrl: 'https://app.test'
  });
  assert.ok(result.includes('href="/unsubscribe?token=abc"'));
  assert.ok(result.includes('href="https://app.test/unsubscribe?token=abc"'));
  assert.ok(result.includes('href="https://app.test/preferences?token=abc"'));
});

test('rewriteTrackingLinks skips unsubscribe links on other domains', () => {
  const html =
    '<a href="https://othersite.test/unsubscribe?token=abc">Unsub</a>';
  const result = rewriteTrackingLinks(html, {
    campaignId: 'cmp-5',
    subscriberToken: 'tok-5',
    publicUrl: 'https://app.test'
  });
  assert.ok(result.includes('href="https://othersite.test/unsubscribe?token=abc"'));
});

test('rewriteTrackingLinks skips existing tracking links', () => {
  const html = '<a href="https://app.test/t/c/cmp-4/tok-4?u=https%3A%2F%2Fexample.com">Tracked</a>';
  const result = rewriteTrackingLinks(html, {
    campaignId: 'cmp-4',
    subscriberToken: 'tok-4',
    publicUrl: 'https://app.test'
  });
  assert.ok(result.includes('https://app.test/t/c/cmp-4/tok-4?u=https%3A%2F%2Fexample.com'));
});
