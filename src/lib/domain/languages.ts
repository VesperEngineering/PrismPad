export type LanguageId =
  | 'plain'
  | 'python'
  | 'markdown'
  | 'yaml'
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'shell'
  | 'powershell'
  | 'rust'
  | 'c'
  | 'cpp'
  | 'java'
  | 'sql'
  | 'toml'
  | 'xml';

export type LanguageDefinition = Readonly<{
  id: LanguageId;
  label: string;
  extensions: readonly string[];
  defaultSuffix: string;
}>;

export const LANGUAGES: readonly LanguageDefinition[] = [
  { id: 'plain', label: 'Plain Text', extensions: ['.txt'], defaultSuffix: '.txt' },
  { id: 'python', label: 'Python', extensions: ['.py', '.pyw'], defaultSuffix: '.py' },
  { id: 'markdown', label: 'Markdown', extensions: ['.md', '.markdown'], defaultSuffix: '.md' },
  { id: 'yaml', label: 'YAML', extensions: ['.yaml', '.yml'], defaultSuffix: '.yaml' },
  { id: 'json', label: 'JSON', extensions: ['.json', '.jsonc'], defaultSuffix: '.json' },
  { id: 'javascript', label: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], defaultSuffix: '.js' },
  { id: 'typescript', label: 'TypeScript', extensions: ['.ts', '.mts', '.cts'], defaultSuffix: '.ts' },
  { id: 'jsx', label: 'JSX', extensions: ['.jsx'], defaultSuffix: '.jsx' },
  { id: 'tsx', label: 'TSX', extensions: ['.tsx'], defaultSuffix: '.tsx' },
  { id: 'html', label: 'HTML', extensions: ['.html', '.htm'], defaultSuffix: '.html' },
  { id: 'css', label: 'CSS', extensions: ['.css'], defaultSuffix: '.css' },
  { id: 'shell', label: 'Shell', extensions: ['.sh', '.bash', '.zsh'], defaultSuffix: '.sh' },
  { id: 'powershell', label: 'PowerShell', extensions: ['.ps1', '.psm1', '.psd1'], defaultSuffix: '.ps1' },
  { id: 'rust', label: 'Rust', extensions: ['.rs'], defaultSuffix: '.rs' },
  { id: 'c', label: 'C', extensions: ['.c', '.h'], defaultSuffix: '.c' },
  { id: 'cpp', label: 'C++', extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'], defaultSuffix: '.cpp' },
  { id: 'java', label: 'Java', extensions: ['.java'], defaultSuffix: '.java' },
  { id: 'sql', label: 'SQL', extensions: ['.sql'], defaultSuffix: '.sql' },
  { id: 'toml', label: 'TOML', extensions: ['.toml'], defaultSuffix: '.toml' },
  { id: 'xml', label: 'XML', extensions: ['.xml'], defaultSuffix: '.xml' }
] as const;

const PLAIN = LANGUAGES[0];

export const languageForPath = (path: string): LanguageDefinition => {
  const lower = path.toLowerCase();
  return LANGUAGES.find((language) => language.extensions.some((suffix) => lower.endsWith(suffix))) ?? PLAIN;
};

export const defaultSuffixFor = (id: LanguageId): string =>
  LANGUAGES.find((language) => language.id === id)?.defaultSuffix ?? '.txt';
