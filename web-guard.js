#!/usr/bin/env node
'use strict';
const guard=require('./src/web-guard');
if(require.main===module)guard.run();
module.exports=guard;
