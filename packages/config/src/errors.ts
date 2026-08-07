export type ConfigErrorCode =
  | "CONFIG_PARSE_FAILED"
  | "CONFIG_VALIDATION_FAILED"
  | "CONFIG_INCLUDE_INVALID"
  | "CONFIG_INCLUDE_ESCAPE"
  | "CONFIG_INCLUDE_CYCLE"
  | "CONFIG_INCLUDE_LIMIT"
  | "CONFIG_FUTURE_VERSION"
  | "CONFIG_REVISION_CONFLICT"
  | "CONFIG_MUTATION_BUSY"
  | "CONFIG_SECRET_UNRESOLVED"
  | "CONFIG_SECRET_STORE_FAILED"
  | "CONFIG_SOURCE_EXISTS"
  | "CONFIG_IO_FAILED";

export class OpenRillConfigError extends Error {
  public constructor(
    public readonly code: ConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenRillConfigError";
  }
}

export interface ConfigIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly line?: number;
}

export class ConfigParseError extends OpenRillConfigError {
  public constructor(
    message: string,
    public readonly issues: readonly ConfigIssue[],
    options?: ErrorOptions,
  ) {
    super("CONFIG_PARSE_FAILED", message, options);
    this.name = "ConfigParseError";
  }
}

export class ConfigValidationError extends OpenRillConfigError {
  public constructor(
    message: string,
    public readonly issues: readonly ConfigIssue[],
    options?: ErrorOptions,
  ) {
    super("CONFIG_VALIDATION_FAILED", message, options);
    this.name = "ConfigValidationError";
  }
}

export class ConfigIncludeError extends OpenRillConfigError {
  public constructor(
    code: Extract<ConfigErrorCode, "CONFIG_INCLUDE_INVALID" | "CONFIG_INCLUDE_ESCAPE" | "CONFIG_INCLUDE_CYCLE" | "CONFIG_INCLUDE_LIMIT">,
    message: string,
    public readonly includePath?: string,
    options?: ErrorOptions,
  ) {
    super(code, message, options);
    this.name = "ConfigIncludeError";
  }
}

export class ConfigFutureVersionError extends OpenRillConfigError {
  public constructor(
    public readonly foundVersion: number,
    public readonly supportedVersion: number,
  ) {
    super(
      "CONFIG_FUTURE_VERSION",
      `OpenRill config version ${foundVersion} is newer than supported version ${supportedVersion}`,
    );
    this.name = "ConfigFutureVersionError";
  }
}

export class ConfigRevisionConflictError extends OpenRillConfigError {
  public constructor(
    public readonly expectedRevision: string | null,
    public readonly actualRevision: string | null,
  ) {
    super(
      "CONFIG_REVISION_CONFLICT",
      `OpenRill config revision conflict: expected ${expectedRevision ?? "<missing>"}, actual ${actualRevision ?? "<missing>"}`,
    );
    this.name = "ConfigRevisionConflictError";
  }
}
