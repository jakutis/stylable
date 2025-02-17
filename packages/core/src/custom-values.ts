import cloneDeepWith from 'lodash.clonedeepwith';
import postcssValueParser from 'postcss-value-parser';
import { getFormatterArgs, getNamedArgs, getStringValue } from './helpers/value';
import type { ParsedValue } from './types';

export interface Box<Type extends string, Value> {
    type: Type;
    value: Value;
}

export function box<Type extends string, Value>(type: Type, value: Value): Box<Type, Value> {
    return {
        type,
        value,
    };
}

const { hasOwnProperty } = Object.prototype;

export function unbox<B extends Box<string, unknown>>(boxed: B | string): any {
    if (typeof boxed === 'string') {
        return boxed;
    } else if (typeof boxed === 'object' && boxed.type && hasOwnProperty.call(boxed, 'value')) {
        return cloneDeepWith(boxed.value, unbox);
    }
}

export interface BoxedValueMap {
    [k: string]: string | Box<string, unknown>;
}

export type BoxedValueArray = Array<string | Box<string, unknown>>;

type CustomTypes = Record<string, CustomValueExtension<any>>;

export interface CustomValueExtension<T> {
    flattenValue?: FlattenValue<T>;
    evalVarAst(
        valueAst: ParsedValue,
        customTypes: {
            [typeID: string]: CustomValueExtension<unknown>;
        }
    ): Box<string, T>;
    getValue(
        path: string[],
        value: Box<string, T>,
        node: ParsedValue,
        customTypes: CustomTypes
    ): string;
}

function createStArrayCustomFunction() {
    return createCustomValue<BoxedValueArray, BoxedValueArray>({
        processArgs: (node, customTypes) => {
            return CustomValueStrategy.args(node, customTypes);
        },
        createValue: (args) => {
            return args;
        },
        getValue: (value, index) => value[parseInt(index, 10)],
    });
}

function createStMapCustomFunction() {
    return createCustomValue<BoxedValueMap, BoxedValueMap>({
        processArgs: (node, customTypes) => {
            return CustomValueStrategy.named(node, customTypes);
        },
        createValue: (args) => {
            return args;
        },
        getValue: (value, index) => value[index],
    });
}

export const stTypes: CustomTypes = {
    /** @deprecated - use `st-array` */
    stArray: createStArrayCustomFunction().register('stArray'),
    /** @deprecated - use `st-map` */
    stMap: createStMapCustomFunction().register('stMap'),
    'st-array': createStArrayCustomFunction().register('st-array'),
    'st-map': createStMapCustomFunction().register('st-map'),
} as const;

export const deprecatedStFunctions: Record<string, { alternativeName: string }> = {
    stArray: {
        alternativeName: 'st-array',
    },
    stMap: {
        alternativeName: 'st-map',
    },
};

export const CustomValueStrategy = {
    args: (fnNode: ParsedValue, customTypes: CustomTypes) => {
        const pathArgs = getFormatterArgs(fnNode);
        const outputArray = [];
        for (const arg of pathArgs) {
            const parsedArg = postcssValueParser(arg).nodes[0];
            const ct = parsedArg.type === 'function' && parsedArg.value;
            const resolvedValue =
                typeof ct === 'string' && customTypes[ct]
                    ? customTypes[ct].evalVarAst(parsedArg, customTypes)
                    : arg;
            outputArray.push(resolvedValue);
        }
        return outputArray;
    },
    named: (fnNode: ParsedValue, customTypes: CustomTypes) => {
        const outputMap: BoxedValueMap = {};
        const s = getNamedArgs(fnNode);
        for (const [prop, space, ...valueNodes] of s) {
            if (space.type !== 'space') {
                // TODO: error catch
                throw new Error('Invalid argument');
            }
            let resolvedValue;
            if (valueNodes.length === 0) {
                // TODO: error
            } else if (valueNodes.length === 1) {
                const valueNode = valueNodes[0];
                resolvedValue = valueNode.resolvedValue;

                if (!resolvedValue) {
                    const ct = customTypes[valueNode.value];
                    if (valueNode.type === 'function' && ct) {
                        resolvedValue = ct.evalVarAst(valueNode, customTypes);
                    } else {
                        resolvedValue = getStringValue(valueNode);
                    }
                }
            } else {
                resolvedValue = getStringValue(valueNodes);
            }

            if (resolvedValue) {
                outputMap[prop.value] = resolvedValue;
            }
        }
        return outputMap;
    },
};

export interface JSValueExtension<Value> {
    _kind: 'CustomValue';
    register(localTypeSymbol: string): CustomValueExtension<Value>;
}

type FlattenValue<Value> = (v: Box<string, Value>) => {
    parts: Array<string | Box<string, unknown>>;
    delimiter: ',' | ' ';
};

interface ExtensionApi<Value, Args> {
    processArgs: (fnNode: ParsedValue, customTypes: CustomTypes) => Args;
    createValue: (args: Args) => Value;
    getValue: (v: Value, key: string) => string | Box<string, unknown>;
    flattenValue?: FlattenValue<Value>;
}

export function createCustomValue<Value, Args>({
    processArgs,
    createValue,
    flattenValue,
    getValue,
}: ExtensionApi<Value, Args>): JSValueExtension<Value> {
    return {
        _kind: 'CustomValue',
        register(localTypeSymbol: string) {
            return {
                flattenValue,
                evalVarAst(fnNode: ParsedValue, customTypes: CustomTypes) {
                    const args = processArgs(fnNode, customTypes);
                    return box(localTypeSymbol, createValue(args));
                },
                getValue(
                    path: string[],
                    obj: Box<string, Value>,
                    fallbackNode: ParsedValue, // TODO: add test
                    customTypes: CustomTypes
                ): string {
                    if (path.length === 0) {
                        if (flattenValue) {
                            const { delimiter, parts } = flattenValue(obj);
                            return parts
                                .map((v) => getBoxValue([], v, fallbackNode, customTypes))
                                .join(delimiter);
                        } else {
                            // TODO: add diagnostics
                            return getStringValue([fallbackNode]);
                        }
                    }
                    const value = getValue(obj.value, path[0]);
                    return getBoxValue(path.slice(1), value, fallbackNode, customTypes);
                },
            };
        },
    };
}

export function getBoxValue(
    path: string[],
    value: string | Box<string, unknown>,
    node: ParsedValue,
    customTypes: CustomTypes
): string {
    if (typeof value === 'string') {
        return value;
    } else if (value && customTypes[value.type]) {
        return customTypes[value.type].getValue(path, value, node, customTypes);
    } else {
        throw new Error('Unknown Type ' + JSON.stringify(value));
        // return JSON.stringify(value);
    }
}

export function isCustomValue(symbol: any): symbol is JSValueExtension<unknown> {
    return symbol?._kind === 'CustomValue';
}
