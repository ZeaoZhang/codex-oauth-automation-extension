const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const normalStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : normalStart;
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

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
  extractFunction('executeStepViaCompletionSignal'),
].join('\n');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('executeStepViaCompletionSignal returns as soon as completion signal arrives', async () => {
  const executeDeferred = deferred();
  const notifiedErrors = [];

  const api = new Function(
    'waitForStepComplete',
    'executeStep',
    'isStopError',
    'isRetryableContentScriptTransportError',
    'notifyStepError',
    'getErrorMessage',
    'finalizeDeferredStepExecutionError',
    'AUTO_RUN_SIGNAL_COMPLETION_TIMEOUT_MS',
    'LOG_PREFIX',
    `${bundle}; return { executeStepViaCompletionSignal };`
  )(
    async () => ({ chatgptPage: true }),
    async () => executeDeferred.promise,
    () => false,
    (error) => /did not respond/i.test(String(error?.message || error)),
    (step, error) => {
      notifiedErrors.push({ step, error });
    },
    (error) => String(error?.message || error),
    async () => {
      throw new Error('finalizeDeferredStepExecutionError should not run when completion succeeds first');
    },
    120000,
    '[test]'
  );

  const result = await Promise.race([
    api.executeStepViaCompletionSignal(5),
    new Promise((_, reject) => setTimeout(() => reject(new Error('completion-first race timed out')), 50)),
  ]);

  assert.deepEqual(
    result,
    { chatgptPage: true },
    '完成信号应优先结束等待，而不是卡住等待 executeStep 的消息超时'
  );
  assert.deepEqual(notifiedErrors, [], '完成信号先到时不应额外上报错误');

  executeDeferred.reject(new Error('Content script on signup-page did not respond in 30s. Try refreshing the tab and retry.'));
  await new Promise(resolve => setTimeout(resolve, 0));
});
