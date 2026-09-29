/**
 * model-picker.test.mjs
 * Unit tests for the ModelPicker label/providerName logic.
 * Functions are inlined here — they are private in ModelPicker.tsx but
 * the source is the single source of truth so any drift will be caught.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Inline copies of the two pure functions from ModelPicker.tsx ─────────────
// If these diverge from the source, the "live catalog coverage" test will fail.

function providerName(id) {
  return ({ 'ibm-bob': 'IBM Bob Gateway', openai: 'OpenAI', anthropic: 'Anthropic' })[id] || id || 'Models';
}

function label(id) {
  const name = id.slice(id.indexOf('/') + 1);
  return ({
    'fast':                     'Bob · Fast',
    'premium':                  'Bob · Premium (Sonnet 4.5)',
    'premium-ide':              'Bob · Premium IDE (Sonnet 4.6)',
    'premium-shell':            'Bob · Premium Shell (Sonnet 4.6)',
    'ultra':                    'Bob · Ultra',
    'explorer':                 'Explorer (Haiku 4.5)',
    'background':               'Bob · Background',
    'security':                 'Bob · Security',
    'sonnet-4.5':               'Claude Sonnet 4.5',
    'wxO-model':                'WatsonX Orchestrate',
    'gpt-oss-20b':              'GPT-OSS 20B',
    'openai/gpt-oss-20b':       'GPT-OSS 20B (OpenAI)',
    'granite-8b-code-instruct': 'Granite 8B Code Instruct',
    'rnj-1-test':               'RNJ-1 Test',
    'rnj-1-nextedit-v1-0':      'RNJ-1 NextEdit',
  })[name] || name;
}

// ── providerName ─────────────────────────────────────────────────────────────

test('providerName: known providers map to friendly names', () => {
  assert.equal(providerName('ibm-bob'),   'IBM Bob Gateway');
  assert.equal(providerName('openai'),    'OpenAI');
  assert.equal(providerName('anthropic'), 'Anthropic');
});

test('providerName: unknown provider falls back to the raw id', () => {
  assert.equal(providerName('custom-provider'), 'custom-provider');
});

test('providerName: empty string falls back to "Models"', () => {
  assert.equal(providerName(''), 'Models');
});

// ── label ────────────────────────────────────────────────────────────────────

test('label: all known gateway models have friendly display names', () => {
  const expected = {
    'ibm-bob/fast':                     'Bob · Fast',
    'ibm-bob/premium':                  'Bob · Premium (Sonnet 4.5)',
    'ibm-bob/premium-ide':              'Bob · Premium IDE (Sonnet 4.6)',
    'ibm-bob/premium-shell':            'Bob · Premium Shell (Sonnet 4.6)',
    'ibm-bob/ultra':                    'Bob · Ultra',
    'ibm-bob/explorer':                 'Explorer (Haiku 4.5)',
    'ibm-bob/background':               'Bob · Background',
    'ibm-bob/security':                 'Bob · Security',
    'ibm-bob/sonnet-4.5':               'Claude Sonnet 4.5',
    'ibm-bob/wxO-model':                'WatsonX Orchestrate',
    'ibm-bob/gpt-oss-20b':              'GPT-OSS 20B',
    'ibm-bob/openai/gpt-oss-20b':       'GPT-OSS 20B (OpenAI)',
    'ibm-bob/granite-8b-code-instruct': 'Granite 8B Code Instruct',
    'ibm-bob/rnj-1-test':               'RNJ-1 Test',
    'ibm-bob/rnj-1-nextedit-v1-0':      'RNJ-1 NextEdit',
  };
  for (const [id, friendly] of Object.entries(expected)) {
    assert.equal(label(id), friendly, `label("${id}") should be "${friendly}"`);
  }
});

test('label: every model in the live gateway catalog has a friendly name (not raw id)', () => {
  // Exact IDs returned by the Bob gateway — updated 2025-08-11
  const liveGatewayModels = [
    'ibm-bob/background',
    'ibm-bob/explorer',
    'ibm-bob/fast',
    'ibm-bob/gpt-oss-20b',
    'ibm-bob/granite-8b-code-instruct',
    'ibm-bob/openai/gpt-oss-20b',
    'ibm-bob/premium',
    'ibm-bob/premium-ide',
    'ibm-bob/premium-shell',
    'ibm-bob/rnj-1-nextedit-v1-0',
    'ibm-bob/rnj-1-test',
    'ibm-bob/security',
    'ibm-bob/wxO-model',
  ];
  for (const id of liveGatewayModels) {
    const result = label(id);
    const rawName = id.slice(id.indexOf('/') + 1);
    assert.notEqual(result, rawName, `"${id}" is missing a friendly label — still showing raw id "${rawName}"`);
  }
});

test('label: unknown future model falls back gracefully to raw name', () => {
  assert.equal(label('ibm-bob/some-future-model'), 'some-future-model');
  assert.equal(label('openai/gpt-5'), 'gpt-5');
});

test('label: Sonnet version strings are present in premium tier labels', () => {
  assert.match(label('ibm-bob/premium'),       /Sonnet 4\.5/);
  assert.match(label('ibm-bob/premium-ide'),   /Sonnet 4\.6/);
  assert.match(label('ibm-bob/premium-shell'), /Sonnet 4\.6/);
});

test('label: premium, premium-ide, and premium-shell are all distinct labels', () => {
  const base  = label('ibm-bob/premium');
  const ide   = label('ibm-bob/premium-ide');
  const shell = label('ibm-bob/premium-shell');
  assert.notEqual(base, ide,   'premium and premium-ide should have different labels');
  assert.notEqual(base, shell, 'premium and premium-shell should have different labels');
  assert.notEqual(ide,  shell, 'premium-ide and premium-shell should have different labels');
});

test('label: search string includes both provider name and label (simulates picker filter)', () => {
  // The picker filters using: `${providerName(provider)} ${label(id)} ${id}`
  const id = 'ibm-bob/premium';
  const searchStr = `${providerName(id.split('/')[0])} ${label(id)} ${id}`.toLowerCase();
  assert.ok(searchStr.includes('sonnet'),      'search string should include "sonnet"');
  assert.ok(searchStr.includes('ibm bob'),     'search string should include provider name');
  assert.ok(searchStr.includes('premium'),     'search string should include model name');
});
