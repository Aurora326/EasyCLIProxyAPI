import { apiCallErrorMessage, isRecord, managementApi, readString } from './managementApi';

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export type AntigravityDiscoveredModel = {
  id: string;
  displayName: string;
  description?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  isRealtimeUpstream?: boolean;
};

const ANTIGRAVITY_FETCH_MODELS_URLS = [
  'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
  'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
];

const ANTIGRAVITY_HUB_USER_AGENT = 'antigravity/hub/2.24.0 windows/amd64';

/** 规范化 DisplayName 映射表 */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'gemini-4-argon-disabled': 'Gemini 4 Argon',
  'gemini-4-argon': 'Gemini 4 Argon',
  'gemini-3.8-flash-tiered': 'Gemini 3.8 Flash (Tiered)',
  'gemini-3.8-flash-high': 'Gemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium': 'Gemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low': 'Gemini 3.8 Flash (Low)',
  'gemini-3.5-flash-low': 'Gemini 3.5 Flash (Medium)',
  'gemini-3.5-flash-extra-low': 'Gemini 3.5 Flash (Low)',
  'gemini-3-flash-agent': 'Gemini 3.5 Flash (High)',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-thinking': 'Gemini 2.5 Flash (Thinking)',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-3-flash': 'Gemini 3 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'gemini-3.1-flash-image': 'Gemini 3.1 Flash Image',
  'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6 (Thinking)',
  'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)',
};

/** 过滤掉非对话类、内部代码补全及调试模型 */
export const isInternalAntigravityModel = (modelId: string): boolean => {
  const lower = modelId.trim().toLowerCase();
  return (
    lower.startsWith('chat_') ||
    lower.startsWith('tab_') ||
    lower.includes('preview_internal')
  );
};

export const normalizeAntigravityDisplayName = (modelId: string, upstreamDisplayName?: string): string => {
  const lower = modelId.trim().toLowerCase();
  if (DISPLAY_NAME_OVERRIDES[lower]) {
    return DISPLAY_NAME_OVERRIDES[lower];
  }
  if (upstreamDisplayName && upstreamDisplayName.trim() && upstreamDisplayName.trim() !== modelId) {
    return upstreamDisplayName.trim();
  }
  return modelId;
};

export const parseAntigravityModelsPayload = (payload: unknown): AntigravityDiscoveredModel[] => {
  if (!isRecord(payload)) return [];
  const modelsRecord = isRecord(payload.models) ? payload.models : {};
  const results: AntigravityDiscoveredModel[] = [];

  for (const [key, raw] of Object.entries(modelsRecord)) {
    if (isInternalAntigravityModel(key)) continue;
    if (!isRecord(raw)) continue;

    const upstreamDisplayName = readString(raw, 'displayName', 'display_name');
    const description = readString(raw, 'description');
    const contextLength = numberValue(raw.maxInputTokens ?? raw.contextLength ?? raw.context_length);
    const maxOutputTokens = numberValue(raw.maxOutputTokens ?? raw.max_completion_tokens);
    const supportsWebSearch = Boolean(raw.supportsWebSearch ?? raw.supports_web_search);

    const lower = key.toLowerCase();
    const supportsThinking =
      lower.includes('thinking') ||
      lower.includes('tiered') ||
      lower.includes('high') ||
      lower.includes('medium') ||
      lower.includes('low') ||
      isRecord(raw.thinkingConfig) ||
      isRecord(raw.thinking);

    results.push({
      id: key,
      displayName: normalizeAntigravityDisplayName(key, upstreamDisplayName),
      description: description || undefined,
      contextLength: contextLength ?? undefined,
      maxOutputTokens: maxOutputTokens ?? undefined,
      supportsThinking,
      supportsWebSearch,
      isRealtimeUpstream: true,
    });
  }

  // 排序：Gemini 4 / 3.8 / Claude 置前，其余按字母排序
  return results.sort((a, b) => {
    const priority = (id: string) => {
      const lower = id.toLowerCase();
      if (lower.includes('argon')) return 1;
      if (lower.includes('3.8')) return 2;
      if (lower.includes('opus')) return 3;
      if (lower.includes('sonnet')) return 4;
      if (lower.includes('flash-agent') || lower.includes('3.5')) return 5;
      if (lower.includes('3-flash')) return 6;
      if (lower.includes('2.5-pro')) return 7;
      return 10;
    };
    const pa = priority(a.id);
    const pb = priority(b.id);
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
};

export const fetchUpstreamAntigravityModels = async (
  authIndex: string,
  project?: string,
  timeoutMs = 12000,
): Promise<AntigravityDiscoveredModel[]> => {
  const headers = {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': ANTIGRAVITY_HUB_USER_AGENT,
  };

  let lastError = '';
  for (const url of ANTIGRAVITY_FETCH_MODELS_URLS) {
    try {
      const response = await managementApi.post<Record<string, unknown>>(
        '/api-call',
        {
          authIndex,
          method: 'POST',
          url,
          header: headers,
          data: project ? JSON.stringify({ project }) : undefined,
        },
        { timeoutMs },
      );

      const status = Number(response.status_code ?? response.statusCode ?? 0);
      if (status >= 200 && status < 300) {
        const body = response.body ?? response.bodyText;
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        const models = parseAntigravityModelsPayload(parsed);
        if (models.length > 0) {
          return models;
        }
      } else {
        lastError = apiCallErrorMessage(response);
      }
    } catch (err) {
      lastError = String(err);
    }
  }

  throw new Error(lastError || '无法从 Google 上游获取 Antigravity 可用模型');
};

export type AntigravityAliasMapping = {
  name: string;
  alias: string;
  displayName: string;
};

export const getRecommendedAliasForModel = (model: AntigravityDiscoveredModel): AntigravityAliasMapping => {
  const id = model.id.trim();
  if (id === 'gemini-4-argon-disabled') {
    return { name: id, alias: 'gemini-4-argon', displayName: model.displayName };
  }
  if (id === 'gemini-3-flash-agent') {
    return { name: id, alias: 'gemini-3.5-flash-high', displayName: model.displayName };
  }
  if (id === 'gemini-3.5-flash-low') {
    return { name: id, alias: 'gemini-3.5-flash-medium', displayName: model.displayName };
  }
  if (id === 'gemini-3.5-flash-extra-low') {
    return { name: id, alias: 'gemini-3.5-flash-low', displayName: model.displayName };
  }
  return { name: id, alias: id, displayName: model.displayName };
};

export const injectAntigravityAliasesToYaml = (
  yamlContent: string,
  modelsToSync: AntigravityAliasMapping[],
): { updatedYaml: string; addedCount: number } => {
  // 查找现有的 alias，避免重复
  const existingAliases = new Set<string>();
  const aliasRegex = /alias:\s*["']?([^"'\r\n]+)["']?/g;
  let match: RegExpExecArray | null;
  while ((match = aliasRegex.exec(yamlContent)) !== null) {
    if (match[1]) existingAliases.add(match[1].trim().toLowerCase());
  }

  const newItems = modelsToSync.filter(
    (item) => !existingAliases.has(item.alias.trim().toLowerCase())
  );
  if (newItems.length === 0) {
    return { updatedYaml: yamlContent, addedCount: 0 };
  }

  // 1. 尝试匹配已有的 oauth-model-alias 下的 antigravity:
  const oauthSectionRegex = /((?:^|\n)(oauth-model-alias:\s*[\r\n]+(?:\s+#[^\r\n]*[\r\n]+)*\s+antigravity:\s*[\r\n]+))/;
  if (oauthSectionRegex.test(yamlContent)) {
    const blockLines = newItems.map((item) => {
      return `    - name: "${item.name}"\n      alias: "${item.alias}"\n      fork: true\n      display-name: "${item.displayName}"\n      force-mapping: true`;
    });
    const blockText = blockLines.join('\n') + '\n';
    const updatedYaml = yamlContent.replace(
      oauthSectionRegex,
      `$1${blockText}`,
    );
    return { updatedYaml, addedCount: newItems.length };
  }

  // 2. 尝试匹配已有的 model-alias 下的 antigravity:
  const modelSectionRegex = /((?:^|\n)(model-alias:\s*[\r\n]+(?:\s+#[^\r\n]*[\r\n]+)*\s+antigravity:\s*[\r\n]+))/;
  if (modelSectionRegex.test(yamlContent)) {
    const blockLines = newItems.map((item) => {
      return `        - name: "${item.name}"\n          alias: "${item.alias}"\n          fork: true\n          display-name: "${item.displayName}"\n          force-mapping: true`;
    });
    const blockText = blockLines.join('\n') + '\n';
    const updatedYaml = yamlContent.replace(
      modelSectionRegex,
      `$1${blockText}`,
    );
    return { updatedYaml, addedCount: newItems.length };
  }

  // 3. 如果都没有，在文件末尾追加标准的 oauth-model-alias:
  const blockLines = newItems.map((item) => {
    return `    - name: "${item.name}"\n      alias: "${item.alias}"\n      fork: true\n      display-name: "${item.displayName}"\n      force-mapping: true`;
  });
  const blockText = blockLines.join('\n');
  const updatedYaml = `${yamlContent.trimEnd()}\n\noauth-model-alias:\n  antigravity:\n${blockText}\n`;
  return { updatedYaml, addedCount: newItems.length };
};

export const syncUpstreamAntigravityModelsToGateway = async (
  models: AntigravityDiscoveredModel[],
): Promise<{ addedCount: number }> => {
  const mappings = models.map(getRecommendedAliasForModel);
  // 1. 获取当前网关的 config.yaml
  const currentYaml = await managementApi.get<string>('/config.yaml');
  if (typeof currentYaml !== 'string') {
    throw new Error('无法读取网关 config.yaml');
  }

  // 2. 注入新别名
  const { updatedYaml, addedCount } = injectAntigravityAliasesToYaml(currentYaml, mappings);
  if (addedCount === 0) {
    return { addedCount: 0 };
  }

  // 3. 提交更新后的 config.yaml
  await managementApi.put('/config.yaml', updatedYaml);
  return { addedCount };
};

/**
 * 自动静默同步：探测并同步 Antigravity 上游模型至本地网关
 * 无需用户手动点击任何按钮，有新模型时自动静默注入本地网关
 */
let autoSyncPromise: Promise<{ addedCount: number; models: AntigravityDiscoveredModel[] }> | null = null;
export const autoSyncAntigravityUpstreamModels = async (): Promise<{
  addedCount: number;
  models: AntigravityDiscoveredModel[];
}> => {
  if (autoSyncPromise) return autoSyncPromise;
  autoSyncPromise = (async () => {
    try {
      // 1. 获取所有凭证文件
      const authFilesPayload = await managementApi.get<Record<string, unknown>>('/auth-files');
      const files = isRecord(authFilesPayload) && Array.isArray(authFilesPayload.files)
        ? authFilesPayload.files
        : [];
      const antigravityFile = files.find((f) => {
        if (!isRecord(f)) return false;
        const provider = readString(f, 'provider', 'type').toLowerCase();
        return provider === 'antigravity' && !f.disabled;
      });
      if (!antigravityFile || !isRecord(antigravityFile)) {
        return { addedCount: 0, models: [] };
      }

      const authIndex = readString(antigravityFile, 'auth_index', 'authIndex', 'id', 'name');
      const projectId = readString(antigravityFile, 'project_id', 'projectId') || 'aicode-consumers';
      if (!authIndex) return { addedCount: 0, models: [] };

      // 2. 向上游发起探测
      const upstreamModels = await fetchUpstreamAntigravityModels(authIndex, projectId);
      if (!upstreamModels || upstreamModels.length === 0) {
        return { addedCount: 0, models: [] };
      }

      // 3. 自动同步注入网关（容错隔离：即使网关写入出现波动，探测到的模型也完整返回）
      let addedCount = 0;
      try {
        const syncResult = await syncUpstreamAntigravityModelsToGateway(upstreamModels);
        addedCount = syncResult.addedCount;
      } catch (syncErr) {
        console.warn('Antigravity 模型别名同步至网关跳过:', syncErr);
      }

      return { addedCount, models: upstreamModels };
    } catch (error) {
      console.warn('Antigravity 上游模型自动同步跳过:', error);
      return { addedCount: 0, models: [] };
    } finally {
      setTimeout(() => {
        autoSyncPromise = null;
      }, 30_000); // 30秒冷却
    }
  })();
  return autoSyncPromise;
};
