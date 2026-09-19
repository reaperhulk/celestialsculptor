// Readable sources ship as whitespace-minified modules. Identifiers keep their
// names so browser stack traces and bug reports still point at real symbols.
import { transform } from 'esbuild';
export async function minifySource(path, source) {
  const loader = path.endsWith('.css') ? 'css' : 'js';
  const { code } = await transform(source, {
    loader,
    format: loader === 'js' ? 'esm' : undefined,
    target: 'es2022',
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    legalComments: 'none',
    charset: 'utf8',
  });
  return code;
}
export const minified = (name) => /\.(js|css)$/.test(name);
