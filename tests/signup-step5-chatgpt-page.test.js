const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

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
  extractFunction('isStep5ChatGPTLandingPageReady'),
  extractFunction('waitForStep5SubmitOutcome'),
].join('\n');

function buildApi({
  location,
  getStep5ErrorText = () => '',
  isAddPhonePageReady = () => false,
  isStep8Ready = () => false,
  sleep = async () => {},
  throwIfStopped = () => {},
} = {}) {
  return new Function(
    'location',
    'getStep5ErrorText',
    'isAddPhonePageReady',
    'isStep8Ready',
    'sleep',
    'throwIfStopped',
    `${bundle}; return { isStep5ChatGPTLandingPageReady, waitForStep5SubmitOutcome };`
  )(
    location,
    getStep5ErrorText,
    isAddPhonePageReady,
    isStep8Ready,
    sleep,
    throwIfStopped
  );
}

test('isStep5ChatGPTLandingPageReady matches plain chatgpt.com landing page', () => {
  const api = buildApi({
    location: {
      hostname: 'chatgpt.com',
      pathname: '/',
      href: 'https://chatgpt.com/',
    },
  });

  assert.equal(api.isStep5ChatGPTLandingPageReady(), true);
});

test('isStep5ChatGPTLandingPageReady ignores auth routes on chatgpt.com', () => {
  const api = buildApi({
    location: {
      hostname: 'chatgpt.com',
      pathname: '/auth/login',
      href: 'https://chatgpt.com/auth/login',
    },
  });

  assert.equal(api.isStep5ChatGPTLandingPageReady(), false);
});

test('waitForStep5SubmitOutcome treats chatgpt.com landing page as success', async () => {
  const api = buildApi({
    location: {
      hostname: 'chatgpt.com',
      pathname: '/',
      href: 'https://chatgpt.com/',
    },
  });

  const result = await api.waitForStep5SubmitOutcome(50);
  assert.deepEqual(result, { success: true, chatgptPage: true });
});
