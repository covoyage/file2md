import { ContentUnderstandingFileType } from "./converters/content-understanding-converter.js";

export interface CliArgs {
  input?: string;
  output?: string;
  extension?: string;
  mimeType?: string;
  charset?: string;
  usePlugins: boolean;
  listPlugins: boolean;
  keepDataUris: boolean;
  useDocintel: boolean;
  useCu: boolean;
  docintelEndpoint?: string;
  docintelCredential?: string;
  cuEndpoint?: string;
  cuCredential?: string;
  cuAnalyzerId?: string;
  cuFileTypes?: string;
  version: boolean;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    usePlugins: false,
    listPlugins: false,
    keepDataUris: false,
    useDocintel: false,
    useCu: false,
    version: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "-v" || arg === "--version") {
      args.version = true;
    } else if (arg === "-p" || arg === "--use-plugins") {
      args.usePlugins = true;
    } else if (arg === "--list-plugins") {
      args.listPlugins = true;
    } else if (arg === "-o" || arg === "--output") {
      args.output = argv[++i];
    } else if (arg === "-x" || arg === "--extension") {
      args.extension = argv[++i];
    } else if (arg === "-m" || arg === "--mime-type") {
      args.mimeType = argv[++i];
    } else if (arg === "-c" || arg === "--charset") {
      args.charset = argv[++i];
    } else if (arg === "-d" || arg === "--use-docintel") {
      args.useDocintel = true;
      args.docintelEndpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    } else if (arg === "--endpoint" || arg === "-e") {
      args.docintelEndpoint = argv[++i];
      args.useDocintel = true;
    } else if (arg === "--use-cu" || arg === "--use-content-understanding") {
      args.useCu = true;
      args.cuEndpoint = process.env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT;
    } else if (arg === "--cu-endpoint") {
      args.cuEndpoint = argv[++i];
    } else if (arg === "--cu-analyzer-id" || arg === "--cu-analyzer") {
      args.cuAnalyzerId = argv[++i];
    } else if (arg === "--cu-file-types") {
      args.cuFileTypes = argv[++i];
    } else if (arg === "--keep-data-uris") {
      args.keepDataUris = true;
    } else if (!arg.startsWith("-") && !args.input) {
      args.input = arg;
    }
  }

  if (!args.docintelCredential) {
    args.docintelCredential = process.env.AZURE_API_KEY;
  }
  if (!args.cuCredential) {
    args.cuCredential = process.env.AZURE_API_KEY;
  }

  return args;
}

export function normalizeCliHints(args: CliArgs): void {
  if (args.extension !== undefined) {
    let extension = args.extension.trim().toLowerCase();
    if (extension.length === 0) {
      args.extension = undefined;
    } else {
      if (!extension.startsWith(".")) {
        extension = `.${extension}`;
      }
      args.extension = extension;
    }
  }

  if (args.mimeType !== undefined) {
    const mimeType = args.mimeType.trim();
    if (mimeType.length === 0) {
      args.mimeType = undefined;
    } else if (mimeType.split("/").length !== 2) {
      throw new Error(`Invalid MIME type: ${mimeType}`);
    } else {
      args.mimeType = mimeType;
    }
  }

  if (args.charset !== undefined) {
    const charset = args.charset.trim();
    if (charset.length === 0) {
      args.charset = undefined;
    } else {
      try {
        new TextDecoder(charset);
        args.charset = charset;
      } catch {
        throw new Error(`Invalid charset: ${charset}`);
      }
    }
  }
}

export function validateCliArgs(
  args: CliArgs,
  options: { fromStdin: boolean },
): void {
  if (args.docintelEndpoint && args.cuEndpoint) {
    throw new Error(
      "Document Intelligence and Content Understanding cannot be used together.",
    );
  }

  if (args.useDocintel && !args.docintelEndpoint) {
    throw new Error(
      "Document Intelligence endpoint is required when using Document Intelligence.",
    );
  }

  if (args.useCu && !args.cuEndpoint) {
    throw new Error(
      "Content Understanding endpoint (--cu-endpoint) is required when using --use-cu.",
    );
  }

  const usesCloud = Boolean(args.docintelEndpoint || args.cuEndpoint);
  if (usesCloud && (options.fromStdin || !args.input)) {
    throw new Error(
      "A filename is required when using Document Intelligence or Content Understanding.",
    );
  }
}

export function parseCuFileTypes(value: string): ContentUnderstandingFileType[] {
  const types: ContentUnderstandingFileType[] = [];
  for (const name of value.split(",")) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) continue;
    const match = Object.values(ContentUnderstandingFileType).find(
      (item) => item === trimmed,
    );
    if (match) {
      types.push(match);
    } else {
      throw new Error(`Unknown Content Understanding file type: ${trimmed}`);
    }
  }
  return types;
}
