import type { DiagnosticsMode, Stylable, StylableExports } from '@stylable/core';
import type { Chunk, Compilation, Compiler, LoaderContext } from 'webpack';

export interface StylableBuildMeta {
    css: string;
    exports: StylableExports;
    urls: string[];
    depth: number;
    namespace: string;
    isUsed: undefined | boolean;
    globals: Record<string, boolean>;
    unusedImports: string[];
}

export type BuildData = Pick<
    StylableBuildMeta,
    'css' | 'namespace' | 'depth' | 'exports' | 'isUsed' | 'urls'
>;

export type LoaderData = Pick<
    StylableBuildMeta,
    'css' | 'urls' | 'exports' | 'namespace' | 'globals' | 'unusedImports'
>;

export interface StylableLoaderContext extends LoaderContext<{}> {
    resourcePath: string;
    stylable: Stylable;
    assetsMode: 'loader' | 'url';
    diagnosticsMode: DiagnosticsMode;
    target: 'oldie' | 'modern';
    assetFilter: (url: string, context: string) => boolean;
    flagStylableModule: (loaderData: LoaderData) => void;
}

/* webpack missing types */

type MapType<T> = T extends Map<any, infer U> ? U : never;

export type WebpackCreateHash = Compiler['webpack']['util']['createHash'];
export type ResolveOptionsWebpackOptions = Compiler['options']['resolve'];
export type RuntimeTemplate = Compilation['runtimeTemplate'];
export type WebpackOutputOptions = RuntimeTemplate['outputOptions'];
export type CompilationParams = Parameters<Compiler['newCompilation']>[0];
export type NormalModuleFactory = CompilationParams['normalModuleFactory'];
export type StringSortableSet = Chunk['idNameHints'];
export type DependencyTemplates = Compilation['dependencyTemplates'];
export type EntryPoint = MapType<Compilation['entrypoints']>;
