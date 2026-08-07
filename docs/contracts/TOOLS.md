# Tool Contract

```ts
type ToolDefinition = {
  id: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  risk: "read" | "write" | "execute" | "network" | "privileged";
  concurrency: "parallel" | "serial-per-run" | "serial-global";
  timeoutMs: number;
  supportsCancellation: boolean;
  execute(ctx: ToolExecutionContext, input: unknown): Promise<ToolOutcome>;
};
```

## 공통 pipeline

1. Tool schema validation
2. availability check
3. policy evaluation
4. approval binding 생성 또는 실행
5. started event commit
6. execution
7. output normalization/redaction
8. terminal event commit
9. model-visible result 생성

파일과 Shell Tool이 직접 HTTP/WS나 UI 상태를 변경하지 않는다.
