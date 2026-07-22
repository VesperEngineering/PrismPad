describe('PrismPad startup', () => {
  it('shows the approved welcome chooser, complete language list, and no IDE chrome', async () => {
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
    await expect($('[aria-label="Choose a language"]')).toBeDisplayed();

    for (const language of [
      'Plain Text', 'Python', 'Markdown', 'YAML', 'JSON', 'JavaScript', 'TypeScript', 'JSX', 'TSX',
      'HTML', 'CSS', 'Shell', 'PowerShell', 'Rust', 'C', 'C++', 'Java', 'SQL', 'TOML', 'XML'
    ]) {
      await expect($(`button=${language}`)).toExist();
    }

    for (const prohibitedLabel of ['Terminal', 'Debugger', 'Source Control', 'Extensions', 'Run']) {
      await expect($(`*=${prohibitedLabel}`)).not.toExist();
    }
  });
});
