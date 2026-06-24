#!/usr/bin/env node
import { stdin } from "node:process";
import { File2MD } from "./file2md.js";
import {
  normalizeCliHints,
  parseCliArgs,
  parseCuFileTypes,
  validateCliArgs,
} from "./cli-args.js";
import { getRegisteredPlugins } from "./plugins.js";

const VERSION = "0.1.0";

async function listInstalledPlugins(): Promise<void> {
  if (
    typeof process !== "undefined" &&
    typeof process.versions?.node === "string"
  ) {
    const { discoverPluginEntries } = await import("./plugin-discovery-node.js");
    const discovered = discoverPluginEntries(process.cwd());

    console.log("Installed file2md plugins:\n");
    if (discovered.length === 0) {
      console.log("  * No 3rd-party plugins installed.");
      console.log(
        "\nPublish a plugin by adding a file2md.plugin entry to package.json.\n",
      );
      return;
    }

    for (const entry of discovered) {
      console.log(
        `  * ${entry.name.padEnd(16)}\t(package: ${entry.packageName})`,
      );
    }
    console.log(
      "\nUse -p / --use-plugins to enable discovered and manually registered plugins.\n",
    );
    return;
  }

  const plugins = getRegisteredPlugins();
  if (plugins.length === 0) {
    console.log("No plugins registered.");
  } else {
    console.log(plugins.map((plugin) => plugin.constructor.name).join("\n"));
  }
}

function printHelp(): void {
  console.log(`file2md - Convert various file formats to Markdown

Usage:
  file2md [options] [file]
  cat file.pdf | file2md

Options:
  -o, --output <path>         Write output to file instead of stdout
  -x, --extension <ext>       Hint file extension (for stdin input)
  -m, --mime-type <type>      Hint MIME type
  -c, --charset <charset>     Hint charset
  -p, --use-plugins           Enable registered plugins
  --list-plugins              List registered plugins
  -d, --use-docintel          Use Azure Document Intelligence
  -e, --endpoint <url>        Document Intelligence endpoint
  --use-cu                    Use Azure Content Understanding
  --cu-endpoint <url>         Content Understanding endpoint
  --cu-analyzer-id <id>       Content Understanding analyzer id
  --cu-analyzer <id>          Alias for --cu-analyzer-id
  --cu-file-types <types>     Comma-separated CU file types (pdf,docx,...)
  --keep-data-uris            Preserve full data: URI images in output
  -v, --version               Show version
  -h, --help                  Show help
`);
}

async function readStdinBuffer(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(`file2md ${VERSION}`);
    return;
  }

  if (args.listPlugins) {
    await listInstalledPlugins();
    return;
  }

  normalizeCliHints(args);

  const fromStdin = !args.input && !stdin.isTTY;
  validateCliArgs(args, { fromStdin });

  const md = new File2MD({
    enablePlugins: args.usePlugins,
    docintelEndpoint: args.docintelEndpoint,
    docintelCredential: args.docintelCredential,
    cuEndpoint: args.cuEndpoint,
    cuCredential: args.cuCredential,
    cuAnalyzerId: args.cuAnalyzerId,
    cuFileTypes: args.cuFileTypes
      ? parseCuFileTypes(args.cuFileTypes)
      : undefined,
  });

  const convertOptions = {
    keepDataUris: args.keepDataUris,
  };

  let result;
  if (args.input) {
    result = await md.convertLocal(args.input, convertOptions);
  } else if (fromStdin) {
    const data = await readStdinBuffer();
    result = await md.convertStream(data, {
      ...convertOptions,
      streamInfo: {
        extension: args.extension ?? null,
        mimetype: args.mimeType ?? null,
        charset: args.charset ?? null,
      },
    });
  } else {
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (args.output) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(args.output, result.markdown, "utf-8");
  } else {
    process.stdout.write(result.markdown);
    if (!result.markdown.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
