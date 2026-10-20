/**
 * Each reader is asserted in both directions: a parser that only ever sees the shape it
 * accepts cannot tell a working split from one that returns its input.
 */
import {describe, expect, it} from 'vitest';

import {
    canonical,
    expressionOf,
    fanInGaps,
    readNeeds,
    statusFunctions,
    topLevelConjuncts,
} from './validate-workflows.core.mjs';

const PUBLISH = "!cancelled() && needs.build.result == 'success' && needs.detect.outputs.publishable != 'false'";

describe('expressionOf', () => {
    it('unwraps ${{ … }} and drops a trailing comment', () => {
        expect(expressionOf('${{ !cancelled() }} # re-runs')).toBe('!cancelled()');
    });

    it('reads a bare expression, double-quoted or not', () => {
        expect(expressionOf("needs.a.result == 'success' # why")).toBe("needs.a.result == 'success'");
        expect(expressionOf('"!cancelled()"')).toBe('!cancelled()');
    });

    it('refuses shapes it does not read', () => {
        expect(expressionOf('${{ !cancelled()')).toBeNull();
        expect(expressionOf('>-')).toBeNull();
        expect(expressionOf('')).toBeNull();
    });
});

describe('canonical', () => {
    it('removes whitespace outside strings and keeps it inside', () => {
        expect(canonical("! cancelled ( ) && a == 'x  y'")).toBe("!cancelled()&&a=='x  y'");
    });
});

describe('topLevelConjuncts', () => {
    it('finds every top-level term of the publish condition', () => {
        expect(topLevelConjuncts(PUBLISH)).toEqual({
            conjuncts: ['!cancelled()', "needs.build.result=='success'", "needs.detect.outputs.publishable!='false'"],
        });
    });

    it('returns a single term for an expression with no &&', () => {
        expect(topLevelConjuncts('!cancelled()')).toEqual({conjuncts: ['!cancelled()']});
    });

    it('treats parens around the whole expression or a whole term as no parens', () => {
        expect(topLevelConjuncts('(a && (b))')).toEqual({conjuncts: ['a', 'b']});
    });

    it('keeps a parenthesised disjunct whole, so its terms are not top-level', () => {
        expect(topLevelConjuncts("(!cancelled() || x) && needs.build.result == 'success'")).toEqual({
            conjuncts: ['!cancelled()||x', "needs.build.result=='success'"],
        });
    });

    it('does not count a term behind a negation', () => {
        const result = topLevelConjuncts("!(needs.build.result == 'success') && b");
        expect(result.conjuncts).not.toContain("needs.build.result=='success'");
        expect(result.conjuncts).toContain("!(needs.build.result=='success')");
    });

    it('reports a top-level || as having no guaranteeing terms', () => {
        expect(topLevelConjuncts('!cancelled() || false')).toEqual({disjunction: true});
        expect(topLevelConjuncts(`${PUBLISH} || always()`)).toEqual({disjunction: true});
    });

    it('does not split on && or || inside a string', () => {
        expect(topLevelConjuncts("a == 'x && y || z' && b")).toEqual({conjuncts: ["a=='x && y || z'", 'b']});
        expect(topLevelConjuncts("a == 'it''s && b'")).toEqual({conjuncts: ["a=='it''s && b'"]});
    });

    it('refuses unbalanced or unterminated text', () => {
        expect(topLevelConjuncts('(a && b').error).toBeDefined();
        expect(topLevelConjuncts('a) && (b').error).toBeDefined();
        expect(topLevelConjuncts("a == 'x").error).toBeDefined();
        expect(topLevelConjuncts('a && ').error).toBeDefined();
    });
});

describe('statusFunctions', () => {
    it('lists status calls outside strings, lower-cased', () => {
        expect(statusFunctions("!cancelled() && Always() && success( ) && a == 'failure()'")).toEqual([
            'cancelled',
            'always',
            'success',
        ]);
    });

    it('lists nothing when there is no status call', () => {
        expect(statusFunctions("needs.a.result == 'success'")).toEqual([]);
    });
});

describe('readNeeds', () => {
    it('reads the flow form', () => {
        expect(readNeeds(['    runs-on: x', '    needs: [check, "browser-tests"] # lanes'], 4)).toEqual([
            'check',
            'browser-tests',
        ]);
    });

    it('reads the scalar form', () => {
        expect(readNeeds(['    needs: check'], 4)).toEqual(['check']);
    });

    it('reads the block form and stops at the next key', () => {
        expect(
            readNeeds(['    needs:', '        # lanes', '        - check', "        - 'b'", '    if: always()'], 4),
        ).toEqual(['check', 'b']);
    });

    it('ignores a needs: belonging to a deeper level', () => {
        expect(readNeeds(['    steps:', '        needs: [x]'], 4)).toBeNull();
    });

    it('distinguishes an empty needs from a missing one', () => {
        expect(readNeeds(['    needs: []'], 4)).toEqual([]);
        expect(readNeeds(['    if: always()'], 4)).toBeNull();
    });
});

describe('fanInGaps', () => {
    const job = (name, needs = null) => ({name, needs});

    it('passes when every other job is needed', () => {
        expect(fanInGaps([job('a'), job('b'), job('ci-passed', ['a', 'b'])], 'ci-passed')).toEqual({
            missing: [],
            population: 2,
        });
    });

    it('names a job the rollup does not need', () => {
        expect(fanInGaps([job('a'), job('new'), job('ci-passed', ['a'])], 'ci-passed').missing).toEqual(['new']);
    });

    it('fails when the check would prove nothing', () => {
        expect(fanInGaps([job('a')], 'ci-passed').error).toMatch(/no 'ci-passed' job/);
        expect(fanInGaps([job('a'), job('ci-passed')], 'ci-passed').error).toMatch(/no 'needs:'/);
        expect(fanInGaps([job('a'), job('ci-passed', [])], 'ci-passed').error).toMatch(/empty/);
        expect(fanInGaps([job('ci-passed', ['a'])], 'ci-passed').error).toMatch(/read nothing/);
    });
});
