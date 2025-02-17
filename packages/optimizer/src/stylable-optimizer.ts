import {
    IStylableOptimizer,
    OptimizeConfig,
    StylableExports,
    StylableResults,
    pseudoStates,
} from '@stylable/core';
import { parseCssSelector, stringifySelectorAst, Selector, walk } from '@tokey/css-selector-parser';
import csso from 'csso';
import postcss, { Declaration, Root, Rule, Node, Comment, Container } from 'postcss';
import { NameMapper } from './name-mapper';

const { booleanStateDelimiter } = pseudoStates;
const stateRegexp = new RegExp(`^(.*?)${booleanStateDelimiter}`);

export class StylableOptimizer implements IStylableOptimizer {
    public names = new NameMapper();
    public classPrefix = 's';
    public namespacePrefix = 'o';
    public minifyCSS(css: string): string {
        // disabling restructuring as it breaks production mode by disappearing classes
        return csso.minify(css, { restructure: false }).css;
    }

    public optimize(
        config: OptimizeConfig,
        stylableResults: StylableResults,
        usageMapping: Record<string, boolean>,
        delimiter?: string
    ) {
        const {
            meta: { globals, outputAst: _outputAst },
            exports: jsExports,
        } = stylableResults;
        const outputAst = _outputAst!;

        this.optimizeAst(config, outputAst, usageMapping, delimiter, jsExports, globals);
    }

    public getNamespace(namespace: string) {
        return this.names.get(namespace, this.namespacePrefix);
    }

    public getClassName(className: string) {
        return this.names.get(className, this.classPrefix);
    }

    public optimizeAst(
        config: OptimizeConfig,
        outputAst: Root,
        usageMapping: Record<string, boolean>,
        delimiter: string | undefined,
        jsExports: StylableExports,
        globals: Record<string, boolean>
    ) {
        if (config.removeComments) {
            this.removeComments(outputAst);
        }
        if (config.removeStylableDirectives) {
            this.removeStylableDirectives(outputAst);
        }
        if (config.removeUnusedComponents && usageMapping && delimiter) {
            this.removeUnusedComponents(delimiter, outputAst, usageMapping);
        }
        if (config.removeEmptyNodes) {
            this.removeEmptyNodes(outputAst);
        }
        this.optimizeAstAndExports(
            outputAst,
            jsExports.classes,
            undefined,
            usageMapping,
            globals,
            delimiter,
            config.shortNamespaces,
            config.classNameOptimizations
        );
    }

    public optimizeAstAndExports(
        ast: Root,
        exported: Record<string, string>,
        classes = Object.keys(exported),
        usageMapping: Record<string, boolean>,
        globals: Record<string, boolean> = {},
        delimiter?: string,
        shortNamespaces?: boolean,
        classNamespaceOptimizations?: boolean
    ) {
        if (!shortNamespaces && !classNamespaceOptimizations) {
            return;
        }
        if (!delimiter) {
            throw new Error(
                'Missing delimiter when shortNamespaces or classNamespaceOptimizations is enabled'
            );
        }

        ast.walkRules((rule) => {
            rule.selector = this.rewriteSelector(
                rule.selector,
                usageMapping,
                globals,
                shortNamespaces || false,
                classNamespaceOptimizations || false,
                delimiter
            );
        });
        const namespaceRegexp = new RegExp(`^(.*?)${delimiter}`);

        classes.forEach((originName) => {
            if (exported[originName]) {
                exported[originName] = exported[originName]
                    .split(' ')
                    .map((renderedNamed) => {
                        if (classNamespaceOptimizations) {
                            return this.getClassName(renderedNamed);
                        } else if (shortNamespaces) {
                            const namespaceMatch = renderedNamed.match(namespaceRegexp);
                            if (!namespaceMatch) {
                                throw new Error(
                                    `Stylable class dose not have proper export namespace ${renderedNamed}`
                                );
                            }
                            return renderedNamed.replace(
                                namespaceRegexp,
                                `${this.getNamespace(namespaceMatch[1])}${delimiter}`
                            );
                        } else {
                            throw new Error('Invalid optimization config');
                        }
                    })
                    .join(' ');
            }
        });
    }

    public removeStylableDirectives(root: Root, shouldComment = false) {
        const toRemove: Node[] = [];
        root.walkDecls((decl: Declaration) => {
            if (decl.prop.startsWith('-st-')) {
                toRemove.push(decl);
            }
        });
        toRemove.forEach(
            shouldComment
                ? (node) => {
                      node.replaceWith(...createLineByLineComment(node));
                  }
                : (node) => {
                      node.remove();
                  }
        );
    }

    protected rewriteSelector(
        selector: string,
        usageMapping: Record<string, boolean>,
        globals: Record<string, boolean> = {},
        shortNamespaces: boolean,
        classNamespaceOptimizations: boolean,
        delimiter: string
    ) {
        const ast = parseCssSelector(selector);

        const namespaceRegexp = new RegExp(`^(.*?)${delimiter}`);
        walk(ast, (node) => {
            if (node.type === 'class' && !globals[node.value]) {
                const possibleStateNamespace = node.value.match(stateRegexp);
                let isState;
                if (possibleStateNamespace) {
                    if (possibleStateNamespace[1] in usageMapping) {
                        isState = true;
                        if (shortNamespaces) {
                            node.value = node.value.replace(
                                stateRegexp,
                                `${this.getNamespace(
                                    possibleStateNamespace[1]
                                )}${booleanStateDelimiter}`
                            );
                        }
                    }
                }

                if (!isState) {
                    if (classNamespaceOptimizations) {
                        node.value = this.getClassName(node.value);
                    } else if (shortNamespaces) {
                        const namespaceMatch = node.value.match(namespaceRegexp);
                        if (!namespaceMatch) {
                            throw new Error(
                                `Stylable class dose not have proper namespace ${node.value}`
                            );
                        }
                        node.value = node.value.replace(
                            namespaceRegexp,
                            `${this.getNamespace(namespaceMatch[1])}${delimiter}`
                        );
                    }
                }
            }
        });
        return stringifySelectorAst(ast);
    }

    private removeEmptyNodes(root: Root) {
        removeEmptyNodes(root);
    }

    private removeComments(root: Root) {
        removeCommentNodes(root);
    }

    private removeUnusedComponents(
        delimiter: string,
        outputAst: Root,
        usageMapping: Record<string, boolean>,
        shouldComment = false
    ) {
        const matchNamespace = new RegExp(`(.+)${delimiter}(.+)`);
        outputAst.walkRules((rule) => {
            const outputSelectors = rule.selectors.filter((selector) => {
                const selectorAst = parseCssSelector(selector);
                return !this.isContainsUnusedParts(selectorAst[0], usageMapping, matchNamespace);
            });
            if (outputSelectors.length) {
                rule.selector = outputSelectors.join();
            } else {
                if (shouldComment) {
                    replaceRecursiveUpIfEmpty('NOT_IN_USE', rule);
                } else {
                    rule.remove();
                }
            }
        });
    }

    private isContainsUnusedParts(
        selectorAst: Selector,
        usageMapping: Record<string, boolean>,
        matchNamespace: RegExp
    ) {
        // TODO: !!-!-!! last working point
        let isContainsUnusedParts = false;
        walk(selectorAst, (node) => {
            if (isContainsUnusedParts) {
                return walk.stopAll;
            }
            if (node.type === 'class') {
                const parts = matchNamespace.exec(node.value);
                if (parts) {
                    if (usageMapping[parts[1]] === false) {
                        isContainsUnusedParts = true;
                    }
                }
            }
            return;
        });
        return isContainsUnusedParts;
    }
}

export function removeCommentNodes(root: Root) {
    root.walkComments((comment) => {
        comment.remove();
    });
    root.walkDecls((decl) => {
        const r: any = decl.raws;
        if (r.value) {
            r.value.raw = decl.value;
        }
    });
}

export function removeEmptyNodes(root: Root) {
    const toRemove: Node[] = [];

    root.walkRules((rule: Rule) => {
        const shouldRemove =
            (rule.nodes && rule.nodes.length === 0) ||
            (rule.nodes && rule.nodes.filter((node) => node.type !== 'comment').length === 0);
        if (shouldRemove) {
            toRemove.push(rule);
        }
    });

    toRemove.forEach((node) => {
        removeRecursiveUpIfEmpty(node);
    });
}

export function createCommentFromNode(label: string, node: Node) {
    return [
        postcss.comment({
            text: label + ':',
        }),
        ...createLineByLineComment(node),
    ];
}

export function createLineByLineComment(node: Node) {
    return node
        .toString()
        .split(/\r?\n/)
        .map((x) => {
            if (x.trim() === '') {
                return undefined;
            }
            let c;
            if (x.trim().startsWith('/*') && x.trim().endsWith('*/')) {
                c = postcss.comment({ text: x.replace(/\*\//gm, '').replace(/\/\*/gm, '') });
                // c = comment({ text: x.replace(/\*\//gm, '').replace(/\/\*/gm, '') });
            } else {
                c = postcss.comment({ text: x.replace(/\*\//gm, '*//*') });
            }
            return c;
        })
        .filter(Boolean) as Comment[];
}

export function removeRecursiveUpIfEmpty(node: Node) {
    const parent = node.parent;
    node.remove();
    if (parent && parent.nodes && parent.nodes.length === 0) {
        removeRecursiveUpIfEmpty(parent);
    }
}

export function replaceRecursiveUpIfEmpty(label: string, node: Node) {
    const parent = node.parent;
    node.raws = {};
    node.replaceWith(
        ...(node.type === 'decl'
            ? createLineByLineComment(node)
            : createCommentFromNode(label, node))
    );
    if (
        parent &&
        parent.type !== 'document' &&
        parent.nodes &&
        (parent as Container).nodes.filter((node) => node.type !== 'comment').length === 0
    ) {
        replaceRecursiveUpIfEmpty('EMPTY_NODE', parent);
    }
}
