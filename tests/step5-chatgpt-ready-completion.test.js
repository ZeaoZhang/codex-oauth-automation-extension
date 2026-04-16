const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const normalStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : normalStart;
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

const bundle = [
  extractFunction('parseUrlSafely'),
  extractFunction('isStep5ChatGPTLandingPageUrl'),
  extractFunction('maybeCompleteStep5FromSignupPageReady'),
].join('\n');

function createApi({ state, addLog, completeStepFromBackground }) {
  return new Function(
    'getState',
    'addLog',
    'completeStepFromBackground',
    `${bundle}; return { isStep5ChatGPTLandingPageUrl, maybeCompleteStep5FromSignupPageReady };`
  )(
    async () => state,
    addLog,
    completeStepFromBackground
  );
}

(async () => {
  const api = createApi({
    state: { stepStatuses: { 5: 'running' } },
    addLog: async () => {},
    completeStepFromBackground: async () => {},
  });

  assert.strictEqual(
    api.isStep5ChatGPTLandingPageUrl('https://chatgpt.com/'),
    true,
    'chatgpt 根路径应视为 Step 5 成功落地页'
  );

  assert.strictEqual(
    api.isStep5ChatGPTLandingPageUrl('https://chatgpt.com/auth/login'),
    false,
    'chatgpt 认证路由不应视为 Step 5 成功落地页'
  );

  let completedPayload = null;
  let completedCalls = 0;
  let logCalls = 0;
  const readyApi = createApi({
    state: { stepStatuses: { 5: 'running' } },
    addLog: async () => { logCalls += 1; },
    completeStepFromBackground: async (step, payload) => {
      completedCalls += 1;
      completedPayload = { step, payload };
    },
  });

  const handled = await readyApi.maybeCompleteStep5FromSignupPageReady(
    { source: 'signup-page' },
    { tab: { url: 'https://chatgpt.com/' } }
  );

  assert.strictEqual(handled, true, 'Step 5 运行中且进入 chatgpt.com 时应自动收尾');
  assert.strictEqual(logCalls, 1, '自动收尾时应记录日志');
  assert.deepStrictEqual(
    completedPayload,
    { step: 5, payload: { chatgptPage: true } },
    '自动收尾应以 chatgptPage 成功态结束 Step 5'
  );
  assert.strictEqual(completedCalls, 1, '自动收尾只应触发一次');

  let ignoredCompletion = 0;
  const ignoredApi = createApi({
    state: { stepStatuses: { 5: 'completed' } },
    addLog: async () => {},
    completeStepFromBackground: async () => { ignoredCompletion += 1; },
  });

  const ignored = await ignoredApi.maybeCompleteStep5FromSignupPageReady(
    { source: 'signup-page' },
    { tab: { url: 'https://chatgpt.com/' } }
  );

  assert.strictEqual(ignored, false, '非运行中的 Step 5 不应重复收尾');
  assert.strictEqual(ignoredCompletion, 0, '非运行中的 Step 5 不应调用后台收尾');

  console.log('step5 chatgpt ready completion tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
