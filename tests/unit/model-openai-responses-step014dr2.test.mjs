import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createOpenAIResponsesAdapter } from "../../packages/model-openai-responses/dist/index.js";

async function collect(iterable){const out=[];for await(const event of iterable)out.push(event);return out;}
async function readBody(request){return JSON.parse(await new Promise(resolve=>{let value="";request.setEncoding("utf8");request.on("data",chunk=>value+=chunk);request.on("end",()=>resolve(value));}));}
async function withServer(handler,run){const server=createServer(handler);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));try{return await run(server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
function sse(response,events){response.writeHead(200,{"content-type":"text/event-stream"});for(const event of events)response.write(`data: ${JSON.stringify(event)}\n\n`);response.end();}

const baseRequest={requestId:"r",provider:"default",model:"gpt-4.1",systemInstructions:"system",maxOutputTokens:128};

test("OpenAI Responses adapter aliases dotted canonical Tool names and restores the canonical Tool call",async()=>{
  let body;
  const events=await withServer(async(request,response)=>{
    body=await readBody(request);
    const alias=body.tools.find(tool=>tool.description.includes("agent.spawn")).name;
    sse(response,[
      {type:"response.created",response:{id:"resp-alias"}},
      {type:"response.output_item.added",item:{type:"function_call",call_id:"call-1",name:alias,arguments:""}},
      {type:"response.function_call_arguments.done",call_id:"call-1",arguments:'{"task":"child"}'},
      {type:"response.output_item.done",item:{type:"function_call",call_id:"call-1",name:alias,arguments:'{"task":"child"}'}},
      {type:"response.completed",response:{id:"resp-alias",usage:{input_tokens:5,output_tokens:3,total_tokens:8}}},
    ]);
  },async port=>collect(createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${port}/v1`,apiKey:"secret"}).stream({
    ...baseRequest,
    messages:[{role:"user",content:[{type:"text",text:"delegate"}]}],
    tools:[{name:"agent.spawn",description:"spawn one child",inputSchema:{type:"object",properties:{task:{type:"string"}},required:["task"],additionalProperties:false}}],
  })));
  assert.equal(body.tools.length,1);
  assert.match(body.tools[0].name,/^[A-Za-z0-9_-]{1,64}$/);
  assert.equal(body.tools[0].name.includes("."),false);
  assert.match(body.tools[0].description,/OpenRill canonical Tool name: agent\.spawn/);
  assert.equal(events.find(event=>event.type==="tool_call").name,"agent.spawn");
});

test("OpenAI Responses adapter keeps aliases deterministic and collision-free across history and definitions",async()=>{
  let body;
  await withServer(async(request,response)=>{
    body=await readBody(request);
    sse(response,[{type:"response.created",response:{id:"resp-collision"}},{type:"response.completed",response:{id:"resp-collision",usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}]);
  },async port=>collect(createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${port}/v1`,apiKey:"secret"}).stream({
    ...baseRequest,
    messages:[
      {role:"assistant",content:[{type:"tool_call",toolCallId:"call-old",name:"agent.spawn",arguments:{task:"old"}}]},
      {role:"tool",content:[{type:"tool_result",toolCallId:"call-old",name:"agent.spawn",output:{ok:true},isError:false}]},
    ],
    tools:[
      {name:"agent.spawn",description:"dotted",inputSchema:{type:"object"}},
      {name:"agent_spawn",description:"already valid",inputSchema:{type:"object"}},
    ],
  })));
  const names=body.tools.map(tool=>tool.name);
  assert.equal(new Set(names).size,2);
  assert.ok(names.every(name=>/^[A-Za-z0-9_-]{1,64}$/.test(name)));
  const dottedAlias=body.tools.find(tool=>tool.description.includes("canonical Tool name: agent.spawn")).name;
  assert.notEqual(dottedAlias,"agent_spawn");
  assert.equal(body.input.find(item=>item.type==="function_call").name,dottedAlias);
  assert.match(dottedAlias,/^agent_spawn_[a-f0-9]{16}$/);
});

test("OpenAI Responses adapter rejects an unknown provider Tool alias",async()=>{
  await assert.rejects(()=>withServer(async(_request,response)=>{
    sse(response,[
      {type:"response.created",response:{id:"resp-unknown"}},
      {type:"response.output_item.done",item:{type:"function_call",call_id:"call-unknown",name:"unknown_alias",arguments:"{}"}},
      {type:"response.completed",response:{id:"resp-unknown"}},
    ]);
  },async port=>collect(createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${port}/v1`,apiKey:"secret"}).stream({
    ...baseRequest,
    messages:[{role:"user",content:[{type:"text",text:"delegate"}]}],
    tools:[{name:"agent.spawn",description:"spawn",inputSchema:{type:"object"}}],
  }))),error=>error?.code==="MODEL_STREAM_INVALID"&&/unknown function name/.test(error.message));
});
