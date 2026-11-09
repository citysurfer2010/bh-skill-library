// OpenCode plugin of the BH Platform: loads context and rules, guards risky commands, pushes finished work.
// OpenCode calls every export of this file as a plugin, so helpers hang off BhGuard.internals.
import { execFile } from 'node:child_process';
import { appendFile, mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SKILL = process.env.BH_OPENCODE_SKILL || '/etc/devbox/skills/bh-opencode';
const PROTECTED = new Set(['main', 'master']);
const SECRET_FILES = /\/etc\/devbox\/llm\/token|\.config\/gh\/hosts\.yml/;
const SECRET_TEXT = /BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|GOCSPX-[A-Za-z0-9_-]{10}/;
const SUBJECT = /^(feat|fix|chore|docs|test|refactor|perf|style|build|ci)(\([a-z0-9-]+\))?!?: \S/;
const GERMAN = /[äöüÄÖÜß]|\b(und|nicht|wird|werden|für|fuer|mit|oder)\b/;
const EDIT_TOOLS = new Set(['edit', 'write', 'multiedit', 'patch']);

function git(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 60_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

const GIT_CALL = /\bgit\b(?:\s+-[cC]\s+\S+)*\s+([a-z-]+)(.*)$/s;

function commitProblem(rest) {
  if (/(^|\s)(--no-verify|-n)(\s|$)/.test(rest)) return 'Hooks werden nicht mit --no-verify umgangen.';
  const message = /(?:^|\s)(?:-[a-z]*m|--message)[= ]?\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
  if (!message) return null;
  const subject = (message[1] ?? message[2]).split('\n')[0];
  if (!SUBJECT.test(subject)) return `Commit-Betreff braucht das Format "<type>(<scope>): <english summary>", erhalten: ${subject}`;
  if (GERMAN.test(subject)) return `Commit-Betreff muss Englisch sein, erhalten: ${subject}`;
  return null;
}

const ASK_USER = 'Das verwirft Arbeit. Erkläre dem User, warum es nötig ist, und lass es ihn selbst ausführen.';

function inspect(command) {
  if (SECRET_FILES.test(command)) return { block: 'Tokens und Zugangsdaten werden nicht gelesen.' };
  // A commit message may contain ";" or "&&", so a commit is judged on the whole rest of the line.
  for (const segment of command.split(/\n|&&|\|\||;/)) {
    const call = GIT_CALL.exec(segment);
    if (!call) continue;
    const [, sub, rest] = call;
    if (sub === 'commit') { const block = commitProblem(GIT_CALL.exec(command.slice(command.indexOf(segment)))[2]); if (block) return { block }; break; }
    if (sub === 'reset' && /--hard/.test(rest)) return { block: ASK_USER };
    if (sub === 'clean' && /(^|\s)-[a-z]*f/.test(rest)) return { block: ASK_USER };
    if ((sub === 'checkout' || sub === 'restore') && /(^|\s)\.(\s|$)/.test(rest)) return { block: ASK_USER };
    if (sub === 'push') {
      if (/(^|\s)(--force\S*|-f)(\s|$)|\s\+\S/.test(rest)) return { block: 'Force-Push ist gesperrt.' };
      if (/--no-verify/.test(rest)) return { block: 'Hooks werden nicht mit --no-verify umgangen.' };
      const args = rest.trim().split(/\s+/).filter((a) => a && !a.startsWith('-'));
      const named = args.slice(1).map((a) => a.split(':').pop().replace(/^refs\/heads\//, '')).find((a) => PROTECTED.has(a));
      return { pushNamed: named, pushCurrent: !named && (args.length < 2 || args.slice(1).includes('HEAD')) };
    }
  }
  return {};
}

function workdirOf(command, fallback, base) {
  const cd = /^\s*cd\s+([^\s;&]+)/.exec(command)?.[1]?.replace(/^~/, os.homedir());
  return cd ? path.resolve(fallback || base, cd) : (fallback || base);
}

async function protectedPush(found, cwd) {
  const branch = found.pushNamed || (found.pushCurrent ? await git(['branch', '--show-current'], cwd) : null);
  if (!branch || !PROTECTED.has(branch)) return null;
  // The first push into a fresh repository has to create the branch.
  if (!(await git(['ls-remote', '--heads', 'origin', branch], cwd))) return null;
  return `Direkter Push auf ${branch} ist gesperrt. Arbeite auf einem Branch und lege einen Pull Request an.`;
}

async function findApp(file) {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (await stat(path.join(dir, 'test/run-all.sh')).then(() => true, () => false)) return dir;
  }
  return null;
}

async function autoPush(repo) {
  const branch = await git(['branch', '--show-current'], repo);
  if (!branch || PROTECTED.has(branch) || !(await git(['remote', 'get-url', 'origin'], repo))) return { state: 'skipped' };
  const range = ['HEAD', '--not', '--remotes=origin'];
  if (!Number(await git(['rev-list', '--count', ...range], repo))) return { state: 'nothing' };
  if (SECRET_TEXT.test((await git(['log', '-p', '--format=', ...range], repo)) ?? '')) return { state: 'secret', branch };
  return { state: (await git(['push', '-u', 'origin', 'HEAD'], repo)) === null ? 'failed' : 'pushed', branch };
}

export const BhGuard = async ({ client, directory }) => {
  const repos = new Set();
  const reminded = new Set();
  const remember = async (dir) => { const root = await git(['rev-parse', '--show-toplevel'], dir); if (root) repos.add(root); };
  const tell = async (message, variant) => {
    const dir = path.join(os.homedir(), '.cache/bh-opencode');
    await mkdir(dir, { recursive: true }).then(() => appendFile(path.join(dir, 'autopush.log'), `${new Date().toISOString()} ${message}\n`)).catch(() => {});
    await client?.tui?.showToast?.({ body: { message, variant } }).catch(() => {});
  };

  return {
    config: async (config) => { config.instructions = [...new Set([...(config.instructions || []), `${SKILL}/CONTEXT.md`, `${SKILL}/RULES.md`])]; },

    'tool.execute.before': async ({ tool }, { args }) => {
      if (tool === 'read' && SECRET_FILES.test(args?.filePath || '')) throw new Error('Tokens und Zugangsdaten werden nicht gelesen.');
      if (tool !== 'bash' || !args?.command) return;
      const found = inspect(args.command);
      const block = found.block || await protectedPush(found, workdirOf(args.command, args.workdir, directory));
      if (block) throw new Error(`[BH-Regel] ${block}`);
    },

    'tool.execute.after': async ({ tool, args }, output) => {
      if (tool === 'bash') { await remember(workdirOf(args?.command || '', args?.workdir, directory)); return; }
      if (!EDIT_TOOLS.has(tool) || !args?.filePath) return;
      await remember(path.dirname(args.filePath));
      const app = await findApp(args.filePath);
      if (!app || reminded.has(app)) return;
      reminded.add(app);
      output.output += `\n\n[BH-Regel] ${path.basename(app)}: vor dem Commit \`npm test\` laufen lassen und die Version JJ.M.N erhöhen.`;
    },

    event: async ({ event }) => {
      if (event.type !== 'session.idle') return;
      await remember(directory);
      for (const repo of repos) {
        const result = await autoPush(repo);
        const name = path.basename(repo);
        if (result.state === 'pushed') await tell(`${name}: ${result.branch} gepusht`, 'success');
        if (result.state === 'failed') await tell(`${name}: Push von ${result.branch} fehlgeschlagen`, 'error');
        if (result.state === 'secret') await tell(`${name}: nicht gepusht, möglicherweise ein Geheimnis in den Commits`, 'error');
      }
    },
  };
};

BhGuard.internals = { inspect, autoPush, protectedPush, workdirOf };
