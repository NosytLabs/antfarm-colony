import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = mkdtempSync(path.join(tmpdir(),'antfarm-colony-test-'));
const files = readdirSync('tests').filter(f=>/\.test\.(ts|mjs)$/.test(f)).map(f=>path.join('tests',f));
const child = spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{
 stdio:'inherit', env:{...process.env,OPENCLAW_STATE_DIR:path.join(temp,'openclaw'),ANTFARM_HOME:path.join(temp,'colony'),GIT_AUTHOR_NAME:'Antfarm Tests',GIT_AUTHOR_EMAIL:'tests@example.invalid',GIT_COMMITTER_NAME:'Antfarm Tests',GIT_COMMITTER_EMAIL:'tests@example.invalid'}
});
rmSync(temp,{recursive:true,force:true});
process.exit(child.status ?? 1);
