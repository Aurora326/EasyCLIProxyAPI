import { describe, expect, it } from 'bun:test';
import {
  isInternalAntigravityModel,
  normalizeAntigravityDisplayName,
  parseAntigravityModelsPayload,
  injectAntigravityAliasesToYaml,
} from '../src/services/antigravityModels';

describe('Antigravity model discovery service', () => {
  it('filters out internal chat and tab code completion models', () => {
    expect(isInternalAntigravityModel('chat_20706')).toBe(true);
    expect(isInternalAntigravityModel('chat_23310')).toBe(true);
    expect(isInternalAntigravityModel('tab_flash_lite_preview')).toBe(true);
    expect(isInternalAntigravityModel('tab_jump_flash_lite_preview')).toBe(true);

    expect(isInternalAntigravityModel('gemini-4-argon-disabled')).toBe(false);
    expect(isInternalAntigravityModel('gemini-3.8-flash-tiered')).toBe(false);
    expect(isInternalAntigravityModel('gemini-3.8-flash-high')).toBe(false);
    expect(isInternalAntigravityModel('claude-opus-4-6-thinking')).toBe(false);
    expect(isInternalAntigravityModel('gpt-oss-120b-medium')).toBe(false);
  });

  it('normalizes display names for special Google upstream model ids', () => {
    expect(normalizeAntigravityDisplayName('gemini-4-argon-disabled', 'Gemini 4 Argon'))
      .toBe('Gemini 4 Argon');
    expect(normalizeAntigravityDisplayName('gemini-3.8-flash-tiered'))
      .toBe('Gemini 3.8 Flash (Tiered)');
    expect(normalizeAntigravityDisplayName('gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'))
      .toBe('Gemini 3.8 Flash (High)');
    expect(normalizeAntigravityDisplayName('gemini-2.5-pro', 'Gemini 2.5 Pro'))
      .toBe('Gemini 2.5 Pro');
    expect(normalizeAntigravityDisplayName('custom-future-model', 'Future Custom Model'))
      .toBe('Future Custom Model');
  });

  it('parses Google fetchAvailableModels payload correctly', () => {
    const upstreamPayload = {
      models: {
        chat_20706: { maxOutputTokens: 4096 },
        'gemini-4-argon-disabled': {
          displayName: 'Gemini 4 Argon',
          maxInputTokens: 1048576,
          maxOutputTokens: 65536,
          supportsWebSearch: true,
        },
        'gemini-3.8-flash-tiered': {
          displayName: 'Gemini 3.8 Flash (Tiered)',
          maxInputTokens: 1048576,
          maxOutputTokens: 65536,
        },
        'claude-opus-4-6-thinking': {
          displayName: 'Claude Opus 4.6 (Thinking)',
          maxInputTokens: 200000,
          maxOutputTokens: 64000,
        },
        tab_flash_lite_preview: { maxOutputTokens: 4096 },
        'gpt-oss-120b-medium': {
          displayName: 'GPT-OSS 120B (Medium)',
          maxInputTokens: 114000,
          maxOutputTokens: 32768,
        },
      },
    };

    const models = parseAntigravityModelsPayload(upstreamPayload);
    expect(models.length).toBe(4);

    const ids = models.map((m) => m.id);
    expect(ids).toContain('gemini-4-argon-disabled');
    expect(ids).toContain('gemini-3.8-flash-tiered');
    expect(ids).toContain('claude-opus-4-6-thinking');
    expect(ids).toContain('gpt-oss-120b-medium');

    const argon = models.find((m) => m.id === 'gemini-4-argon-disabled')!;
    expect(argon.displayName).toBe('Gemini 4 Argon');
    expect(argon.contextLength).toBe(1048576);
    expect(argon.supportsWebSearch).toBe(true);

    const tiered = models.find((m) => m.id === 'gemini-3.8-flash-tiered')!;
    expect(tiered.displayName).toBe('Gemini 3.8 Flash (Tiered)');
    expect(tiered.supportsThinking).toBe(true);
  });

  it('injects new Antigravity aliases into YAML without duplicating existing ones', () => {
    const initialYaml = `
config-version: 8
models:
    catalog: ""
    model-alias:
        antigravity:
            - name: "gemini-3.8-flash-high"
              alias: "claude-fable-5-1"
              fork: true
              force-mapping: true
`;
    const toSync = [
      { name: 'gemini-3.8-flash-high', alias: 'claude-fable-5-1', displayName: 'Claude Fable' },
      { name: 'gemini-3.8-flash-tiered', alias: 'gemini-3.8-flash-tiered', displayName: 'Gemini 3.8 Flash (Tiered)' },
      { name: 'gemini-4-argon-disabled', alias: 'gemini-4-argon', displayName: 'Gemini 4 Argon' },
    ];

    const { updatedYaml, addedCount } = injectAntigravityAliasesToYaml(initialYaml, toSync);
    expect(addedCount).toBe(2);
    expect(updatedYaml).toContain('alias: "gemini-3.8-flash-tiered"');
    expect(updatedYaml).toContain('alias: "gemini-4-argon"');
    expect(updatedYaml).toContain('name: "gemini-4-argon-disabled"');

    // 再次调用时不重复注入
    const secondRun = injectAntigravityAliasesToYaml(updatedYaml, toSync);
    expect(secondRun.addedCount).toBe(0);
  });
});
