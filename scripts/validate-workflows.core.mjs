/**
 * The parts of `validate:workflows` that read meaning out of workflow text — pure, so
 * every branch runs on every PR through the `scripts` vitest project.
 *
 * A job condition is asserted by what it GUARANTEES, never by the words it contains.
 * `a && b` cannot be true unless `a` is, so a top-level conjunct is a guarantee; the same
 * `a` inside `(a || x)`, after `!( … )`, or in an expression with a top-level `||` holds
 * nothing. A substring check cannot tell those apart, and on PR #221 it waved through a
 * `publish` condition with its `!cancelled()` stripped.
 */

/**
 * The expression inside a YAML `if:` value: `${{ … }}` unwrapped, or the bare form with
 * a trailing YAML comment removed. Returns null for a shape it does not read (a block
 * scalar, an unterminated `${{`), so the caller fails rather than guessing.
 */
export const expressionOf = (value) => {
    const raw = value.trim();
    const wrapped = /^\$\{\{([\s\S]*)\}\}\s*(#.*)?$/.exec(raw);
    if (wrapped) return wrapped[1].trim();
    if (raw.startsWith('${{') || raw === '' || /^[|>]/.test(raw)) return null;
    const unquoted = /^"(.*)"$/.exec(raw);
    if (unquoted) return unquoted[1].trim();
    return raw.replace(/\s+#.*$/, '').trim();
};

/**
 * Walk an expression outside its single-quoted strings (GitHub's only string quote,
 * `''` escaping). Each step carries the paren depth before its character and whether it
 * sits inside a string; `depth` and `inString` at the end say whether the text closed.
 */
const walk = (expression) => {
    const steps = [];
    let depth = 0;
    let lowest = 0;
    let inString = false;
    for (let i = 0; i < expression.length; i += 1) {
        const char = expression[i];
        steps.push({char, i, depth, inString});
        if (char === "'" && inString && expression[i + 1] === "'") {
            steps.push({char, i: i + 1, depth, inString});
            i += 1;
        } else if (char === "'") inString = !inString;
        else if (!inString && char === '(') depth += 1;
        else if (!inString && char === ')') depth -= 1;
        lowest = Math.min(lowest, depth);
    }
    return {steps, depth, lowest, inString};
};

/** Whitespace removed outside strings, so `! cancelled ( )` and `!cancelled()` compare equal. */
export const canonical = (expression) =>
    walk(expression)
        .steps.filter(({char, inString}) => inString || !/\s/.test(char))
        .map(({char}) => char)
        .join('');

/** `(a && b)` is `a && b`: one pair of parens around the whole expression guarantees nothing extra. */
const unwrap = (expression) => {
    let current = expression.trim();
    while (current.startsWith('(') && current.endsWith(')')) {
        const closesEarly = walk(current).steps.some(
            (step) => !step.inString && step.char === ')' && step.depth === 1 && step.i < current.length - 1,
        );
        if (closesEarly) break;
        current = current.slice(1, -1).trim();
    }
    return current;
};

/**
 * Split an expression on its top-level `&&`.
 *
 * Returns `{conjuncts}` (canonical form) on success, `{disjunction: true}` when a
 * top-level `||` makes every term optional, or `{error}` when the text does not parse.
 */
export const topLevelConjuncts = (expression) => {
    const shape = walk(expression);
    if (shape.depth !== 0 || shape.lowest < 0 || shape.inString) {
        return {error: 'unbalanced parentheses or an unterminated string'};
    }
    const body = unwrap(expression);
    const parts = [];
    let start = 0;
    for (const {char, i, depth, inString} of walk(body).steps) {
        if (inString || depth !== 0 || body[i + 1] !== char) continue;
        if (char === '|') return {disjunction: true};
        if (char === '&') {
            parts.push(body.slice(start, i));
            start = i + 2;
        }
    }
    parts.push(body.slice(start));
    const conjuncts = parts.map((part) => canonical(unwrap(part)));
    if (conjuncts.some((part) => part === '')) return {error: "an empty operand around '&&'"};
    return {conjuncts};
};

/** Status-check functions called anywhere in the expression, outside strings, lower-cased. */
export const statusFunctions = (expression) => {
    const outside = walk(expression)
        .steps.map(({char, inString}) => (inString ? ' ' : char))
        .join('');
    return [...outside.matchAll(/\b(always|success|failure|cancelled)\s*\(\s*\)/gi)].map((match) =>
        match[1].toLowerCase(),
    );
};

/**
 * A job's `needs`, from the lines of its body: flow (`[a, b]`), scalar (`a`) or block
 * (`- a` lines below the key). Returns null when the job has no `needs:` key.
 */
export const readNeeds = (bodyLines, keyIndent) => {
    const at = bodyLines.findIndex((line) => new RegExp(`^ {${keyIndent}}needs:`).test(line));
    if (at === -1) return null;
    const unquote = (name) => name.trim().replace(/^(['"])(.*)\1$/, '$2');
    const inline = bodyLines[at]
        .slice(keyIndent + 'needs:'.length)
        .replace(/\s+#.*$/, '')
        .trim();
    if (inline.startsWith('[')) {
        return inline
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map(unquote)
            .filter((name) => name !== '');
    }
    if (inline !== '') return [unquote(inline)];
    const names = [];
    for (const line of bodyLines.slice(at + 1)) {
        const match = /^(\s*)(\S.*)$/.exec(line);
        if (!match || match[2].startsWith('#')) continue;
        if (match[1].length <= keyIndent) break;
        const item = /^-\s+(.+?)\s*(#.*)?$/.exec(match[2]);
        if (item) names.push(unquote(item[1]));
    }
    return names;
};

/**
 * Which jobs a fan-in rollup does not wait for. `jobs` is `[{name, needs}]` for every
 * job in the workflow, the rollup included. Returns `{error}` when the check would
 * prove nothing, otherwise `{missing}` (possibly empty) and the population it read.
 */
export const fanInGaps = (jobs, rollupName) => {
    const rollup = jobs.find((job) => job.name === rollupName);
    if (!rollup) return {error: `no '${rollupName}' job`};
    if (rollup.needs === null) return {error: `the '${rollupName}' job has no 'needs:'`};
    if (rollup.needs.length === 0) return {error: `the '${rollupName}' job's 'needs:' is empty`};
    const others = jobs.filter((job) => job.name !== rollupName).map((job) => job.name);
    if (others.length === 0)
        return {error: `no job besides '${rollupName}' was found, so the fan-in scan read nothing`};
    return {missing: others.filter((name) => !rollup.needs.includes(name)), population: others.length};
};
