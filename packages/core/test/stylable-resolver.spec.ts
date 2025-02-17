import { expect } from 'chai';
import type * as postcss from 'postcss';
import { generateInfra, generateStylableResult } from '@stylable/core-test-kit';
import {
    createMinimalFS,
    process,
    cssParse,
    StylableResolver,
    cachedProcessFile,
    MinimalFS,
    StylableMeta,
    createDefaultResolver,
} from '@stylable/core';

function createResolveExtendsResults(
    fs: MinimalFS,
    fileToProcess: string,
    classNameToLookup: string,
    isElement = false
) {
    const moduleResolver = createDefaultResolver(fs, {});

    const processFile = cachedProcessFile<StylableMeta>((fullpath, content) => {
        return process(cssParse(content, { from: fullpath }));
    }, fs);

    const resolver = new StylableResolver(
        processFile,
        (module: string) => module && '',
        (context = '/', request: string) => moduleResolver(context, request)
    );

    return resolver.resolveExtends(
        processFile.process(fileToProcess),
        classNameToLookup,
        isElement
    );
}

describe('stylable-resolver', () => {
    it('should resolve extend classes', () => {
        const { fs } = createMinimalFS({
            files: {
                '/button.st.css': {
                    content: `
                        @namespace:'Button';
                        .root {
                            color:red;
                        }
                    `,
                },
                '/extended-button.st.css': {
                    content: `
                        :import {
                            -st-from: './button.st.css';
                            -st-default: Button;
                        }
                        .myClass {
                            -st-extends:Button;
                            width: 100px;
                        }
                    `,
                },
            },
        });

        const results = createResolveExtendsResults(fs, '/extended-button.st.css', 'myClass');
        expect(results[0].symbol.name).to.equal('myClass');
        expect(results[1].symbol.name).to.equal('root');
        expect(results[1].meta.source).to.equal('/button.st.css');
    });

    it('should resolve extend elements', () => {
        const { fs } = createMinimalFS({
            files: {
                '/button.st.css': {
                    content: `
                        @namespace:'Button';
                        .root {
                            color:red;
                        }
                    `,
                },
                '/extended-button.st.css': {
                    content: `
                        :import {
                            -st-from: './button.st.css';
                            -st-default: Button;
                        }
                        Button {
                            width: 100px;
                        }
                    `,
                },
            },
        });

        const results = createResolveExtendsResults(fs, '/extended-button.st.css', 'Button', true);
        expect(results[0].symbol.name).to.equal('Button');
        expect(results[1].symbol.name).to.equal('root');
        expect(results[1].meta.source).to.equal('/button.st.css');
    });

    it('should not enter infinite loops even with broken code', () => {
        const { fs } = createMinimalFS({
            files: {
                '/button.st.css': {
                    content: `
                        @namespace: 'Button';
                        :import {
                            -st-from: './extended-button.st.css';
                            -st-default: Button;
                        }
                        .root {
                            -st-extends: Button
                        }
                    `,
                },
                '/extended-button.st.css': {
                    content: `
                        :import {
                            -st-from: './button.st.css';
                            -st-default: Button;
                        }
                        .root {
                            -st-extends: Button;
                        }
                        Button {
                            width: 100px;
                        }
                    `,
                },
            },
        });

        const results = createResolveExtendsResults(fs, '/extended-button.st.css', 'Button', true);
        expect(results[0].symbol.name).to.equal('Button');
        expect(results[1].symbol.name).to.equal('root');
        expect(results[1].meta.source).to.equal('/button.st.css');
    });

    it.skip('should resolve extend classes on broken css', () => {
        const { fs } = createMinimalFS({
            files: {
                '/button.st.css': {
                    content: `
                        .gaga
                    `,
                },
            },
        });
        const results = createResolveExtendsResults(fs, '/button.st.css', 'gaga');
        expect(results).to.eql([]);
    });

    it('should resolve extend through exported alias', () => {
        const { fs } = createMinimalFS({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./index.st.css";
                            -st-named: Comp;
                        }
                        .root {
                            -st-extends: Comp;
                        }
                    `,
                },
                '/index.st.css': {
                    content: `
                        :import{
                            -st-from: "./button.st.css";
                            -st-default: Comp;
                        }
                        Comp{}
                    `,
                },
                '/button.st.css': {
                    content: `
                        .root{}
                    `,
                },
            },
        });
        const results = createResolveExtendsResults(fs, '/entry.st.css', 'root');

        expect(results[0].symbol.name).to.equal('root');
        expect(results[1].symbol.name).to.equal('Comp');
        expect(results[2].symbol.name).to.equal('root');

        expect(results[0].meta.source).to.equal('/entry.st.css');
        expect(results[1].meta.source).to.equal('/index.st.css');
        expect(results[2].meta.source).to.equal('/button.st.css');
    });

    it('should resolve class as local and not an alias when an -st-extend is present', () => {
        const { fs } = createMinimalFS({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: 'inner.st.css';
                            -st-named: alias;
                        }
                        .root {}

                        .alias {
                            -st-extends: root;
                        }
                        
                        .target { 
                            -st-extends: alias;
                        }
                    `,
                },
                '/inner.st.css': {
                    content: `
                        .alias {}
                    `,
                },
            },
        });

        const results = createResolveExtendsResults(fs, '/entry.st.css', 'target');

        expect(results[0].symbol.name).to.equal('target');
        expect(results[1].symbol.name).to.equal('alias');
        expect(results[2].symbol.name).to.equal('root');

        expect(results[0].meta.source).to.equal('/entry.st.css');
        expect(results[1].meta.source).to.equal('/entry.st.css');
        expect(results[2].meta.source).to.equal('/entry.st.css');
    });

    it('should resolve classes', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./button.st.css";
                            -st-default: Button;
                        }
                        .x {-st-extends: Button}
                    `,
                },
                '/button.st.css': {
                    content: `
                        .root{}
                    `,
                },
            },
        });

        const entryMeta = fileProcessor.process('/entry.st.css');
        const btnMeta = fileProcessor.process('/button.st.css');
        const res = resolver.resolve(entryMeta.getSymbol(`x`));

        expect(res?.symbol).to.eql(btnMeta.getClass(`root`));
    });

    it('should resolve elements', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./button.st.css";
                            -st-default: Button;
                            -st-named: ButtonX;
                        }
                        Button {}
                        ButtonX {}
                    `,
                },
                '/button.st.css': {
                    content: `
                        .root{}
                        .label{}
                        ButtonX{}
                    `,
                },
            },
        });

        const btnMeta = fileProcessor.process('/button.st.css');
        const entryMeta = fileProcessor.process('/entry.st.css');
        const btn = entryMeta.getSymbol(`Button`);
        const res = resolver.resolve(btn);

        const btn1 = entryMeta.getSymbol(`ButtonX`);
        const res1 = resolver.resolve(btn1);

        expect(res?.symbol).to.eql(btnMeta.getClass(`root`));
        expect(res1?.symbol).to.eql(btnMeta.getTypeElement(`ButtonX`));
    });

    it('should resolve elements deep', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./button.st.css";
                            -st-named: ButtonX;
                        }
                        ButtonX {}
                    `,
                },
                '/button.st.css': {
                    content: `
                        :import {
                            -st-from: "./button-x.st.css";
                            -st-default: ButtonX;
                        }
                        ButtonX{}
                    `,
                },
                '/button-x.st.css': {
                    content: `
                        .x-label{}
                    `,
                },
            },
        });

        const entryMeta = fileProcessor.process('/entry.st.css');
        const btnXMeta = fileProcessor.process('/button-x.st.css');

        const btn1 = entryMeta.getSymbol(`ButtonX`);
        const res1 = resolver.deepResolve(btn1);

        expect(res1?.symbol).to.eql(btnXMeta.getClass(`root`));
    });

    it('should handle circular "re-declare" (deepResolve)', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./entry.st.css";
                            -st-named: a;
                        }
                        .a {}
                    `,
                },
            },
        });

        const entryMeta = fileProcessor.process('/entry.st.css');

        const a = entryMeta.getSymbol(`a`);
        const res1 = resolver.deepResolve(a);

        expect(res1?.symbol).to.eql(entryMeta.getClass(`a`));
    });

    it('should handle circular "re-declare" (resolveSymbolOrigin)', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./entry.st.css";
                            -st-named: a;
                        }
                        .a {}
                    `,
                },
            },
        });

        const entryMeta = fileProcessor.process('/entry.st.css');

        const a = entryMeta.getSymbol(`a`);
        const res1 = resolver.resolveSymbolOrigin(a, entryMeta);

        expect(res1?.symbol).to.eql(entryMeta.getClass(`a`));
    });

    it('should resolve alias origin', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./a.st.css";
                            -st-named: a, b;
                        }
                        .a{}
                        .b{}
                    `,
                },
                '/a.st.css': {
                    content: `
                        :import {
                            -st-from: "./a1.st.css";
                            -st-named: a, b;
                        }
                        .a{}
                        .b{}
                    `,
                },
                '/a1.st.css': {
                    content: `
                        :import {
                            -st-from: "./comp.st.css";
                            -st-named: Comp;
                        }
                        .a{}
                        .b{-st-extends: Comp}
                    `,
                },
                '/comp.st.css': {
                    content: ``,
                },
            },
        });

        const entryMeta = fileProcessor.process('/entry.st.css');
        const a1 = fileProcessor.process('/a1.st.css');

        const res1 = resolver.resolveSymbolOrigin(entryMeta.getSymbol(`a`), entryMeta);
        const res2 = resolver.resolveSymbolOrigin(entryMeta.getSymbol(`b`), entryMeta);

        expect(res1?.symbol).to.eql(a1.getClass(`a`));
        expect(res2?.symbol).to.eql(a1.getClass(`b`));
    });

    it('should not resolve extends on alias', () => {
        const { resolver, fileProcessor } = generateInfra({
            files: {
                '/entry.st.css': {
                    content: `
                        :import {
                            -st-from: "./a.st.css";
                            -st-named: a;
                        }
                        .a {
                           -st-extends: a;
                        }
                    `,
                },
                '/a.st.css': {
                    content: `
                        .a{}
                    `,
                },
            },
        });

        const entryMeta = fileProcessor.process('/entry.st.css');
        const res1 = resolver.resolveSymbolOrigin(entryMeta.getSymbol(`a`), entryMeta);
        expect(res1?.symbol).to.eql(entryMeta.getClass(`a`));
    });

    it('should resolve 4th party according to context', () => {
        const { meta } = generateStylableResult({
            entry: '/node_modules/a/index.st.css',
            files: {
                '/node_modules/a/index.st.css': {
                    namespace: 'A',
                    content: `
                        :import {
                            -st-from: "b/index.st.css";
                            -st-default: B;
                        }
                        .root {
                            -st-extends: B;
                        }
                    `,
                },
                '/node_modules/a/node_modules/b/index.st.css': {
                    namespace: 'B',
                    content: ``,
                },
            },
        });

        const rule = meta.outputAst!.nodes[0] as postcss.Rule;
        expect(rule.selector).to.equal('.A__root');
        expect(meta.diagnostics.reports).to.eql([]);
        expect(meta.transformDiagnostics!.reports).to.eql([]);
    });
});
