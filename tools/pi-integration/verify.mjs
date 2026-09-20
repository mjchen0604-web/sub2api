// Exercise the real, pinned Pi adapter against the existing Sub2API gateway.
// Read a Sub2API API key, never the upstream Codex auth file.
import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stream } from '@earendil-works/pi-ai/api/openai-responses';

const keyFile = process.env.SUB2API_KEY_FILE;
if (!keyFile || (statSync(keyFile).mode & 0o077)) throw Error('Set SUB2API_KEY_FILE to a private key file');
const apiKey = readFileSync(keyFile,'utf8').trim();
const baseUrl = process.env.SUB2API_BASE_URL || 'http://127.0.0.1:8080/v1';
const url = new URL(baseUrl);
if (url.hostname !== '127.0.0.1' && url.protocol !== 'https:') throw Error('Use HTTPS or literal loopback');
const model = { id: process.env.SUB2API_MODEL || 'gpt-6-astra', name:'Sub2API', api:'openai-responses', provider:'sub2api', baseUrl,
 reasoning:true, input:['text'], cost:{input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow:128000,maxTokens:1024 };
const sessionId=randomUUID();
const context={systemPrompt:'You are verifying a tool integration. Follow the user request exactly.',messages:[
 {role:'user',content:'Call integration_echo once with value PI_SUB2API_OK. After the tool result, reply with its exact text only.',timestamp:Date.now()}
],tools:[{name:'integration_echo',description:'Return the verification value.',parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}]};
let requests=0;
async function run(extra={}) {
 const counts={}; let httpStatus=0; let requestedModel;
 const observedModels=new Set();
 let observation=Promise.resolve();
 const observeFetch=async (input,init)=>{
  const response=await fetch(input,init);
  if(response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
   observation=response.clone().text().then(wire=>{
    for(const line of wire.split('\n')) {
     if(!line.startsWith('data:')) continue;
     try {const event=JSON.parse(line.slice(5)); const value=event.response?.model;
      if(typeof value==='string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value)) observedModels.add(value);
     } catch {}
    }
   });
  }
  return response;
 };
 const response=stream(model,context,{apiKey,sessionId,maxRetries:0,timeoutMs:90000,signal:AbortSignal.timeout(95000),reasoningEffort:'low',
 fetch:observeFetch,onPayload:body=>{requestedModel=body.model},onResponse:r=>{httpStatus=r.status},...extra}); requests++;
 for await(const event of response) counts[event.type]=(counts[event.type]||0)+1;
 const result=await response.result();
 await observation;
 // Do not log provider errors or message contents: errors can echo request data.
 console.log(JSON.stringify({request:requests,httpStatus,requestedModel,stopReason:result.stopReason,events:counts,observedModels:[...observedModels]}));
 const expectedModels=process.env.SUB2API_EXPECT_MODELS || (['gpt-6','gpt-6-astra'].includes(model.id) ? 'gpt-6,gpt-6-astra' : '');
 if(expectedModels) {
  const allowed=expectedModels.split(',');
  assert.ok(observedModels.size>0 && [...observedModels].every(m=>allowed.includes(m)), 'Actual response model did not match the requested family');
 }
 assert.ok(!['error','aborted','pending','length'].includes(result.stopReason),'Pi did not complete successfully');
 return result;
}
const first=await run({toolChoice:{type:'function',name:'integration_echo'}});
const calls=first.content.filter(x=>x.type==='toolCall');
assert.equal(calls.length,1,'Expected one tool call');
assert.equal(calls[0].name,'integration_echo');assert.equal(calls[0].arguments.value,'PI_SUB2API_OK');
context.messages.push(first,{role:'toolResult',toolCallId:calls[0].id,toolName:calls[0].name,content:[{type:'text',text:'PI_SUB2API_OK'}],isError:false,timestamp:Date.now()});
const second=await run({toolChoice:'none'});
assert.equal(second.content.filter(x=>x.type==='text').map(x=>x.text).join('').trim(),'PI_SUB2API_OK');
console.log(JSON.stringify({result:'PASS',adapter:'@earendil-works/pi-ai@0.85.1',verified:['SSE completion','tool call arguments','tool result continuation','final text'],requests}));
