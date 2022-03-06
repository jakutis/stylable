import type { Plugin } from 'rollup';
import fs from 'fs';
import { join, parse } from 'path';
import {
    Stylable,
    visitMetaCSSDependenciesBFS,
    emitDiagnostics,
    DiagnosticsMode,
} from '@stylable/core';
import {
    sortModulesByDepth,
    calcDepth,
    CalcDepthContext,
    hasImportedSideEffects,
} from '@stylable/build-tools';
import { resolveNamespace as resolveNamespaceNode } from '@stylable/node';
import { StylableOptimizer } from '@stylable/optimizer';
import decache from 'decache';
import {
    emitAssets,
    generateCssString,
    generateStylableModuleCode,
    getDefaultMode,
    registerStcProjectsToWatcher,
    reportStcDiagnostics,
} from './plugin-utils';
import { resolveConfig as resolveStcConfig, STCBuilder } from '@stylable/cli';

export interface StylableRollupPluginOptions {
    optimization?: {
        minify?: boolean;
    };
    inlineAssets?: boolean | ((filepath: string, buffer: Buffer) => boolean);
    fileName?: string;
    mode?: 'development' | 'production';
    diagnosticsMode?: DiagnosticsMode;
    resolveNamespace?: typeof resolveNamespaceNode;
    /**
     * Runs "stc" programmatically with the webpack compilation.
     * true - it will automatically detect the closest "stylable.config.js" file and use it.
     * string - it will use the provided string as the "stcConfig" file path.
     */
    stcConfig?: boolean | string;
}

const requireModuleCache = new Set<string>();
const requireModule = (id: string) => {
    requireModuleCache.add(id);
    return require(id);
};
const clearRequireCache = () => {
    for (const id of requireModuleCache) {
        decache(id);
    }
    requireModuleCache.clear();
};

const ST_CSS = '.st.css';

const PRINT_ORDER = -1;
export function stylableRollupPlugin({
    optimization: { minify = false } = {},
    inlineAssets = true,
    fileName = 'stylable.css',
    diagnosticsMode = 'strict',
    mode = getDefaultMode(),
    resolveNamespace = resolveNamespaceNode,
    stcConfig,
}: StylableRollupPluginOptions = {}): Plugin {
    let stylable!: Stylable;
    let extracted!: Map<any, any>;
    let emittedAssets!: Map<string, string>;
    let outputCSS = '';
    let stcBuilder: STCBuilder | undefined;

    return {
        name: 'Stylable',

        async buildStart(rollupOptions) {
            extracted ||= new Map();
            emittedAssets ||= new Map();
            /**
             * Sometimes rollupOptions.context is the string 'undefined'.
             * So we would fallback to the process.cwd()
             */
            const context =
                rollupOptions.context === 'undefined' ? process.cwd() : rollupOptions.context;

            if (stylable) {
                clearRequireCache();
                stylable.initCache();
            } else {
                stylable = Stylable.create({
                    fileSystem: fs,
                    projectRoot: context,
                    mode,
                    resolveNamespace,
                    optimizer: new StylableOptimizer(),
                    resolverCache: new Map(),
                    requireModule,
                });
            }

            if (stcConfig) {
                if (!stcBuilder) {
                    const configuration = resolveStcConfig(
                        context,
                        typeof stcConfig === 'string' ? stcConfig : undefined
                    );

                    if (!configuration) {
                        throw new Error(
                            `Could not find "stcConfig"${
                                typeof stcConfig === 'string' ? ` at "${stcConfig}"` : ''
                            }`
                        );
                    }

                    stcBuilder = STCBuilder.create({
                        rootDir: context,
                        configFilePath: configuration.path,
                        watchMode: this.meta.watchMode,
                    });

                    await stcBuilder.build();

                    registerStcProjectsToWatcher(this, stcBuilder);

                    reportStcDiagnostics(
                        {
                            emitWarning: (e) => this.warn(e),
                            emitError: (e) => this.error(e),
                        },
                        stcBuilder,
                        diagnosticsMode
                    );
                } else {
                    registerStcProjectsToWatcher(this, stcBuilder);
                }
            }
        },
        async watchChange(id) {
            if (stcBuilder) {
                await stcBuilder.handleWatchedFiles([id]);

                reportStcDiagnostics(
                    {
                        emitWarning: (e) => this.warn(e),
                        emitError: (e) => this.error(e),
                    },
                    stcBuilder,
                    diagnosticsMode
                );
            }
        },
        load(id) {
            if (id.endsWith(ST_CSS)) {
                const code = fs.readFileSync(id, 'utf8');
                return { code, moduleSideEffects: false };
            }
            return null;
        },
        transform(source, id) {
            if (!id.endsWith(ST_CSS)) {
                return null;
            }
            const { meta, exports } = stylable.transform(source, id);
            const assetsIds = emitAssets(this, stylable, meta, emittedAssets, inlineAssets);
            const css = generateCssString(meta, minify, stylable, assetsIds);
            const moduleImports = [];
            for (const imported of meta.getImportStatements()) {
                if (hasImportedSideEffects(stylable, meta, imported)) {
                    moduleImports.push(`import ${JSON.stringify(imported.request)};`);
                }
            }
            extracted.set(id, { css });

            visitMetaCSSDependenciesBFS(
                meta,
                (dep) => {
                    this.addWatchFile(dep.source);
                },
                stylable.createResolver()
            );

            /**
             * Incase this Stylable module has sources the diagnostics will be emitted in `watchChange` hook.
             */
            if (!stcBuilder?.outputFiles?.has(id)) {
                emitDiagnostics(
                    {
                        emitWarning: (e: Error) => this.warn(e),
                        emitError: (e: Error) => this.error(e),
                    },
                    meta,
                    diagnosticsMode
                );
            }

            return {
                code: generateStylableModuleCode(meta, exports, moduleImports),
                map: { mappings: '' },
            };
        },
        buildEnd() {
            const modules = [];
            const cache = new Map();

            const context: CalcDepthContext<string> = {
                getDependencies: (module) => this.getModuleInfo(module)!.importedIds,
                getImporters: (module) => this.getModuleInfo(module)!.importers,
                isStylableModule: (module) => module.endsWith(ST_CSS),
                getModulePathNoExt: (module) => {
                    if (module.endsWith(ST_CSS)) {
                        return module.replace(/\.st\.css$/, '');
                    }
                    const { dir, name } = parse(module);
                    return join(dir, name);
                },
            };

            for (const moduleId of this.getModuleIds()) {
                if (moduleId.endsWith(ST_CSS)) {
                    modules.push({ depth: calcDepth(moduleId, context, [], cache), moduleId });
                }
            }

            sortModulesByDepth(
                modules,
                (m) => m.depth,
                (m) => m.moduleId,
                PRINT_ORDER
            );

            outputCSS = '';

            for (const { moduleId } of modules) {
                const stored = extracted.get(moduleId);
                if (stored) {
                    outputCSS += extracted.get(moduleId).css + '\n';
                } else {
                    this.error(`Missing transformed css for ${moduleId}`);
                }
            }
            this.emitFile({ source: outputCSS, type: 'asset', fileName });
        },
    };
}

export default stylableRollupPlugin;
