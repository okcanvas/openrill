import type { OpenRillConfig, OsSecretProvider } from "@openrill/config";
import { resolveSecretReference } from "@openrill/config";
import {
  ModelAdapterError,
  type ModelAdapterResolution,
  type ModelAdapterResolver,
} from "@openrill/model-adapter";
import { createOpenAIResponsesAdapter } from "@openrill/model-openai-responses";

export interface ConfiguredModelResolverOptions {
  readonly config: OpenRillConfig;
  readonly configRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly osSecretProvider?: OsSecretProvider;
}

export class ConfiguredModelResolver implements ModelAdapterResolver {
  public constructor(private readonly options: ConfiguredModelResolverOptions) {}

  public async resolve(profile: string): Promise<ModelAdapterResolution> {
    const declaration = this.options.config.modelProviders[profile];
    if (!declaration) {
      throw new ModelAdapterError("MODEL_PROFILE_NOT_FOUND", `model profile is not configured: ${profile}`, false);
    }
    if (declaration.type !== "openai-responses") {
      throw new ModelAdapterError("MODEL_PROVIDER_UNSUPPORTED", `unsupported model provider type: ${declaration.type}`, false);
    }
    if (!declaration.endpoint || !declaration.apiKey || !declaration.model) {
      throw new ModelAdapterError("MODEL_PROFILE_INVALID", `openai-responses profile is incomplete: ${profile}`, false);
    }
    const apiKey = await resolveSecretReference(declaration.apiKey, {
      configRoot: this.options.configRoot,
      ...(this.options.env ? { env: this.options.env } : {}),
      ...(this.options.platform ? { platform: this.options.platform } : {}),
      ...(this.options.osSecretProvider ? { osSecretProvider: this.options.osSecretProvider } : {}),
    });
    return {
      profile,
      provider: profile,
      model: declaration.model,
      maxOutputTokens: declaration.maxOutputTokens ?? 4096,
      maxRetries: declaration.maxRetries ?? 2,
      adapter: createOpenAIResponsesAdapter({
        endpoint: declaration.endpoint,
        apiKey,
      }),
    };
  }
}
