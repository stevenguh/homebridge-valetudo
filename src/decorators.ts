import { LogLevel, Logger } from "homebridge";

interface ClassWithLogger {
  logger?: Logger;
}

interface LogOptions {
  level: LogLevel;
  skipArgs?: boolean;
  skipResult?: boolean;
}

export function logMethod<This extends ClassWithLogger, Args extends any[]>(
  options: LogOptions = { level: LogLevel.DEBUG }
) {
  return function decorator(
    target: (this: This, ...args: Args) => any,
    context: ClassMethodDecoratorContext<
      This,
      (this: This, ...args: Args) => any
    >
  ) {
    function replacementMethod(this: This, ...args: Args): any {
      const methodName = `${this.constructor.name}.${String(context.name)}`;

      const argString = options.skipArgs
        ? "skipped"
        : args.map((a) => JSON.stringify(a)).join(", ");
      this.logger?.log(options.level, `${methodName}(${argString})`);

      try {
        const result = target.call(this, ...args);

        if (result instanceof Promise) {
          result
            .then((value) => {
              const resultString = options.skipResult
                ? "skipped"
                : JSON.stringify(value);
              this.logger?.log(
                options.level,
                `${methodName} async => ${resultString}`
              );
              return value;
            })
            .catch((error) => {
              this.logger?.error(`${methodName} async => ${error}`);
              throw error;
            });
        } else {
          const resultString = options.skipResult
            ? "skipped"
            : JSON.stringify(result);
          this.logger?.log(options.level, `${methodName} => ${resultString}`);
        }

        return result;
      } catch (error) {
        this.logger?.error(`${methodName} => ${error}`);
        throw error;
      }
    }

    return replacementMethod;
  };
}

interface PromiseCache<T> {
  promise: Promise<T>;
  done: boolean;
  timestamp: number;
}

export function cachePromise<This extends ClassWithLogger, Result>(
  ttl: number
) {
  let cache: PromiseCache<Result> | undefined = undefined;

  return function decorator(
    target: (this: This) => Promise<Result>,
    context: ClassMethodDecoratorContext<This, (this: This) => Promise<Result>>
  ) {
    function replacementMethod(this: This): Promise<Result> {
      const methodName = `${this.constructor.name}.${String(context.name)}`;

      if (cache) {
        if (!cache.done || cache.timestamp + ttl < Date.now()) {
          this.logger?.debug(`${methodName} cache hit`);
          return cache.promise;
        }
      }
      this.logger?.debug(`${methodName} cache miss`);

      const timestamp = Date.now();
      const promise = target.call(this).then((result) => {
        cache = {
          promise,
          done: true,
          timestamp,
        };
        return result;
      });
      cache = {
        promise,
        done: false,
        timestamp,
      };

      return promise;
    }

    return replacementMethod;
  };
}
