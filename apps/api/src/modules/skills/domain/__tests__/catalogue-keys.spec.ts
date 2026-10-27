import {
  approvalOf,
  distinctNewSkills,
  type KeyedSkill,
  keyOwner,
  mergeOf,
  withAliases,
} from '../catalogue-keys.js';

const skill = (id: number, canonicalName: string, overrides: Partial<KeyedSkill> = {}): KeyedSkill => ({
  id,
  canonicalName,
  nameKey: canonicalName.toLowerCase().replace(/[\s.]+/g, ''),
  aliases: [],
  status: 'APPROVED',
  ...overrides,
});

const REACT = skill(1, 'React', { aliases: ['ReactJS'] });
const NODE = skill(2, 'Node.js', { nameKey: 'nodejs', aliases: ['NodeJS'] });
const REJECTED = skill(3, 'Foo', { status: 'REJECTED' });
const PENDING = skill(4, 'reactjs native', { status: 'PENDING' });

describe('distinctNewSkills (FR-13, AC-5)', () => {
  it('keeps one name per key, the first spelling, trimmed', () => {
    expect(distinctNewSkills([' Rust embedded ', 'rust-embedded', 'Go', 'GO'])).toEqual([
      { name: 'Rust embedded', key: 'rustembedded' },
      { name: 'Go', key: 'go' },
    ]);
  });

  it('drops names that have no key', () => {
    expect(distinctNewSkills(['...', ' - ', 'C#'])).toEqual([{ name: 'C#', key: 'c#' }]);
  });
});

describe('keyOwner (CONTEXT D39)', () => {
  const skills = [REACT, NODE, REJECTED, PENDING];

  it('finds an approved skill by name or alias key', () => {
    expect(keyOwner('react', skills, [])).toBe(REACT);
    expect(keyOwner('reactjs', skills, [])).toBe(REACT);
    expect(keyOwner('nodejs', skills, [])).toBe(NODE);
  });

  it('finds a reviewed or pending skill by name only', () => {
    expect(keyOwner('foo', skills, [])).toBe(REJECTED);
    expect(keyOwner('reactjsnative', skills, [])).toBe(PENDING);
    const rejectedWithAlias = skill(5, 'Bar', { status: 'REJECTED', aliases: ['Baz'] });
    expect(keyOwner('baz', [rejectedWithAlias], [])).toBeUndefined();
  });

  it('ignores the skills being written', () => {
    expect(keyOwner('reactjsnative', skills, [PENDING.id])).toBeUndefined();
    expect(keyOwner('react', skills, [REACT.id])).toBeUndefined();
  });

  it('prefers the approved owner when a pending name shares the key', () => {
    const pendingReact = skill(6, 'reactjs', { status: 'PENDING' });
    expect(keyOwner('reactjs', [pendingReact, REACT], [])).toBe(REACT);
  });
});

describe('withAliases', () => {
  it('adds each spelling once by key, never the canonical name', () => {
    expect(withAliases('React', ['ReactJS'], ['react.js', 'React', 'React JS Lib'])).toEqual(['ReactJS', 'React JS Lib']);
  });
});

describe('approvalOf (AC-7, AC-10)', () => {
  it('a rename keeps the written name as an alias and checks every spelling', () => {
    const approval = approvalOf(PENDING, 'React Native', 'FRAMEWORK');
    expect(approval).toEqual({
      canonicalName: 'React Native',
      nameKey: 'reactnative',
      aliases: ['reactjs native'],
      group: 'FRAMEWORK',
      names: [
        { name: 'React Native', key: 'reactnative' },
        { name: 'reactjs native', key: 'reactjsnative' },
      ],
    });
  });

  it('a change of case or separators only adds no alias', () => {
    const approval = approvalOf(skill(7, 'rust embedded', { status: 'PENDING' }), 'Rust-Embedded', 'LANGUAGE');
    expect(approval.aliases).toEqual([]);
    expect(approval.nameKey).toBe('rustembedded');
  });
});

describe('mergeOf (AC-7)', () => {
  it('adds the pending name to the target aliases', () => {
    expect(mergeOf(skill(8, 'React.js lib', { status: 'PENDING' }), REACT)).toEqual({
      aliases: ['ReactJS', 'React.js lib'],
      added: [{ name: 'React.js lib', key: 'reactjslib' }],
    });
  });

  it('adds nothing when the target already matches the name', () => {
    expect(mergeOf(skill(9, 'react js', { status: 'PENDING' }), REACT)).toEqual({ aliases: ['ReactJS'], added: [] });
  });
});
