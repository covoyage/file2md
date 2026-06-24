export const MISSING_DEPENDENCY_MESSAGE = `{converter} recognized the input as a potential {extension} file, but the dependencies needed to read {extension} files have not been installed. Install the optional dependency for {feature}, e.g. npm install {feature}.`;

export class File2MDException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "File2MDException";
  }
}

export class MissingDependencyException extends File2MDException {
  constructor(message?: string) {
    super(message);
    this.name = "MissingDependencyException";
  }
}

export class UnsupportedFormatException extends File2MDException {
  constructor(message?: string) {
    super(message);
    this.name = "UnsupportedFormatException";
  }
}

export class FailedConversionAttempt {
  readonly converter: { constructor: { name: string } };
  readonly error: unknown;

  constructor(converter: { constructor: { name: string } }, error: unknown) {
    this.converter = converter;
    this.error = error;
  }
}

export class FileConversionException extends File2MDException {
  readonly attempts: FailedConversionAttempt[] | undefined;

  constructor(
    message?: string,
    attempts?: FailedConversionAttempt[],
  ) {
    if (message === undefined && attempts !== undefined) {
      message = `File conversion failed after ${attempts.length} attempts:\n`;
      for (const attempt of attempts) {
        const name = attempt.converter.constructor.name;
        const err = attempt.error;
        if (err instanceof Error) {
          message += ` - ${name} threw ${err.constructor.name}: ${err.message}\n`;
        } else {
          message += ` - ${name} threw an unknown error\n`;
        }
      }
    }
    super(message ?? "File conversion failed.");
    this.name = "FileConversionException";
    this.attempts = attempts;
  }
}
