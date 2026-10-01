'use strict';
const assert=require('node:assert/strict');const RX=require('../src/patterns');const pattern=RX[process.argv[2]];assert(pattern instanceof RegExp);
const n=2*1024*1024;
const shapes=[
 'a'.repeat(n)+'!', '<'+'a'.repeat(n)+'!', '--'+'a'.repeat(n)+'!', 'a:'+' '.repeat(n)+'\n\n',
 ' '.repeat(n)+'!', '\n'.repeat(n)+'!', '\r\n'.repeat(n/2)+'!', '\u2028'.repeat(n/3)+'!',
 'url('.repeat(n/4)+'!', 'url("'+'a'.repeat(n)+'!', 'url(\''+'a'.repeat(n)+'!',
 'expression'+' '.repeat(n)+'!', 'https://'+'a'.repeat(n)+'!', '#'+ 'a'.repeat(n)+'!',
 '&#x'+'a'.repeat(n)+'!', '&#'+'1'.repeat(n)+'!', '"'.repeat(n), '<>&'.repeat(n/3),
 '/ '.repeat(n/2)+'!', '</script'+' '.repeat(n)+'!', 'data-'+'a'.repeat(n)+'!', '\\'.repeat(n),
];
for(const input of shapes){pattern.lastIndex=0;if(pattern.global||pattern.sticky){for(let m;(m=pattern.exec(input));){if(m[0].length===0)pattern.lastIndex++;}}else pattern.test(input);}
process.stdout.write(JSON.stringify({name:process.argv[2],shapes:shapes.length,maxInputCharacters:n+16})+'\n');
