describe('PrismPad document workflow', () => {
  const discardActiveDocument = async (): Promise<void> => {
    await $('[aria-label^="Close "]').click();
    const decision = $('[aria-labelledby="unsaved-dialog-title"] select');
    await decision.selectByAttribute('value', 'discard');
    await $('button=Continue').click();
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
  };

  it('creates and edits Python with a dirty indicator and key status labels', async () => {
    await $('button=Python').click();
    await expect($('[data-testid="status-language"]')).toHaveText('Python');
    await expect($('[data-testid="status-encoding"]')).toHaveText('UTF-8');
    expect(await $('[data-testid="status-line-ending"]').getText()).toMatch(/LF|CRLF/);

    const editor = $('[aria-label="Editor"] .cm-content');
    await editor.click();
    await browser.keys(['p', 'r', 'i', 'n', 't', '(', '1', ')']);
    await expect($('[role="tab"][aria-selected="true"]')).toHaveElementClass('is-dirty');
    await discardActiveDocument();
  });

  it('protects unsaved work when a dirty tab is closed', async () => {
    await $('button=Python').click();
    await $('[aria-label="Editor"] .cm-content').click();
    await browser.keys(['x']);
    await $('[aria-label^="Close "]').click();
    await expect($('[aria-labelledby="unsaved-dialog-title"]')).toBeDisplayed();
    await $('button=Cancel').click();
    await expect($('[role="tab"][aria-selected="true"]')).toExist();
    await discardActiveDocument();
  });

  it('renders the local Markdown preview without changing the language status', async () => {
    await $('button=Markdown').click();
    await $('[aria-label="Editor"] .cm-content').click();
    await browser.keys(['#', ' ', 'P', 'r', 'e', 'v', 'i', 'e', 'w']);
    await $('button=View').click();
    await $('button=Markdown preview').click();
    await expect($('[aria-label="Markdown preview"]')).toBeDisplayed();
    await expect($('[data-testid="status-language"]')).toHaveText('Markdown');
    await discardActiveDocument();
  });

  it('preserves settings persistence across a webview reload', async () => {
    await $('button=Plain Text').click();
    await $('[data-testid="status-indentation"]').click();
    const indentation = $('[aria-label="Indentation settings"] select');
    await indentation.selectByAttribute('value', 'tabs');
    await browser.waitUntil(async () => (await $('[data-testid="status-indentation"]').getText()).startsWith('Tabs'));
    await browser.refresh();
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
    await $('button=Plain Text').click();
    expect(await $('[data-testid="status-indentation"]').getText()).toContain('Tabs');
    await $('[aria-label^="Close "]').click();
    await expect($('h1=Hello! What will you code in today?')).toBeDisplayed();
  });

  it('supports tab drag reorder without IDE chrome', async () => {
    await $('button=Python').click();
    await $('button=File').click();
    await $('button=New').click();
    await $('button=File').click();
    await $('button=New').click();
    const tabs = await $$('[role="tab"]');
    expect(tabs).toHaveLength(3);
    const firstTitle = await tabs[0].getText();
    const secondTitle = await tabs[1].getText();
    const thirdTitle = await tabs[2].getText();
    await tabs[2].dragAndDrop(tabs[0]);
    await browser.waitUntil(async () => {
      const reordered = await $$('[role="tab"]');
      const titles = await reordered.map((tab) => tab.getText());
      return titles.join('\n') === [thirdTitle, firstTitle, secondTitle].join('\n');
    });
    const reordered = await $$('[role="tab"]');
    const reorderedTitles = await reordered.map((tab) => tab.getText());
    expect(reorderedTitles).toEqual([thirdTitle, firstTitle, secondTitle]);
    await $('[aria-label^="Close "]').click();
    await $('[aria-label^="Close "]').click();
    await $('[aria-label^="Close "]').click();
  });
});
