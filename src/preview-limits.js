'use strict';
const {MAX_FILE}=require('./web-import');
// The token allowance covers every possible token in an accepted source file.
const OUTPUT_BYTES=4*MAX_FILE,DECODED_BYTES=MAX_FILE,ATTRIBUTE_BYTES=MAX_FILE>>5,TOKENS=MAX_FILE;
function limit(){return Object.assign(Error('preview resource limit exceeded'),{code:'PREVIEW_LIMIT'});}
function check(value,budget){if(Buffer.byteLength(value)>budget)throw limit();return value;}
function writer(budget=OUTPUT_BYTES){
 const blocks=[];let chunks=[],size=0;
 return {push(...values){for(const value of values){const bytes=Buffer.byteLength(value);if(bytes>budget-size)throw limit();size+=bytes;chunks.push(value);if(chunks.length===4096){blocks.push(chunks.join(''));chunks=[];}}},join(){return blocks.join('')+chunks.join('');}};
}
module.exports={OUTPUT_BYTES,DECODED_BYTES,ATTRIBUTE_BYTES,TOKENS,limit,check,writer};
