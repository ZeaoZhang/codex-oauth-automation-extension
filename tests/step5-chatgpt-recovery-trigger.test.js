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
  extractFunction('shouldRecoverStep5OnSignupTabUpdate'),
].join('\n');

const api = new Function(
  `${bundle}; return { isStep5ChatGPTLandingPageUrl, shouldRecoverStep5OnSignupTabUpdate };`
)();

assert.strictEqual(
  api.shouldRecoverStep5OnSignupTabUpdate(12, 12, 'running', 'https://chatgpt.com/'),
  true,
  'signup-page 当前标签且 Step 5 运行中时，应对 chatgpt 首页跳转触发恢复'
);

assert.strictEqual(
  api.shouldRecoverStep5OnSignupTabUpdate(12, 99, 'running', 'https://chatgpt.com/'),
  false,
  '非 signup-page 当前标签不应触发恢复'
);

assert.strictEqual(
  api.shouldRecoverStep5OnSignupTabUpdate(12, 12, 'completed', 'https://chatgpt.com/'),
  false,
  'Step 5 非运行状态不应触发恢复'
);

assert.strictEqual(
  api.shouldRecoverStep5OnSignupTabUpdate(12, 12, 'running', 'https://chatgpt.com/auth/login'),
  false,
  'chatgpt 认证路由不应触发恢复'
);

console.log('step5 chatgpt recovery trigger tests passed');
