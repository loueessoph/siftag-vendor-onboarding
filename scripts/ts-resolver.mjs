// Lets `node --experimental-strip-types` run the app's lib code directly:
// lib uses extensionless relative imports ("./shopify"), which Node's ESM
// loader won't resolve on its own, so this hook retries them with ".ts".
//   node --experimental-strip-types --import ./scripts/ts-resolver.mjs --env-file=.env.local scripts/foo.ts
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context); }
        catch (err) {
          if (err?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\\.[a-z]+$/i.test(specifier)) {
            return next(specifier + ".ts", context);
          }
          throw err;
        }
      }
    `),
  pathToFileURL("./")
);
