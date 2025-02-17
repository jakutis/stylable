# @stylable/core-test-kit

[![npm version](https://img.shields.io/npm/v/@stylable/core-test-kit.svg)](https://www.npmjs.com/package/stylable/core-test-kit)

## `testStylableCore`

Use `import {testStylableCore} from '@stylable/core-test-kit'` to test core analysis, transformation, diagnostics and symbols. All stylable files are checked for [inline expectations](#inline-expectations-syntax):

**single entry**
```js
// source + inline expectations
const { sheets } = testStylableCore(`
    /* @rule .entry__root */
    .root {}
`);
// single entry is mapped to `/entry.st.css`
const { meta, exports } = sheets[`/entry.st.css`];
```

**multiple files**
```js
// source + inline expectations
const { sheets } = testStylableCore({
    '/entry.st.css': `
        @st-import Comp from './comp.st.css';

        /* @rule .entry__root .comp__root */
        .root Comp {}
    `,
    '/comp.st.css': `
        /* @rule .comp__root */
        .root {}
    `
});
// sheets results ({meta, exports})
const entryResults = sheets[`/entry.st.css`];
const compResults = sheets[`/comp.st.css`];
```

**stylable config**
```js
testStylableCore({
    '/a.st.css': ``,
    '/b.st.css': ``,
    '/c.st.css': ``,
}, {
    entries: [`/b.st.css`, `/c.st.css`] // list of entries to transform (in order)
    stylableConfig: {
        projectRoot: string, // defaults to `/`
        resolveNamespace: (ns: string) => string, // defaults to no change
        requireModule: (path: string) => any // defaults to naive CJS eval
        filesystem: IFileSystem, // @file-services/types
        // ...other stylable configurations
    }
});
```

**expose infra**
```js
const { stylable, fs } = testStylableCore(``);

// add a file
fs.writeFileSync(
    `/new.st.css`,
    `
    @st-import [part] from './entry.st.css';
    .part {}
    `
);
// transform new file
const { meta, exports } = stylable.transform(stylable.process(`/new.st.css`));
```

## Inline expectations syntax

The inline expectation syntax can be used with `testInlineExpects` for testing stylesheets transformation and diagnostics.

An expectation is written as a comment just before the code it checks on. All expectations support `label` that will be thrown as part of an expectation fail message.

### `@rule` - check rule transformation including selector and nested declarations:

Selector - `@rule SELECTOR`
```css 
/* @rule .entry__root::before */
.root::before {}
```

Declarations - `@rule SELECTOR { decl: val; }`
```css 
/* @rule .entry__root { color: red } */
.root { color: red; }

/* @rule .entry__root {
    color: red;
    background: green;
}*/
.root {
    color: red;
    background: green;
}
```

Target generated rules (mixin) - ` @rule[OFFSET] SELECTOR`
```css
.mix {
    color: red;
}
.mix:hover {
    color: green;
}
/* 
    @rule .entry__root {color: red;} 
    @rule[1] .entry__root:hover {color: green;} 
*/
.root {
    -st-mixin: mix;
}
```

Label - `@rule(LABEL) SELECTOR`
```css
/* @rule(expect 1) .entry__root */
.root {}

/* @rule(expect 2) .entry__part */
.part {}
```

### `@atrule` - check at-rule transformation of params:

AtRule params - `@atrule PARAMS`:
```css
/* @atrule screen and (min-width: 900px) */
@media value(smallScreen) {}
```

Label - `@atrule(LABEL) PARAMS`
```css
/* @atrule(jump keyframes) entry__jump */
@keyframes jump {}
```

### `@decl` - check declaration transformation

Prop & value - `@decl PROP: VALUE`
```css
.root {
    /* @decl color: red */
    color: red
}
```

Label - `@decl(LABEL) PROP: VALUE`
```css
.root {
    /* @decl(color is red) color: red */
    color: red;
}
```

### `@analyze` & `@transform` - check single file (analyze) and multiple files (transform) diagnostics:

Severity - `@analyze-SEVERITY MESSAGE` / `@transform-SEVERITY MESSAGE`
```css
/* @analyze-info found deprecated usage */
@st-global-custom-property --x;

/* @analyze-warn missing keyframes name */
@keyframes {}

/* @analyze-error invalid functional id */
#id() {}

.root {
    /* @transform-error unresolved "unknown" build variable */
    color: value(unknown);
}
```

Word - `@analyze-SEVERITY word(TEXT) MESSAGE` / `@transform-SEVERITY word(TEXT) MESSAGE`
```css
/* @transform-warn word(unknown) unknown pseudo element */
.root::unknown {}
```

Label - `@analyze(LABEL) MESSAGE` / `@transform(LABEL) MESSAGE`
```css
/* @analyze-warn(local keyframes) missing keyframes name */
@keyframes {}

/* @transform-warn(imported keyframes) unresolved keyframes "unknown" */
@keyframes unknown {}
```

Removed in transformation - `@transform-remove`
```css
/* @transform-remove */
@import X from './x.st.css';
```

## License

Copyright (c) 2019 Wix.com Ltd. All Rights Reserved. Use of this source code is governed by a [MIT license](./LICENSE).
