/**
 * Command matching unit tests:
 *
 *     node --test tests/unit/
 *
 * The ranking is what the palette feels like, so it is pinned here rather
 * than left to eyeballing in a browser.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterCommands, normalizeQuery, scoreMatch } from '../../js/core/commands.js';

/**
 * @param {string} id
 * @param {Partial<import('../../js/core/commands.js').Command>} [fields]
 * @returns {import('../../js/core/commands.js').Command}
 */
function command(id, fields = {}) {
  return { id, label: id, group: 'Other', run: () => {}, ...fields };
}

describe('normalizeQuery', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeQuery('  UNdo  '), 'undo');
    assert.equal(normalizeQuery(undefined), '');
    assert.equal(normalizeQuery(12), '12');
  });
});

describe('scoreMatch', () => {
  it('matches an empty query against everything, weakly', () => {
    assert.equal(scoreMatch('', 'anything'), 0);
    assert.equal(scoreMatch('   ', 'anything'), 0);
  });

  it('ranks exact, prefix, word-start and mid-word distinctly', () => {
    assert.equal(scoreMatch('undo', 'Undo'), 1);
    assert.equal(scoreMatch('und', 'Undo'), 0.9);
    assert.equal(scoreMatch('project', 'Save the project file'), 0.85);
    assert.equal(scoreMatch('port', 'Import'), 0.75);
  });

  it('requires every letter of a subsequence match, in order', () => {
    const score = scoreMatch('expt', 'Export');
    assert.ok(score !== null && score >= 0.4 && score < 0.75, `got ${score}`);
    assert.equal(scoreMatch('zundo', 'Undo'), null, 'letters out of order do not match');
    assert.equal(scoreMatch('undone', 'Undo'), null, 'a missing letter does not match');
  });

  it('is case-insensitive', () => {
    assert.equal(scoreMatch('UNDO', 'undo'), 1);
    assert.equal(scoreMatch('ReD', 'Redo'), 0.9);
  });

  it('returns null when nothing matches', () => {
    assert.equal(scoreMatch('xyzzy', 'Undo'), null);
  });
});

describe('filterCommands', () => {
  const commands = [
    command('undo', { label: 'Undo', group: 'Edit', keys: 'ctrl+z' }),
    command('redo', { label: 'Redo', group: 'Edit', keys: 'ctrl+shift+z' }),
    command('export', { label: 'Export to a single HTML file', group: 'File' }),
    command('problems', { label: 'Show the Problems panel', group: 'View' }),
    command('palette', { label: 'Show all commands', group: 'View', detail: 'quick open' }),
  ];

  it('keeps the authored order for an empty query', () => {
    const result = filterCommands(commands, '');
    assert.deepEqual(
      result.map((entry) => entry.id),
      commands.map((entry) => entry.id)
    );
  });

  it('drops non-matches and ranks the rest best-first', () => {
    const result = filterCommands(commands, 'show');
    const ids = result.map((entry) => entry.id);
    assert.deepEqual(ids, ['problems', 'palette']);
  });

  it('matches against every field, including the hidden ones', () => {
    const byDetail = filterCommands(commands, 'quick');
    assert.deepEqual(
      byDetail.map((entry) => entry.id),
      ['palette']
    );

    const byGroup = filterCommands(commands, 'file');
    assert.deepEqual(
      byGroup.map((entry) => entry.id),
      ['export']
    );

    // An exact shortcut finds its binding and nothing else.
    const byExactKeys = filterCommands(commands, 'ctrl+shift+z');
    assert.deepEqual(
      byExactKeys.map((entry) => entry.id),
      ['redo']
    );

    // "ctrl+z" also subsequence-matches "ctrl+shift+z", so Redo rides along
    // behind Undo — searching by shortcut is meant to be forgiving.
    const byKeys = filterCommands(commands, 'ctrl+z');
    assert.equal(byKeys[0].id, 'undo');
  });

  it('ranks an exact label above a prefix above a subsequence', () => {
    const mixed = [
      command('print', { label: 'Print' }), // p-r-i-n-t: no 'e', not a subsequence of "pre"
      command('exact-1', { label: 'Pre' }),
      command('exact-2', { label: 'Pre' }),
      command('prefix', { label: 'Prepare pipeline' }),
    ];
    const result = filterCommands(mixed, 'pre');
    assert.deepEqual(
      result.map((entry) => entry.id),
      ['exact-1', 'exact-2', 'prefix']
    );
  });

  it('applies the limit after ranking', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      command(`cmd-${i}`, { label: `Command ${i}` })
    );
    const result = filterCommands(many, 'command', 4);
    assert.equal(result.length, 4);
    assert.deepEqual(
      result.map((entry) => entry.id),
      ['cmd-0', 'cmd-1', 'cmd-2', 'cmd-3']
    );
  });

  it('returns nothing when nothing matches', () => {
    assert.deepEqual(filterCommands(commands, 'qwertz'), []);
  });
});
