import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createOpenAIResponsesAdapter } from "../../packages/model-openai-responses/dist/index.js";

async function collect(iterable){const out=[];for await(const event of iterable)out.push(event);return out;}
async function readBody(request){return JSON.parse(await new Promise(resolve=>{let value="";request.setEncoding("utf8");request.on("data",chunk=>value+=chunk);request.on("end",()=>resolve(value));}));}
async function withServer(handler,run){const server=createServer(handler);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));try{return await run(server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
function sse(response,events){response.writeHead(200,{"content-type":"text/event-stream"});for(const event of events)response.write(`data: ${JSON.stringify(event)}\n\n`);response.end();}
const baseRequest={requestId:"r",provider:"default",model:"gpt-4.1",systemInstructions:"system",maxOutputTokens:128};
const tool={name:"agent.spawn",description:"spawn one child",inputSchema:{type:"object",properties:{task:{type:"string"}},required:["task"],additionalProperties:false}};

test("STEP014DR3 unifies item_id and call_id for parallel Tool calls without blank duplicates",async()=>{
  const events=await withServer(async(request,response)=>{
    const body=await readBody(request);
    const alias=body.tools[0].name;
    sse(response,[
      {type:"response.created",response:{id:"resp-identity"}},
      {type:"response.output_item.added",item:{id:"fc-1",type:"function_call",call_id:"call-1",name:alias,arguments:""}},
      {type:"response.function_call_arguments.delta",item_id:"fc-1",delta:'{"task":"alpha"}'},
      {type:"response.function_call_arguments.done",item_id:"fc-1",arguments:'{"task":"alpha"}'},
      {type:"response.output_item.added",item:{id:"fc-2",type:"function_call",call_id:"call-2",name:alias,arguments:""}},
      {type:"response.function_call_arguments.delta",item_id:"fc-2",delta:'{"task":"beta"}'},
      {type:"response.function_call_arguments.done",item_id:"fc-2",arguments:'{"task":"beta"}'},
      {type:"response.output_item.done",item:{id:"fc-1",type:"function_call",call_id:"call-1",name:alias,arguments:'{"task":"alpha"}'}},
      {type:"response.output_item.done",item:{id:"fc-2",type:"function_call",call_id:"call-2",name:alias,arguments:'{"task":"beta"}'}},
      {type:"response.completed",response:{id:"resp-identity",usage:{input_tokens:8,output_tokens:4,total_tokens:12}}},
    ]);
  },async port=>collect(createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${port}/v1`,apiKey:"secret"}).stream({
    ...baseRequest,messages:[{role:"user",content:[{type:"text",text:"spawn two"}]}],tools:[tool],
  })));
  const calls=events.filter(event=>event.type==="tool_call");
  assert.deepEqual(calls.map(call=>({toolCallId:call.toolCallId,name:call.name,argumentsJson:call.argumentsJson})),[
    {toolCallId:"call-1",name:"agent.spawn",argumentsJson:'{"task":"alpha"}'},
    {toolCallId:"call-2",name:"agent.spawn",argumentsJson:'{"task":"beta"}'},
  ]);
  assert.equal(calls.some(call=>call.name===""),false);
});

test("STEP014DR3 fails closed instead of emitting a completed Tool call with an empty name",async()=>{
  await assert.rejects(()=>withServer(async(_request,response)=>{
    sse(response,[
      {type:"response.created",response:{id:"resp-empty-name"}},
      {type:"response.output_item.added",item:{id:"fc-empty",type:"function_call",call_id:"call-empty",arguments:""}},
      {type:"response.function_call_arguments.done",item_id:"fc-empty",arguments:"{}"},
      {type:"response.completed",response:{id:"resp-empty-name"}},
    ]);
  },async port=>collect(createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${port}/v1`,apiKey:"secret"}).stream({
    ...baseRequest,messages:[{role:"user",content:[{type:"text",text:"delegate"}]}],tools:[tool],
  }))),error=>error?.code==="MODEL_STREAM_INVALID"&&/has no name/.test(error.message));
});

test("STEP014DR3 rejects conflicting item_id and call_id identity bindings",async()=>{
  await assert.rejects(()=>withServer(async(request,response)=>{
    const body=await readBody(request);const alias=body.tools[0].name;
    sse(response,[
      {type:"response.created",response:{id:"resp-conflict"}},
      {type:"response.output_item.added",item:{id:"fc-a",type:"function_call",call_id:"call-a",name:alias,arguments:""}},
      {type:"response.output_item.added",item:{id:"fc-b",type:"function_call",call_id:"call-b",name:alias,arguments:""}},
      {type:"response.output_item.done",item:{id:"fc-b",type:"function_call",call_id:"call-a",name:alias,arguments:"{}"}},
    ]);
  },async port=>collect(createOpenAIResponsesAdapter({endpoint:`http://127.0.0.1:${port}/v1`,apiKey:"secret"}).stream({
    ...baseRequest,messages:[{role:"user",content:[{type:"text",text:"delegate"}]}],tools:[tool],
  }))),error=>error?.code==="MODEL_STREAM_INVALID"&&/different calls/.test(error.message));
});
