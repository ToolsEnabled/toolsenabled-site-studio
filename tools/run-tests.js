'use strict';
const fs=require('node:fs');const {spawnSync}=require('node:child_process');const path=require('node:path');
const files=fs.readdirSync(path.join(__dirname,'../test')).filter(f=>f.endsWith('.test.js')).sort().map(f=>path.join(__dirname,'../test',f));
const env={...process.env};delete env.DISPLAY;
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=30000',...files],{stdio:'inherit',env});
if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
