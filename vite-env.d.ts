/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_AWS_REGION?: string;
  readonly VITE_AWS_ACCESS_KEY_ID?: string;
  readonly VITE_AWS_SECRET_ACCESS_KEY?: string;
  readonly VITE_AWS_BEARER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// AWS SDK types for dynamic import (Bedrock provider)
// These are minimal type declarations to satisfy TypeScript when the SDK is not installed
declare module '@aws-sdk/client-bedrock-runtime' {
  export class BedrockRuntimeClient {
    constructor(config: {
      region?: string;
      credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
      };
    });
    send(command: InvokeModelCommand): Promise<{ body?: Uint8Array }>;
  }
  
  export class InvokeModelCommand {
    constructor(input: {
      modelId: string;
      contentType: string;
      accept: string;
      body: string;
    });
  }
}
