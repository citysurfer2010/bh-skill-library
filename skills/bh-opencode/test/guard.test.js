'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const load = () => import('../plugin/bh-guard.js').then((m) => m.BhGuard);
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

function repoWithRemote() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const remote = path.join(root, 'remote.git'); const repo = path.join(root, 'repo');
  fs.mkdirSync(remote); sh(remote, 'init', '-q', '--bare', '-b', 'main');
  fs.mkdirSync(repo); sh(repo, 'init', '-q', '-b', 'main');
  sh(repo, 'config', 'user.email', 'a@b.de'); sh(repo, 'config', 'user.name', 'A');
  sh(repo, 'remote', 'add', 'origin', remote);
  return { repo, remote };
}
const commit = (repo, name, text = 'x') => { fs.writeFileSync(path.join(repo, name), text); sh(repo, 'add', name); sh(repo, 'commit', '-q', '-m', `feat: add ${name}`); };
const remoteHas = (remote, branch) => { try { sh(remote, 'rev-parse', '--verify', branch); return true; } catch { return false; } };

test('dangerous commands are blocked', async () => {
  const { inspect } = (await load()).internals;
  for (const cmd of ['git push --force origin feat/x', 'git push -f', 'git push origin +feat/x', 'git push --force-with-lease', 'git commit --no-verify -m "feat: x"', 'git push --no-verify', 'git reset --hard HEAD~1', 'git clean -fd', 'git checkout .', 'git restore .', 'cat /etc/devbox/llm/token', 'cd x && git -C y reset --hard']) {
    assert.ok(inspect(cmd).block, cmd);
  }
});

test('normal commands pass', async () => {
  const { inspect } = (await load()).internals;
  for (const cmd of ['git status', 'git push -u origin feat/x', 'git checkout feature', 'git reset HEAD file', 'git clean -n', 'ls -la', 'git commit -m "fix(auth): keep the session"', 'git commit -m "docs: explain git push --force"']) {
    assert.equal(inspect(cmd).block, undefined, cmd);
  }
});

test('commit subject must follow the format and be English', async () => {
  const { inspect } = (await load()).internals;
  assert.match(inspect('git commit -m "added stuff"').block, /Format/);
  assert.match(inspect('git commit -m "fix: Fehler beim Login für alle"').block, /Englisch/);
  assert.match(inspect(`git commit -am 'feat: neue und bessere Suche'`).block, /Englisch/);
  assert.equal(inspect('git add a && git commit -m "feat: a; b && c"').block, undefined);
  assert.equal(inspect('git commit -m "docs: add MIT license"').block, undefined);
});

test('a push to main is refused once main exists, the first push is allowed', async () => {
  const { protectedPush, inspect } = (await load()).internals;
  const { repo } = repoWithRemote(); commit(repo, 'a');
  const named = inspect('git push origin main');
  assert.equal(await protectedPush(named, repo), null, 'first push creates main');
  sh(repo, 'push', '-q', 'origin', 'main');
  assert.match(await protectedPush(named, repo), /gesperrt/);
  assert.match(await protectedPush(inspect('git push'), repo), /gesperrt/);
  assert.match(await protectedPush(inspect('git push origin HEAD:refs/heads/main'), repo), /gesperrt/);
  sh(repo, 'switch', '-q', '-c', 'feat/x');
  assert.equal(await protectedPush(inspect('git push'), repo), null);
});

test('auto push: feature branch yes, main never, secrets never', async () => {
  const { autoPush } = (await load()).internals;
  const { repo, remote } = repoWithRemote(); commit(repo, 'a'); sh(repo, 'push', '-q', 'origin', 'main');
  commit(repo, 'b');
  assert.equal((await autoPush(repo)).state, 'skipped', 'main is not pushed');
  sh(repo, 'switch', '-q', '-c', 'feat/x'); commit(repo, 'c');
  assert.equal((await autoPush(repo)).state, 'pushed'); assert.ok(remoteHas(remote, 'feat/x'));
  assert.equal((await autoPush(repo)).state, 'nothing');
  commit(repo, 'd', `key = ghp_${'a'.repeat(30)}`);
  assert.equal((await autoPush(repo)).state, 'secret');
});

test('hooks: config adds context and rules, a block aborts the tool', async () => {
  const hooks = await (await load())({ directory: os.tmpdir() });
  const config = { instructions: ['/etc/opencode/CODING-RULES.md'] };
  await hooks.config(config); await hooks.config(config);
  assert.equal(config.instructions.length, 3); assert.ok(config.instructions.some((i) => i.endsWith('/CONTEXT.md')));
  await assert.rejects(hooks['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git reset --hard' } }), /BH-Regel/);
  await assert.rejects(hooks['tool.execute.before']({ tool: 'read' }, { args: { filePath: '/etc/devbox/llm/token' } }), /Tokens/);
  await hooks['tool.execute.before']({ tool: 'bash' }, { args: { command: 'ls' } });
});

test('post hook reminds once per app about tests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-app-')); fs.mkdirSync(path.join(root, 'test')); fs.writeFileSync(path.join(root, 'test/run-all.sh'), '');
  const hooks = await (await load())({ directory: root });
  const first = { output: 'ok' }; const second = { output: 'ok' };
  await hooks['tool.execute.after']({ tool: 'edit', args: { filePath: path.join(root, 'a.js') } }, first);
  await hooks['tool.execute.after']({ tool: 'edit', args: { filePath: path.join(root, 'b.js') } }, second);
  assert.match(first.output, /npm test/); assert.equal(second.output, 'ok');
});

test('only the plugin itself is exported', async () => {
  assert.deepEqual(Object.keys(await import('../plugin/bh-guard.js')), ['BhGuard']);
});
