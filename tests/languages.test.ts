import { defaultSuffixFor, languageForPath } from '../src/lib/domain/languages';

it.each([
  ['script.PY', 'python'],
  ['README.md', 'markdown'],
  ['config.yml', 'yaml'],
  ['worker.psm1', 'powershell'],
  ['main.cpp', 'cpp'],
  ['unknown.binlog', 'plain']
])('maps %s to %s', (path, expected) => {
  expect(languageForPath(path).id).toBe(expected);
});

it('returns the primary suffix used by first save', () => {
  expect(defaultSuffixFor('python')).toBe('.py');
  expect(defaultSuffixFor('typescript')).toBe('.ts');
});
