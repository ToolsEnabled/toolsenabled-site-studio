'use strict';
// Stops before any test when TMPDIR cannot work: relative, reached through a symbolic link or too long for Chrome's
// lock socket (test/helpers.js tmpdirProblem, docs/TESTING.md).
const fs=require('node:fs');const {spawnSync}=require('node:child_process');const path=require('node:path');
const problem=require('../test/helpers').tmpdirProblem();
if(problem){console.error('Site Studio tests not started: '+problem);process.exit(2);}
const files=fs.readdirSync(path.join(__dirname,'../test')).filter(f=>f.endsWith('.test.js')).sort().map(f=>path.join(__dirname,'../test',f));
const env={...process.env};delete env.DISPLAY;
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=120000',...files],{stdio:'inherit',env});
if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
