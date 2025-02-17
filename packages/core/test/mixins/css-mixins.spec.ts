import { expect } from 'chai';
import type * as postcss from 'postcss';
import {
    generateStylableEnvironment,
    generateStylableResult,
    generateStylableRoot,
    matchAllRulesAndDeclarations,
    matchRuleAndDeclaration,
    testInlineExpects,
    testStylableCore,
    shouldReportNoDiagnostics,
} from '@stylable/core-test-kit';
import { processorWarnings } from '@stylable/core';

describe('CSS Mixins', () => {
    it('apply simple class mixins declarations', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                .my-mixin {
                    color: red;
                }
                /* @check .entry__container {color: red;} */
                .container {
                    -st-mixin: my-mixin;
                }
            `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('last mixin wins with warning', () => {
        const result = generateStylableResult({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                .my-mixin1 {
                    color: red;
                }
                .my-mixin2 {
                    color: green;
                }
                /* @check .entry__container {color: green;} */
                .container {
                    -st-mixin: my-mixin1;
                    -st-mixin: my-mixin2;
                }
            `,
                },
            },
        });

        const report = result.meta.diagnostics.reports[0];
        expect(report.message).to.equal(processorWarnings.OVERRIDE_MIXIN('-st-mixin'));
        testInlineExpects(result.meta.outputAst!);
    });

    it('Mixin with function arguments with multiple params (comma separated)', () => {
        const result = generateStylableRoot({
            entry: `/style.st.css`,
            files: {
                '/style.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./formatter";
                            -st-default: formatter;
                        }
                        
                        /* @check .entry__container {color: color-1, color-2} */
                        .container {
                            -st-mixin: Text(ZZZ formatter(color-1, color-2));
                        }
                        
                        .Text {
                            color: value(ZZZ);
                        }
                    `,
                },
                '/formatter.js': {
                    content: `
                        module.exports = function() {
                            return \`\${[...arguments].join(', ')}\`;
                        }
                    `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('transform state form imported element', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./design.st.css";
                            -st-named: Base;
                        }
                        /* @check[1] .entry__y.base--disabled { color: red; } */
                        .y {
                           -st-mixin: Base;
                        }
                    `,
                },
                '/design.st.css': {
                    namespace: 'design',
                    content: `
                        :import {
                            -st-from: "./base.st.css";
                            -st-default: Base;
                        }
                        Base{}
                    `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `
                        .root {
                            -st-states: disabled;
                        }
                        .root:disabled {
                            color: red;
                        }
                    `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('transform state form extended root when used as mixin', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./design.st.css";
                            -st-default: Design;
                        }
                        /* @check[1] .entry__y.base--disabled {color: red;} */
                        .y {
                           -st-mixin: Design;
                        }
                    `,
                },
                '/design.st.css': {
                    namespace: 'design',
                    content: `
                        :import {
                            -st-from: "./base.st.css";
                            -st-default: Base;
                        }
                        .root {
                           -st-extends: Base;
                        }
                        .root:disabled { color: red; }
                    `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `
                        .root {
                            -st-states: disabled;
                        }
                    `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('should reorder selector to context', () => {
        const { sheets } = testStylableCore({
            '/mixin.st.css': `
                .root {
                    -st-states: x;
                }
                .mixin {-st-states: mix-state;}
                .root:x.mixin:mix-state {
                    z-index: 1;
                }
                .root:x.mixin:mix-state[attr].y {
                    z-index: 1;
                }
                .mixin:is(.y.mixin:mix-state) {
                    z-index: 1;
                }
                .x.mixin[a] .y.mixin[b] {
                    z-index: 1;
                } 
                :is(.x.mixin:is(.y.mixin)) {
                    z-index: 1;
                }

            `,
            'entry.st.css': `
                @st-import [mixin] from "./mixin.st.css";

                /* 
                    @rule[1] .entry__y.mixin--mix-state.mixin__root.mixin--x  
                    @rule[2] .entry__y.mixin--mix-state[attr].mixin__y.mixin__root.mixin--x    
                    @rule[3] .entry__y:is(.entry__y.mixin--mix-state.mixin__y)
                    @rule[4] .entry__y[a].mixin__x .entry__y[b].mixin__y
                */
                .y {
                    -st-mixin: mixin;
                }
            `,
        });
        //@TODO-rule[5] :is(.entry__y:is(.entry__y.mixin__y).mixin__x)
        shouldReportNoDiagnostics(sheets[`/entry.st.css`].meta);
    });

    it.skip('mixin with multiple rules in keyframes', () => {
        // const result = generateStylableRoot({
        //     entry: `/entry.st.css`,
        //     files: {
        //         '/entry.st.css': {
        //             namespace: 'entry',
        //             content: `
        //                 .x {
        //                     color: red;
        //                 }
        //                 .x:hover {
        //                     color: green;
        //                 }

        //                 @keyframes my-name {

        //                     0% {
        //                         -st-mixin: x;
        //                     }
        //                     100% {

        //                     }

        //                 }
        //             `
        //         }
        //     }
        // });

        throw new Error('Test me');
    });

    it('apply simple class mixin that uses mixin itself', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                .x {
                    color: red;
                }
                .y {
                    -st-mixin: x;
                }
                /* @check .entry__container {color: red;} */
                .container {
                    -st-mixin: y;
                }
            `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('apply simple class mixin with circular refs to the same selector', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                /* @check .entry__x {color: red; color: red;} */
                .x {
                    color: red;
                    -st-mixin: y;
                }
                /* @check .entry__y {color: red;} */
                .y {
                    -st-mixin: x;
                }
            `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('apply simple class mixin with circular refs from multiple files', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./style1.st.css";
                            -st-named: y;
                        }
                        /* @check .entry__x {color: red; color: red;} */
                        .x {
                            color: red;
                            -st-mixin: y;
                        }
                    `,
                },
                '/style1.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./entry.st.css";
                            -st-named: x;
                        }
                        .y {
                            -st-mixin: x;
                        }
                    `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('append complex selector that starts with the mixin name', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `

                .my-mixin:hover {
                    color: blue;
                }
                .my-mixin .my-other-class {
                    color: green;
                }
                /* 
                    @check[1] .entry__container:hover {color: blue;} 
                    @check[2] .entry__container .entry__my-other-class {color: green;}
                */
                .container {
                    -st-mixin: my-mixin;
                }
            `,
                },
            },
        });

        testInlineExpects(result);
    });

    it('should scope @keyframes from local mixin without duplicating the animation', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                .my-mixin {
                    animation: original 2s;
                }
                @keyframes original {
                    0% { color: red; }
                    100% { color: green; }
                }
                .container {
                    -st-mixin: my-mixin;
                }
                `,
                },
            },
        });

        matchRuleAndDeclaration(result, 2, '.entry__container', 'animation: entry__original 2s');
    });

    it('should scope @keyframes from imported mixin without duplicating the animation', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: my-mixin;
                }
                .container {
                    -st-mixin: my-mixin;
                }
                `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                .my-mixin {
                    animation: original 2s;
                }
                @keyframes original {
                    0% { color: red; }
                    100% { color: green; }
                }
                `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', 'animation: imported__original 2s');
    });

    it('should scope @keyframes from root mixin (duplicate the entire @keyframe with origin context)', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-default: Imported;
                }
                .container {
                    -st-mixin: Imported;
                }
                `,
                },

                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                .my-mixin {
                    animation: original 2s;
                }
                @keyframes original {
                    0% { color: red; }
                    100% { color: green; }
                }
                `,
                },
            },
        });

        matchRuleAndDeclaration(
            result,
            1,
            '.entry__container .imported__my-mixin',
            'animation: imported__original 2s'
        );
        result.walkAtRules(/@keyframes/, (rule) => {
            expect(rule.params).to.equal('imported__original');
        });
    });

    it('apply class mixins from import', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: my-mixin;
                }
                .container {
                    -st-mixin: my-mixin;
                }
            `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                .my-mixin {
                    color: red;
                }
            `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', 'color: red');
    });

    it('apply mixin from named import (scope classes from mixin origin)', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: my-mixin;
                }
                .container {
                    -st-mixin: my-mixin;
                }
            `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                .my-mixin {
                    color: red;
                }
                .my-mixin .local {
                    color: green;
                }
            `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', 'color: red');

        matchRuleAndDeclaration(result, 1, '.entry__container .imported__local', 'color: green');
    });

    it('separate mixin roots', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./mixin.st.css";
                    -st-named: a;
                }
                .b { -st-mixin: a; }
            `,
                },
                '/mixin.st.css': {
                    namespace: 'mixin',
                    content: `

                .a { color: green; background: red; }

                .a:hover { color: yellow; }

                .a { color: black; }

            `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__b', 'color: green;background: red');
        matchRuleAndDeclaration(result, 1, '.entry__b:hover', 'color: yellow');
        matchRuleAndDeclaration(result, 2, '.entry__b', 'color: black');
    });

    it('re-exported mixin maintains original definitions', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./enriched.st.css";
                    -st-named: a;
                }
                .b { -st-mixin: a; }
            `,
                },
                '/enriched.st.css': {
                    namespace: 'enriched',
                    content: `
                :import {
                    -st-from: "./base.st.css";
                    -st-named: a;
                }
                .a { color: green; }
            `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `
                .a { color: red; }
            `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__b', 'color: red');
        matchRuleAndDeclaration(result, 1, '.entry__b', 'color: green');
    });

    it('re-exported mixin maintains original definitions (with multiple selectors)', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./enriched.st.css";
                    -st-named: a;
                }
                .b { -st-mixin: a; }
            `,
                },
                '/enriched.st.css': {
                    namespace: 'enriched',
                    content: `
                :import {
                    -st-from: "./base.st.css";
                    -st-named: a;
                }
                .a { color: green; }
                .a:hover {
                    color: yellow;
                }
                .a { color: purple; }
            `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `
                .a { color: red; }
                .a:hover {
                    color: gold;
                }
            `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__b', 'color: red');
        matchRuleAndDeclaration(result, 1, '.entry__b:hover', 'color: gold');
        matchRuleAndDeclaration(result, 2, '.entry__b', 'color: green');
        matchRuleAndDeclaration(result, 3, '.entry__b:hover', 'color: yellow');
        matchRuleAndDeclaration(result, 4, '.entry__b', 'color: purple');
    });

    it(`apply mixin from named "as" import to a target class sharing the mixin source name`, () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./base.st.css";
                    -st-named: a as b;
                }
                .a { -st-mixin: b; }
            `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `
                .a { color: red; }
            `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__a', 'color: red');
    });

    it('apply mixin from local class with extends (scope class as root)', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./base.st.css";
                            -st-default: Base;
                        }

                        .container {
                            -st-mixin: my-mixin;
                        }

                        .my-mixin {
                            -st-extends: Base;
                            color: red;
                        }
                        .my-mixin::part{
                            color: green;
                        }
                    `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `.part{}`,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', '-st-extends: Base;color: red');

        matchRuleAndDeclaration(result, 1, '.entry__container .base__part', 'color: green');
    });

    it('apply mixin from named import with extends (scope classes from mixin origin)', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./imported.st.css";
                            -st-named: my-mixin;
                        }
                        .container {
                            -st-mixin: my-mixin;
                        }
                    `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                        :import {
                            -st-from: "./base.st.css";
                            -st-default: Base;
                        }
                        .my-mixin {
                            -st-extends: Base;
                            color: red;
                        }
                        .my-mixin::part{
                            color: green;
                        }
                  `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `.part{}`,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', '-st-extends: Base;color: red');

        matchRuleAndDeclaration(result, 1, '.entry__container .base__part', 'color: green');
    });

    it('should apply root mixin on child class (Root mixin mode)', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `

                        .container {
                            -st-mixin: root;
                        }

                        .class {

                        }
                    `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', '');

        matchRuleAndDeclaration(result, 1, '.entry__container .entry__container', '');

        matchRuleAndDeclaration(result, 2, '.entry__container .entry__class', '');

        matchRuleAndDeclaration(result, 3, '.entry__class', '');
    });

    it('apply mixin from named import with extends (scope classes from mixin origin) !! with alias jump', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./jump.st.css";
                            -st-named: my-mixin;
                        }
                        .container {
                            -st-mixin: my-mixin;
                        }
                    `,
                },
                '/jump.st.css': {
                    namespace: 'imported',
                    content: `
                        :import {
                            -st-from: "./imported.st.css";
                            -st-named: my-mixin;
                        }
                        .my-mixin {}
                        .my-mixin::part {}
                  `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                        :import {
                            -st-from: "./base.st.css";
                            -st-default: Base;
                        }
                        .my-mixin {
                            -st-extends: Base;
                            color: red;
                        }
                        .my-mixin::part{
                            color: green;
                        }
                  `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `.part{}`,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__container', '-st-extends: Base;color: red');

        matchRuleAndDeclaration(result, 1, '.entry__container .base__part', 'color: green');
    });

    it('apply mixin with two root replacements', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: i;
                }
                .x {
                    -st-mixin: i;
                }
            `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                        .i .i.y  {
                            color: yellow;
                        }
                    `,
                },
            },
        });

        matchRuleAndDeclaration(result, 1, '.entry__x .entry__x.imported__y', 'color: yellow');
    });

    it('apply complex mixin on complex selector', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                    .i {
                        color: red;
                    }

                    .i:hover, .local:hover, .i.local:hover .inner {
                        color: green;
                    }

                    .x:hover .y {
                        -st-mixin: i;
                    }
                `,
                },
            },
        });

        matchAllRulesAndDeclarations(
            result,
            [
                ['.entry__x:hover .entry__y', 'color: red'],
                [
                    '.entry__x:hover .entry__y:hover, .entry__x:hover .entry__y.entry__local:hover .entry__inner',
                    'color: green',
                ],
            ],
            '',
            2
        );
    });

    it('apply mixin with media query', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: i;
                }
                .x {
                    -st-mixin: i;
                }
            `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                        .y {background: #000}
                        .i {color: red;}
                        @media (max-width: 300px) {
                            .y {background: #000}
                            .i {color: yellow;}
                            .i:hover {color: red;}
                        }
                        .i:hover {color: blue;}
                    `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__x', 'color: red');

        const media = result.nodes[1] as postcss.AtRule;
        expect(media.params, 'media params').to.equal('(max-width: 300px)');

        matchAllRulesAndDeclarations(
            media,
            [
                ['.entry__x', 'color: yellow'],
                ['.entry__x:hover', 'color: red'],
            ],
            '@media'
        );

        matchRuleAndDeclaration(result, 2, '.entry__x:hover', 'color: blue');
    });

    it('apply mixin with @supports', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: i;
                }
                .x {
                    -st-mixin: i;
                }
            `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                        .y {background: #000}
                        .i {color: red;}
                        @supports not (appearance: auto) {
                            .y {background: #000}
                            .i {color: yellow;}
                            .i:hover {color: red;}
                        }
                        .i:hover {color: blue;}
                    `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__x', 'color: red');

        const supports = result.nodes[1] as postcss.AtRule;
        expect(supports.params, 'supports params').to.equal('not (appearance: auto)');

        matchAllRulesAndDeclarations(
            supports,
            [
                ['.entry__x', 'color: yellow'],
                ['.entry__x:hover', 'color: red'],
            ],
            '@supports'
        );

        matchRuleAndDeclaration(result, 2, '.entry__x:hover', 'color: blue');
    });

    it('apply mixin from root style sheet', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-default: X;
                }

                .x {
                    -st-mixin: X;
                }
            `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                    .root {color:red;}
                    .y {color:green;}
                    @media (max-width: 100px) {
                       .root{color:yellow;}
                       .y{color:gold;}
                    }
                    @supports not (appearance: auto) {
                        .i {color:purple;}
                    }
                `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__x', 'color:red');
        matchRuleAndDeclaration(result, 1, '.entry__x .imported__y', 'color:green');
        const media = result.nodes[2] as postcss.AtRule;
        matchRuleAndDeclaration(media, 0, '.entry__x', 'color:yellow', '@media');
        matchRuleAndDeclaration(media, 1, '.entry__x .imported__y', 'color:gold', '@media');
        const supports = result.nodes[3] as postcss.AtRule;
        matchRuleAndDeclaration(supports, 0, '.entry__x .imported__i', 'color:purple', '@supports');
    });

    it('apply named mixin with extends and conflicting pseudo-element class at mixin deceleration level', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                :import {
                    -st-from: "./imported.st.css";
                    -st-named: mixme;
                }
                .x {
                    -st-mixin: mixme;
                }
                `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                    :import {
                        -st-from: "./comp.st.css";
                        -st-default: Comp;
                    }
                    .part {}
                    .mixme {
                        -st-extends: Comp;
                        color: red;
                    }
                    .mixme::part .part {
                        color: green;
                    }
                `,
                },
                '/comp.st.css': {
                    namespace: 'comp',
                    content: `
                    .part{}
                `,
                },
            },
        });
        matchRuleAndDeclaration(result, 1, '.entry__x .comp__part .imported__part', 'color: green');
    });

    it('apply mixin when rootScoping enabled', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./look1.st.css";
                            -st-default: Look1;
                        }
                        .root {
                            -st-mixin: Look1(c1 yellow);
                        }
                    `,
                },
                '/look1.st.css': {
                    namespace: 'look1',
                    content: `
                        :import {
                            -st-from: "./base.st.css";
                            -st-default: Base;
                        }
                        :vars {
                            c1: red;
                        }
                        .root {
                            -st-extends:Base;
                            color:value(c1);
                        }
                        .panel {
                            color:gold;
                        }
                        .root::label {
                            color:green;
                        }
                    `,
                },
                '/base.st.css': {
                    namespace: 'base',
                    content: `
                        .root {}
                        .label {}
                    `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__root', '-st-extends:Base;color:yellow');
        matchRuleAndDeclaration(result, 1, '.entry__root .look1__panel', 'color:gold');
        matchRuleAndDeclaration(result, 2, '.entry__root .base__label', 'color:green');
    });

    it('apply mixin from imported element', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                        :import {
                            -st-from: "./imported.st.css";
                            -st-named: X;
                        }

                        .x {
                            -st-mixin: X;
                        }
                    `,
                },
                '/imported.st.css': {
                    namespace: 'imported',
                    content: `
                        X {color:green;}
                    `,
                },
            },
        });

        matchRuleAndDeclaration(result, 0, '.entry__x', 'color:green');
    });

    it('apply nested mixins', () => {
        const result = generateStylableRoot({
            entry: `/entry.st.css`,
            files: {
                '/entry.st.css': {
                    namespace: 'entry',
                    content: `
                    :import {
                        -st-from: "./r.st.css";
                        -st-default: R;
                    }
                    .x {
                        -st-mixin: R;
                    }
                `,
                },
                '/r.st.css': {
                    namespace: 'r',
                    content: `
                    :import {
                        -st-from: "./y.st.css";
                        -st-default: Y;
                    }
                    .r{
                        -st-mixin: Y;
                    }
                `,
                },
                '/y.st.css': {
                    namespace: 'y',
                    content: `
                    .y {

                    }
                `,
                },
            },
        });

        matchAllRulesAndDeclarations(
            result,
            [
                ['.entry__x', ''],
                ['.entry__x .r__r', ''],
                ['.entry__x .r__r .y__y', ''],
            ],
            ''
        );
    });

    it('should maintain mapped symbols when performing a local mixin (regression)', () => {
        const { stylable } = generateStylableEnvironment({
            '/entry.st.css': `
                    @st-import Comp from "./inner.st.css";

                    Comp::inner {}
                `,
            '/inner.st.css': `
                    .inner {}

                    .mixin {
                        position: absolute;
                        width: 100%;
                        height: 100%;
                        top: 0px;
                        left: 0px;
                        z-index: 1;
                    }

                    .mixTarget {
                        -st-mixin: mixin;
                    }

                `,
        });

        const { meta } = stylable.transform(stylable.process('/inner.st.css'));
        const { meta: entryMeta } = stylable.transform(stylable.process('/entry.st.css'));

        expect(meta.getAllSymbols()).to.have.keys('root', 'inner', 'mixin', 'mixTarget');
        expect(entryMeta.transformDiagnostics!.reports.length).to.equal(0);
    });

    describe('url() handling', () => {
        it('should rewrite relative urls', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                    :import {
                        -st-from: "./a/mix.st.css";
                        -st-named: mix;
                    }
                    .x {
                        -st-mixin: mix;
                    }
                `,
                    },
                    '/a/mix.st.css': {
                        namespace: 'mix',
                        content: `
                    :import {
                        -st-from: "./b/other-mix.st.css";
                        -st-named: other-mix;
                    }
                    .mix {
                        background: url(./asset.png);
                        -st-mixin: other-mix;
                    }
                `,
                    },
                    '/a/b/other-mix.st.css': {
                        namespace: 'other-mix',
                        content: `
                    .other-mix {
                        background: url(./asset.png)
                    }
                `,
                    },
                },
            });

            matchAllRulesAndDeclarations(
                result,
                [['.entry__x', 'background: url(./a/asset.png);background: url(./a/b/asset.png)']],
                ''
            );
        });
        it('should rewrite relative urls (case2)', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                    :import {
                        -st-from: "./a/mix.st.css";
                        -st-named: mix;
                    }
                    .x {
                        -st-mixin: mix;
                    }
                `,
                    },
                    '/a/mix.st.css': {
                        namespace: 'mix',
                        content: `
                    .mix {
                        background: url(../asset.png);
                    }
                `,
                    },
                },
            });

            matchAllRulesAndDeclarations(
                result,
                [['.entry__x', 'background: url(./asset.png)']],
                ''
            );
        });

        it('should rewrite relative urls used through a 3rd-party css mixin', () => {
            const result = generateStylableResult({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                    :import {
                        -st-from: "fake-package/index.st.css";
                        -st-named: mix;
                    }
                    .x {
                        -st-mixin: mix;
                    }
                `,
                    },
                    '/node_modules/fake-package/index.st.css': {
                        namespace: 'mix',
                        content: `
                    .mix {
                        background: url(./asset.png);
                    }
                `,
                    },
                    '/node_modules/fake-package/package.json': {
                        content: '{"name": "fake-package", "version": "0.0.1"}',
                    },
                },
            });

            matchAllRulesAndDeclarations(
                result.meta.outputAst!,
                [['.entry__x', 'background: url(./node_modules/fake-package/asset.png)']],
                ''
            );
        });

        it('should rewrite relative urls used through a 3rd-party js mixin', () => {
            const result = generateStylableResult({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                    :import {
                        -st-from: "fake-package/mixin.js";
                        -st-named: mix;
                    }
                    .x {
                        -st-mixin: mix();
                    }
                `,
                    },
                    '/node_modules/fake-package/mixin.js': {
                        content: `
                        module.exports.mix = function() {
                            return {
                                "background": 'url(./asset.png)'
                            };
                        }
                `,
                    },
                    '/node_modules/fake-package/package.json': {
                        content: '{"name": "fake-package", "version": "0.0.1"}',
                    },
                },
            });

            matchAllRulesAndDeclarations(
                result.meta.outputAst!,
                [['.entry__x', 'background: url(./node_modules/fake-package/asset.png)']],
                ''
            );
        });
    });

    describe('Mixins with named parameters', () => {
        it('apply mixin with :vars override (local scope)', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                            :vars {
                                color1: red;
                            }

                            .x {
                                -st-mixin: y(color1 green);
                            }

                            .y {color:value(color1);}

                        `,
                    },
                },
            });

            matchRuleAndDeclaration(result, 0, '.entry__x', 'color:green');
        });

        it('apply mixin with :vars override with space in value', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                            :vars {
                                border1: red;
                            }

                            .x {
                                -st-mixin: y(border1 1px solid red);
                            }

                            .y {border:value(border1);}

                        `,
                    },
                },
            });

            matchRuleAndDeclaration(result, 0, '.entry__x', 'border:1px solid red');
        });

        it('apply mixin with :vars override', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                            :import {
                                -st-from: "./imported.st.css";
                                -st-named: y;
                            }

                            .x {
                                -st-mixin: y(color1 green);
                            }
                        `,
                    },
                    '/imported.st.css': {
                        namespace: 'imported',
                        content: `
                        :vars {
                            color1: red;
                        }
                        .y {color:value(color1);}
                    `,
                    },
                },
            });

            matchRuleAndDeclaration(result, 0, '.entry__x', 'color:green');
        });

        it('apply mixin with :vars multiple override', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                            .x {
                                -st-mixin: y(color1 green, color2 yellow);
                            }

                            .y {
                                color:value(color1);
                                background:value(color2);
                            }
                        `,
                    },
                },
            });

            matchRuleAndDeclaration(result, 0, '.entry__x', 'color:green;background:yellow');
        });

        it('apply mixin with :vars multiple levels', () => {
            const result = generateStylableRoot({
                entry: `/entry.st.css`,
                files: {
                    '/entry.st.css': {
                        namespace: 'entry',
                        content: `
                    :import {
                        -st-from: "./imported.st.css";
                        -st-named: y;
                    }

                    .x {
                        -st-mixin: y(color1 green, color2 yellow);
                    }
                `,
                    },
                    '/imported.st.css': {
                        namespace: 'imported',
                        content: `
                        :import {
                            -st-from: "./mixin.st.css";
                            -st-named: z;
                        }
                        :vars {
                            color1: red;
                            color2: blue;
                        }
                        .y {
                            -st-mixin: z(color3 value(color1), color4 value(color2));
                        }
                    `,
                    },
                    '/mixin.st.css': {
                        namespace: 'mixin',
                        content: `
                        :vars {
                            color3: red;
                            color4: blue;
                        }
                        .z {
                            border: 1px solid value(color3);
                            background: value(color4);
                        }
                    `,
                    },
                },
            });

            matchRuleAndDeclaration(
                result,
                0,
                '.entry__x',
                'border: 1px solid green;background: yellow'
            );
        });
    });
});
